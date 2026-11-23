"""Línea de comandos del simulador de urgencias.

    python main.py simular    [--reps 20] [--medicos 3] ...
    python main.py escenarios [--reps 20] [--salida resultados]
    python main.py validar
    python main.py ajustar datos.csv columna
    python main.py gui
    python main.py juego
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd
from matplotlib.figure import Figure

from urgencias import caracterizacion, graficas, validacion
from urgencias.experimentos import ESCENARIOS, comparar, cumplimiento_clinico, recomendar, replicar, resumir
from urgencias.modelo import Config, NIVELES, NOMBRES_NIVEL

# La consola de Windows usa cp1252 y falla con λ, ±, —; se fuerza UTF-8.
sys.stdout.reconfigure(encoding="utf-8")
pd.set_option("display.width", 200)
pd.set_option("display.max_columns", 30)


def _config(a) -> Config:
    return Config(
        tasa_base=a.tasa, medicos=a.medicos, enfermeras_triaje=a.enfermeras, camas=a.camas,
        medicos_refuerzo=a.refuerzo, apropiativa=a.apropiativa, horizonte_dias=a.dias, semilla=a.semilla,
    )


def _guardar(fig: Figure, ruta: Path) -> None:
    fig.set_size_inches(12, 5)
    fig.savefig(ruta, dpi=130)
    print(f"Gráfica guardada en {ruta}")


def cmd_simular(a) -> None:
    cfg = _config(a)
    reps, _ = replicar(cfg, a.reps)
    t = resumir(reps)
    filas = [dict(nivel=NOMBRES_NIVEL[n],
                  espera_min=t.loc[f"espera_n{n}", "media"], ic95=t.loc[f"espera_n{n}", "ic95"],
                  p90_min=t.loc[f"p90_n{n}", "media"], cumple_pct=t.loc[f"cumple_n{n}", "media"])
             for n in NIVELES]
    print(f"\n{a.reps} réplicas de {cfg.horizonte_dias} días ({int(t.loc['pacientes', 'media'])} pacientes/réplica)\n")
    print(pd.DataFrame(filas).round(1).to_string(index=False))
    print("\nUtilización (%):  médicos {:.0f}  triaje {:.0f}  camas {:.0f}".format(
        *(t.loc[f"util_{k}", "media"] for k in ("medicos", "triaje", "camas"))))
    print("Cola media:       médicos {:.2f}  triaje {:.2f}  camas {:.2f}".format(
        *(t.loc[f"cola_{k}", "media"] for k in ("medicos", "triaje", "camas"))))
    print(f"Estancia media: {t.loc['estancia_media', 'media']:.0f} min   Costo/día: ${t.loc['costo_dia', 'media']:,.0f}")
    if a.salida:
        salida = Path(a.salida)
        salida.mkdir(exist_ok=True)
        fig = Figure()
        graficas.espera_por_nivel(fig, t)
        _guardar(fig, salida / "simulacion.png")


def cmd_escenarios(a) -> None:
    tabla = comparar(_config(a), n_rep=a.reps, progreso=lambda i, n: print(f"  escenario {i}/{n}", end="\r"))
    vista = tabla[[f"cumple_n{n}" for n in (1, 2, 3, 4, 5)] + ["espera_n3", "util_medicos", "costo_dia"]].copy()
    vista["cumple_1-3"] = cumplimiento_clinico(tabla)
    print("\n" + vista.round(1).to_string())
    nombre, motivo = recomendar(tabla, a.meta)
    print(f"\nRecomendado: {nombre} — {motivo}")
    salida = Path(a.salida)
    salida.mkdir(exist_ok=True)
    tabla.to_csv(salida / "escenarios.csv", encoding="utf-8-sig")
    fig = Figure()
    graficas.comparacion(fig, tabla)
    _guardar(fig, salida / "escenarios.png")


def cmd_validar(_a) -> None:
    m = validacion.validar_mmc()
    print(f"M/M/c  Wq teórico {m['teorico']:.3f}  simulado {m['simulado']:.3f} ± {m['ic95']:.3f}  -> {'OK' if m['ok'] else 'REVISAR'}")
    l = validacion.validar_little()
    print(f"Little L medida {l['L_medida']:.3f}  λ·W {l['L_little']:.3f}  error {l['error_rel']:.1%}")


def cmd_ajustar(a) -> None:
    print(caracterizacion.ajustar_csv(a.archivo, a.columna).to_string(index=False))


def cmd_gui(_a) -> None:
    from gui import abrir
    abrir()


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    def comunes(sp):
        d = Config()
        sp.add_argument("--reps", type=int, default=20)
        sp.add_argument("--tasa", type=float, default=d.tasa_base, help="pacientes/hora promedio")
        sp.add_argument("--medicos", type=int, default=d.medicos)
        sp.add_argument("--enfermeras", type=int, default=d.enfermeras_triaje)
        sp.add_argument("--camas", type=int, default=d.camas)
        sp.add_argument("--refuerzo", type=int, default=0, help="médicos extra en horas pico")
        sp.add_argument("--apropiativa", action="store_true")
        sp.add_argument("--dias", type=int, default=d.horizonte_dias)
        sp.add_argument("--semilla", type=int, default=d.semilla)

    s = sub.add_parser("simular", help="un escenario con réplicas e IC 95 %")
    comunes(s)
    s.add_argument("--salida", help="carpeta donde guardar la gráfica")
    s.set_defaults(f=cmd_simular)

    s = sub.add_parser("escenarios", help="compara los escenarios prospectivos")
    comunes(s)
    s.add_argument("--salida", default="resultados")
    s.add_argument("--meta", type=float, default=90.0, help="%% de cumplimiento niveles 1-3 exigido")
    s.set_defaults(f=cmd_escenarios)

    sub.add_parser("validar", help="M/M/c vs Erlang C y ley de Little").set_defaults(f=cmd_validar)

    s = sub.add_parser("ajustar", help="ajusta distribuciones a una columna de un CSV")
    s.add_argument("archivo")
    s.add_argument("columna")
    s.set_defaults(f=cmd_ajustar)

    sub.add_parser("gui", help="interfaz gráfica").set_defaults(f=cmd_gui)

    s = sub.add_parser("juego", help="juego visual de catástrofes (abre el navegador)")
    s.add_argument("--puerto", type=int, default=8080)
    s.add_argument("--no-abrir", action="store_true")
    s.set_defaults(f=lambda a: __import__("juego").servir(a.puerto, not a.no_abrir))

    # Sin argumentos se abre la interfaz gráfica (lo más natural al hacer doble clic o `python main.py`).
    a = p.parse_args(sys.argv[1:] or ["gui"])
    a.f(a)


if __name__ == "__main__":
    main()
