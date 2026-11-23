"""Verificación y validación del modelo.

1. M/M/c: un modelo simple con el mismo motor se compara con la fórmula exacta de
   Erlang C (si no coincide, el motor o la medición están mal).
2. Ley de Little sobre el modelo completo: L = λ·W entre cola de médicos y espera.
3. Comparación contra datos históricos reales (CSV) si el usuario los entrega.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
import simpy
from scipy import stats

from .experimentos import replicar
from .modelo import Config, NIVELES


def erlang_c_wq(lam: float, mu: float, c: int) -> float:
    """Espera media en cola teórica de un M/M/c (lam y mu por unidad de tiempo)."""
    a = lam / mu
    rho = a / c
    if rho >= 1:
        return math.inf
    suma = sum(a**k / math.factorial(k) for k in range(c))
    cola = a**c / (math.factorial(c) * (1 - rho))
    p_espera = cola / (suma + cola)
    return p_espera / (c * mu - lam)


def simular_mmc(lam: float, mu: float, c: int, n_clientes: int, semilla: int) -> float:
    rng = np.random.default_rng(semilla)
    env = simpy.Environment()
    servidores = simpy.Resource(env, c)
    esperas: list[float] = []

    def cliente():
        t0 = env.now
        with servidores.request() as req:
            yield req
            esperas.append(env.now - t0)
            yield env.timeout(rng.exponential(1 / mu))

    def fuente():
        for _ in range(n_clientes):
            yield env.timeout(rng.exponential(1 / lam))
            env.process(cliente())

    env.process(fuente())
    env.run()
    return float(np.mean(esperas[len(esperas) // 10:]))  # descarta el 10 % inicial


def validar_mmc(lam=0.9, mu=0.4, c=3, n_rep=30, n_clientes=20_000) -> dict:
    sims = [simular_mmc(lam, mu, c, n_clientes, s) for s in range(n_rep)]
    media = float(np.mean(sims))
    ic = float(stats.t.ppf(0.975, n_rep - 1) * np.std(sims, ddof=1) / np.sqrt(n_rep))
    teorico = erlang_c_wq(lam, mu, c)
    return dict(teorico=teorico, simulado=media, ic95=ic, ok=abs(media - teorico) <= ic * 1.5 + 0.02 * teorico)


def validar_little(cfg: Config | None = None, n_rep: int = 10) -> dict:
    """L (cola de médicos muestreada) frente a λ·Wq medidos en la misma ventana."""
    cfg = (cfg or Config()).con(apropiativa=False, medicos_refuerzo=0)
    reps, pac = replicar(cfg, n_rep)
    dias = cfg.horizonte_dias - cfg.calentamiento_dias
    lam = len(pac) / n_rep / (dias * 1440)
    wq = pac["espera"].mean()
    l_medida = reps["cola_medicos"].mean()
    return dict(L_medida=l_medida, L_little=lam * wq, error_rel=abs(l_medida - lam * wq) / max(l_medida, 1e-9))


def contrastar_historico(pacientes_sim: pd.DataFrame, historico: pd.DataFrame, columna="espera") -> pd.DataFrame:
    """Prueba KS por nivel entre la espera simulada y la histórica.

    `historico` debe tener columnas `nivel` y `columna` (en minutos).
    """
    filas = []
    for n in NIVELES:
        s = pacientes_sim.loc[pacientes_sim["nivel"] == n, columna]
        h = historico.loc[historico["nivel"] == n, columna]
        if len(s) < 5 or len(h) < 5:
            continue
        ks = stats.ks_2samp(s, h)
        filas.append(dict(nivel=n, media_sim=s.mean(), media_hist=h.mean(),
                          ks=ks.statistic, p_valor=ks.pvalue, coincide=ks.pvalue > 0.05))
    return pd.DataFrame(filas)
