"""Réplicas independientes, intervalos de confianza y comparación de escenarios."""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from .modelo import Config, NIVELES, simular


def replicar(cfg: Config, n_rep: int = 20, progreso=None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Corre n_rep réplicas con semillas cfg.semilla..+n_rep-1.

    Devuelve (métricas por réplica, pacientes de todas las réplicas).
    Usar las mismas semillas en todos los escenarios da números aleatorios comunes.
    """
    filas, pacientes = [], []
    for i in range(n_rep):
        resumen, df = simular(cfg.con(semilla=cfg.semilla + i))
        filas.append(resumen)
        pacientes.append(df.assign(replica=i))
        if progreso:
            progreso(i + 1, n_rep)
    return pd.DataFrame(filas), pd.concat(pacientes, ignore_index=True)


def ic95(serie: pd.Series) -> tuple[float, float]:
    """Media y semiancho del IC 95 % (t de Student) entre réplicas."""
    x = serie.dropna().to_numpy()
    if len(x) < 2:
        return (float(x.mean()) if len(x) else np.nan), np.nan
    return float(x.mean()), float(stats.t.ppf(0.975, len(x) - 1) * x.std(ddof=1) / np.sqrt(len(x)))


def resumir(reps: pd.DataFrame) -> pd.DataFrame:
    """Tabla métrica -> media, ic95 sobre las réplicas."""
    filas = {c: ic95(reps[c]) for c in reps.columns}
    return pd.DataFrame(filas, index=["media", "ic95"]).T


# Escenarios prospectivos (objetivo específico 4).
ESCENARIOS: dict[str, dict] = {
    "Base": {},
    "Refuerzo pico +1 médico": dict(medicos_refuerzo=1),
    "Refuerzo pico +2 médicos": dict(medicos_refuerzo=2),
    "Triaje apropiativo": dict(apropiativa=True),
    "Triaje +1 enfermera": dict(enfermeras_triaje=3),
    "+1 consultorio fijo": dict(medicos=4),
    "+4 camas observación": dict(camas=12),
    "Refuerzo +1 y apropiativo": dict(medicos_refuerzo=1, apropiativa=True),
}


def comparar(base: Config, escenarios: dict[str, dict] | None = None, n_rep: int = 20,
             progreso=None) -> pd.DataFrame:
    """Una fila por escenario con media e IC95 de cada métrica (columnas `x` y `x_ic`)."""
    escenarios = escenarios or ESCENARIOS
    filas = []
    for i, (nombre, cambios) in enumerate(escenarios.items()):
        reps, _ = replicar(base.con(**cambios), n_rep)
        t = resumir(reps)
        fila = {"escenario": nombre}
        for m, (media, ic) in t[["media", "ic95"]].iterrows():
            fila[m], fila[f"{m}_ic"] = media, ic
        filas.append(fila)
        if progreso:
            progreso(i + 1, len(escenarios))
    return pd.DataFrame(filas).set_index("escenario")


def cumplimiento_clinico(tabla: pd.DataFrame) -> pd.Series:
    """% de cumplimiento medio de los niveles 1-3 (los de mayor riesgo)."""
    return tabla[[f"cumple_n{n}" for n in (1, 2, 3)]].mean(axis=1)


def recomendar(tabla: pd.DataFrame, meta: float = 90.0) -> tuple[str, str]:
    """Escenario más barato que logra `meta` % en niveles 1-3; si ninguno, el de mayor cumplimiento."""
    cumpl = cumplimiento_clinico(tabla)
    viables = tabla[cumpl >= meta]
    if len(viables):
        nombre = viables["costo_dia"].idxmin()
        return nombre, f"el más económico con ≥ {meta:.0f} % de cumplimiento en niveles 1-3"
    nombre = cumpl.idxmax()
    return nombre, f"ninguno alcanza {meta:.0f} %; es el de mayor cumplimiento ({cumpl[nombre]:.1f} %)"
