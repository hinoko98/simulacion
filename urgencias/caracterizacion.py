"""Ajuste de distribuciones de probabilidad a datos reales (objetivo específico 1)."""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

CANDIDATAS = {
    "exponencial": stats.expon,
    "gamma": stats.gamma,
    "lognormal": stats.lognorm,
    "weibull": stats.weibull_min,
    "erlang/normal": stats.norm,
}


def ajustar(datos, candidatas: dict | None = None) -> pd.DataFrame:
    """Ajusta por máxima verosimilitud y ordena por estadístico KS (menor = mejor).

    Para tiempos entre arribos o de servicio positivos. Se fija loc=0 salvo en la
    normal, porque un tiempo no puede ser negativo.
    """
    x = np.asarray(datos, dtype=float)
    x = x[np.isfinite(x) & (x > 0)]
    filas = []
    for nombre, dist in (candidatas or CANDIDATAS).items():
        try:
            params = dist.fit(x) if dist is stats.norm else dist.fit(x, floc=0)
            ks = stats.kstest(x, dist.name, args=params)
            filas.append(dict(distribucion=nombre, parametros=tuple(round(p, 4) for p in params),
                              ks=ks.statistic, p_valor=ks.pvalue))
        except Exception:  # un ajuste fallido no debe tumbar a los demás
            continue
    return pd.DataFrame(filas).sort_values("ks").reset_index(drop=True)


def ajustar_csv(ruta: str, columna: str) -> pd.DataFrame:
    return ajustar(pd.read_csv(ruta)[columna])
