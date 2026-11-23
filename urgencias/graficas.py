"""Gráficas sobre `matplotlib.figure.Figure` (sirven para la GUI y para guardar PNG)."""
from __future__ import annotations

import numpy as np
from matplotlib.figure import Figure

from .experimentos import cumplimiento_clinico
from .modelo import LIMITE_MIN, NIVELES, NOMBRES_NIVEL

_ETIQ = [NOMBRES_NIVEL[n] for n in NIVELES]


def espera_por_nivel(fig: Figure, tabla_resumen) -> None:
    """tabla_resumen: salida de experimentos.resumir()."""
    fig.clear()
    ax1, ax2 = fig.subplots(1, 2)
    x = np.arange(len(NIVELES))
    media = [tabla_resumen.loc[f"espera_n{n}", "media"] for n in NIVELES]
    err = [tabla_resumen.loc[f"espera_n{n}", "ic95"] for n in NIVELES]
    ax1.bar(x, media, yerr=np.nan_to_num(err), color="#4C78A8", capsize=4, label="Espera media (IC 95 %)")
    ax1.step(np.r_[x - .5, x[-1] + .5], [LIMITE_MIN[n] for n in NIVELES] + [LIMITE_MIN[5]],
             where="post", color="#E45756", label="Límite de triage (Res. 5596)")
    ax1.set_xticks(x, _ETIQ, rotation=20)
    ax1.set_ylabel("min hasta primera atención médica")
    ax1.set_yscale("symlog", linthresh=10)
    ax1.legend(fontsize=8)
    ax1.set_title("Espera por nivel de triaje")

    cumple = [tabla_resumen.loc[f"cumple_n{n}", "media"] for n in NIVELES]
    ax2.bar(x, cumple, color=["#54A24B" if c >= 90 else "#F58518" if c >= 70 else "#E45756" for c in cumple])
    ax2.axhline(90, ls="--", color="gray", lw=1)
    ax2.set_ylim(0, 105)
    ax2.set_xticks(x, _ETIQ, rotation=20)
    ax2.set_ylabel("% que cumple el límite")
    ax2.set_title("Cumplimiento del tiempo máximo")
    fig.tight_layout()


def comparacion(fig: Figure, tabla) -> None:
    """tabla: salida de experimentos.comparar()."""
    fig.clear()
    ax1, ax2 = fig.subplots(1, 2)
    nombres = list(tabla.index)
    y = np.arange(len(nombres))
    ancho = 0.8 / 3
    for k, n in enumerate((1, 2, 3)):
        ax1.barh(y + k * ancho, tabla[f"cumple_n{n}"], ancho, label=NOMBRES_NIVEL[n])
    ax1.set_yticks(y + ancho, nombres, fontsize=8)
    ax1.invert_yaxis()
    ax1.axvline(90, ls="--", color="gray", lw=1)
    ax1.set_xlabel("% cumplimiento")
    ax1.set_title("Cumplimiento niveles 1-3")
    ax1.legend(fontsize=8)

    costo = tabla["costo_dia"] / 1e6
    cumpl = cumplimiento_clinico(tabla)
    ax2.scatter(costo, cumpl, color="#4C78A8")
    for nombre in nombres:
        ax2.annotate(nombre, (costo[nombre], cumpl[nombre]), fontsize=7, xytext=(4, 3), textcoords="offset points")
    ax2.axhline(90, ls="--", color="gray", lw=1)
    ax2.set_xlabel("Costo diario (millones COP)")
    ax2.set_ylabel("% cumplimiento niveles 1-3")
    ax2.set_title("Costo vs. oportunidad")
    fig.tight_layout()
