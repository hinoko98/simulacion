"""Modelo de simulación de eventos discretos de una sala de urgencias (SimPy).

Flujo del paciente:  llegada -> triaje -> consulta médica -> (observación) -> salida

* Llegadas: proceso de Poisson no homogéneo (tasa distinta por hora del día),
  generado por adelgazamiento (thinning).
* Triaje: enfermeras, cola FIFO (el nivel de gravedad se conoce al terminar).
* Consulta: médicos con cola por prioridad (nivel 1 = más grave). Con
  `apropiativa=True` los niveles 1-2 interrumpen a un paciente de menor
  prioridad que esté siendo atendido; éste retoma con el tiempo restante.
* Observación: camas, también con cola por prioridad.

Unidad de tiempo: minutos.
"""
from __future__ import annotations

from dataclasses import dataclass, replace

import numpy as np
import pandas as pd
import simpy

NIVELES = (1, 2, 3, 4, 5)
NOMBRES_NIVEL = {
    1: "I Rojo (inmediata)",
    2: "II Naranja (muy urgente)",
    3: "III Amarillo (urgente)",
    4: "IV Verde (leve)",
    5: "V Azul (no urgente)",
}
# Triage colombiano (Resolución 5596 de 2015). Tiempo máximo hasta la primera atención médica:
# I inmediata y II <= 30 min vienen de la norma; III usa el tope de la franja 1-2 h;
# IV y V son SUPUESTOS editables. El nivel I tolera 1 min porque el tiempo avanza por pasos.
LIMITE_MIN = {1: 1, 2: 30, 3: 120, 4: 240, 5: 360}

# Prioridad del bloqueo que representa a un médico de refuerzo "ausente";
# debe ser mejor (menor) que la de cualquier paciente para que nunca se le adelanten.
_PRIORIDAD_BLOQUEO = -10


@dataclass(frozen=True)
class Config:
    # --- demanda ---
    tasa_base: float = 7.0  # pacientes/hora que llegan en promedio (antes del perfil)
    perfil_horario: tuple = (
        0.4, 0.3, 0.3, 0.25, 0.25, 0.3, 0.5, 0.7, 0.9, 1.1, 1.4, 1.5,
        1.4, 1.2, 1.1, 1.1, 1.2, 1.4, 1.5, 1.4, 1.2, 0.9, 0.7, 0.5,
    )
    prob_nivel: tuple = (0.03, 0.12, 0.35, 0.40, 0.10)

    # --- recursos ---
    enfermeras_triaje: int = 2
    medicos: int = 3
    camas: int = 8
    medicos_refuerzo: int = 0
    refuerzo_horas: tuple = (10, 20)  # [inicio, fin) del turno de refuerzo
    apropiativa: bool = False

    # --- tiempos de servicio (media en min, coef. de variación) ---
    triaje_media: float = 6.0
    triaje_cv: float = 0.4
    consulta_media: tuple = (45.0, 40.0, 28.0, 16.0, 10.0)
    consulta_cv: float = 0.6
    prob_observacion: tuple = (0.9, 0.6, 0.25, 0.05, 0.0)
    observacion_media: float = 150.0
    observacion_cv: float = 0.7

    # --- ejecución ---
    horizonte_dias: int = 14
    calentamiento_dias: int = 1  # se descarta para evitar el sesgo del arranque vacío
    semilla: int = 1

    # --- costos por hora (supuestos editables, COP) ---
    costo_medico_h: float = 45_000
    costo_enfermera_h: float = 20_000
    costo_cama_h: float = 5_000

    def con(self, **cambios) -> "Config":
        return replace(self, **cambios)


def costo_diario(cfg: Config) -> float:
    horas_refuerzo = max(0, cfg.refuerzo_horas[1] - cfg.refuerzo_horas[0])
    return (
        cfg.medicos * 24 * cfg.costo_medico_h
        + cfg.medicos_refuerzo * horas_refuerzo * cfg.costo_medico_h
        + cfg.enfermeras_triaje * 24 * cfg.costo_enfermera_h
        + cfg.camas * 24 * cfg.costo_cama_h
    )


def _lognormal(rng, media: float, cv: float) -> float:
    # Se parametriza por media y CV (más natural para datos operativos).
    s2 = np.log(1 + cv**2)
    return float(rng.lognormal(np.log(media) - s2 / 2, np.sqrt(s2)))


def _en_pico(cfg: Config, ahora: float) -> bool:
    h = (ahora % 1440) / 60
    return cfg.refuerzo_horas[0] <= h < cfg.refuerzo_horas[1]


def _min_hasta(hora: float, ahora: float) -> float:
    return (hora * 60 - ahora % 1440) % 1440


class _Sala:
    """Recursos y contadores compartidos por todos los procesos."""

    def __init__(self, env: simpy.Environment, cfg: Config):
        self.cfg = cfg
        self.triaje = simpy.Resource(env, cfg.enfermeras_triaje)
        self.medicos = simpy.PreemptiveResource(env, cfg.medicos + cfg.medicos_refuerzo)
        self.camas = simpy.PriorityResource(env, cfg.camas)
        self.bloq_activos = 0  # médicos de refuerzo "fuera de turno" que ya ocupan cupo
        self.bloq_pendientes = 0
        self.registros: list[dict] = []


def _llegadas(env, sala: _Sala, rng):
    cfg = sala.cfg
    maximo = max(cfg.perfil_horario)
    lam_max = cfg.tasa_base * maximo / 60  # pacientes/min
    n = 0
    while True:
        yield env.timeout(rng.exponential(1 / lam_max))
        hora = int((env.now % 1440) // 60)
        if rng.random() < cfg.perfil_horario[hora] / maximo:  # adelgazamiento
            n += 1
            # Todos los atributos se sortean aquí, en un solo flujo aleatorio, para
            # que escenarios distintos reciban exactamente los mismos pacientes
            # (números aleatorios comunes) y la comparación sea más precisa.
            nivel = int(rng.choice(NIVELES, p=cfg.prob_nivel))
            atributos = dict(
                id=n,
                llegada=env.now,
                nivel=nivel,
                t_triaje=_lognormal(rng, cfg.triaje_media, cfg.triaje_cv),
                t_consulta=_lognormal(rng, cfg.consulta_media[nivel - 1], cfg.consulta_cv),
                observa=bool(rng.random() < cfg.prob_observacion[nivel - 1]),
                t_obs=_lognormal(rng, cfg.observacion_media, cfg.observacion_cv),
            )
            env.process(_paciente(env, sala, atributos))


def _paciente(env, sala: _Sala, a: dict):
    cfg = sala.cfg
    nivel = a["nivel"]

    with sala.triaje.request() as req:
        yield req
        yield env.timeout(a["t_triaje"])
    fin_triaje = env.now

    restante = a["t_consulta"]
    primera = None
    interrupciones = 0
    puede_apropiar = cfg.apropiativa and nivel <= 2
    while restante > 1e-9:
        with sala.medicos.request(priority=nivel, preempt=puede_apropiar) as req:
            yield req
            if primera is None:
                primera = env.now
            inicio = env.now
            try:
                yield env.timeout(restante)
                restante = 0.0
            except simpy.Interrupt:
                # Fue desplazado: conserva lo que ya se le atendió.
                restante -= env.now - inicio
                interrupciones += 1
    fin_consulta = env.now

    espera_cama = 0.0
    if a["observa"]:
        t0 = env.now
        with sala.camas.request(priority=nivel) as req:
            yield req
            espera_cama = env.now - t0
            yield env.timeout(a["t_obs"])

    sala.registros.append(
        dict(
            id=a["id"],
            llegada=a["llegada"],
            nivel=nivel,
            espera=primera - fin_triaje,  # triaje -> primera atención médica
            espera_total=primera - a["llegada"],
            estancia=env.now - a["llegada"],
            espera_cama=espera_cama,
            interrupciones=interrupciones,
            fin_consulta=fin_consulta,
        )
    )


def _refuerzo(env, sala: _Sala):
    """Un médico de refuerzo: fuera de su turno ocupa un cupo para que no se use."""
    cfg = sala.cfg
    ini, fin = cfg.refuerzo_horas
    while True:
        if _en_pico(cfg, env.now):
            yield env.timeout(_min_hasta(fin, env.now))
        req = sala.medicos.request(priority=_PRIORIDAD_BLOQUEO, preempt=False)
        sala.bloq_pendientes += 1
        yield req
        sala.bloq_pendientes -= 1
        if _en_pico(cfg, env.now):  # esperó tanto que ya empezó su turno
            sala.medicos.release(req)
            continue
        sala.bloq_activos += 1
        yield env.timeout(_min_hasta(ini, env.now))
        sala.bloq_activos -= 1
        sala.medicos.release(req)


def _monitor(env, sala: _Sala, muestras: dict, desde: float):
    cfg = sala.cfg
    yield env.timeout(desde)
    while True:
        total = cfg.medicos + cfg.medicos_refuerzo
        disponibles = total - sala.bloq_activos
        ocupados = sala.medicos.count - sala.bloq_activos
        muestras["cola_medicos"].append(len(sala.medicos.queue) - sala.bloq_pendientes)
        muestras["util_medicos"].append(ocupados / disponibles if disponibles else 0)
        muestras["cola_triaje"].append(len(sala.triaje.queue))
        muestras["util_triaje"].append(sala.triaje.count / cfg.enfermeras_triaje)
        muestras["cola_camas"].append(len(sala.camas.queue))
        muestras["util_camas"].append(sala.camas.count / cfg.camas)
        yield env.timeout(1)


def simular(cfg: Config) -> tuple[dict, pd.DataFrame]:
    """Una réplica. Devuelve (métricas resumen, tabla de pacientes atendidos)."""
    rng = np.random.default_rng(cfg.semilla)
    env = simpy.Environment()
    sala = _Sala(env, cfg)
    muestras = {k: [] for k in (
        "cola_medicos", "util_medicos", "cola_triaje", "util_triaje", "cola_camas", "util_camas")}
    calentamiento = cfg.calentamiento_dias * 1440

    env.process(_llegadas(env, sala, rng))
    for _ in range(cfg.medicos_refuerzo):
        env.process(_refuerzo(env, sala))
    env.process(_monitor(env, sala, muestras, calentamiento))
    env.run(until=cfg.horizonte_dias * 1440)

    df = pd.DataFrame(sala.registros)
    # Pacientes que llegaron en el calentamiento se descartan; los que no
    # terminaron antes del fin no aparecen (censura despreciable con 14 días).
    df = df[df["llegada"] >= calentamiento].reset_index(drop=True)
    return _resumen(cfg, df, muestras), df


def _resumen(cfg: Config, df: pd.DataFrame, m: dict) -> dict:
    r: dict = {"pacientes": len(df)}
    for n in NIVELES:
        d = df[df["nivel"] == n]["espera"]
        r[f"espera_n{n}"] = d.mean() if len(d) else np.nan
        r[f"p90_n{n}"] = d.quantile(0.9) if len(d) else np.nan
        r[f"cumple_n{n}"] = (d <= LIMITE_MIN[n]).mean() * 100 if len(d) else np.nan
    r["espera_media"] = df["espera"].mean()
    r["espera_total_media"] = df["espera_total"].mean()
    r["estancia_media"] = df["estancia"].mean()
    r["espera_cama_media"] = df["espera_cama"].mean()
    r["interrupciones"] = df["interrupciones"].sum()
    for k, v in m.items():
        r[k] = float(np.mean(v)) * (100 if k.startswith("util") else 1)
    r["costo_dia"] = costo_diario(cfg)
    return r
