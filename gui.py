"""Interfaz Tkinter: parámetros a la izquierda, gráficas y tabla a la derecha."""
from __future__ import annotations

import threading
import tkinter as tk
from tkinter import messagebox, ttk

from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.figure import Figure

from urgencias import graficas
from urgencias.experimentos import comparar, cumplimiento_clinico, recomendar, replicar, resumir
from urgencias.modelo import Config, NIVELES, NOMBRES_NIVEL


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Simulación de urgencias hospitalarias — UTS")
        self.geometry("1150x680")
        d = Config()
        self.vars = {
            "tasa_base": tk.DoubleVar(value=d.tasa_base),
            "medicos": tk.IntVar(value=d.medicos),
            "enfermeras_triaje": tk.IntVar(value=d.enfermeras_triaje),
            "camas": tk.IntVar(value=d.camas),
            "medicos_refuerzo": tk.IntVar(value=0),
            "horizonte_dias": tk.IntVar(value=d.horizonte_dias),
            "reps": tk.IntVar(value=10),
            "apropiativa": tk.BooleanVar(value=False),
        }

        panel = ttk.LabelFrame(self, text="Parámetros", padding=8)
        panel.pack(side="left", fill="y", padx=8, pady=8)
        etiquetas = [
            ("Llegadas (pac/h)", "tasa_base"), ("Médicos", "medicos"), ("Enfermeras triaje", "enfermeras_triaje"),
            ("Camas observación", "camas"), ("Médicos refuerzo pico", "medicos_refuerzo"),
            ("Días simulados", "horizonte_dias"), ("Réplicas", "reps"),
        ]
        for i, (texto, clave) in enumerate(etiquetas):
            ttk.Label(panel, text=texto).grid(row=i, column=0, sticky="w", pady=2)
            ttk.Spinbox(panel, from_=0, to=200, width=7, textvariable=self.vars[clave]).grid(row=i, column=1, padx=4)
        ttk.Checkbutton(panel, text="Prioridad apropiativa (niveles 1-2)", variable=self.vars["apropiativa"]).grid(
            row=len(etiquetas), column=0, columnspan=2, sticky="w", pady=6)
        self.b_sim = ttk.Button(panel, text="Simular", command=lambda: self._lanzar(self._simular))
        self.b_sim.grid(row=20, column=0, columnspan=2, sticky="ew", pady=2)
        self.b_cmp = ttk.Button(panel, text="Comparar escenarios", command=lambda: self._lanzar(self._comparar))
        self.b_cmp.grid(row=21, column=0, columnspan=2, sticky="ew", pady=2)
        self.estado = ttk.Label(panel, text="Listo", wraplength=190, foreground="#555")
        self.estado.grid(row=22, column=0, columnspan=2, sticky="w", pady=8)

        der = ttk.Frame(self)
        der.pack(side="left", fill="both", expand=True, padx=(0, 8), pady=8)
        self.fig = Figure(figsize=(8, 3.6))
        self.canvas = FigureCanvasTkAgg(self.fig, master=der)
        self.canvas.get_tk_widget().pack(fill="both", expand=True)
        self.tabla = ttk.Treeview(der, show="headings", height=9)
        self.tabla.pack(fill="x", pady=(6, 0))

    def _config(self) -> Config:
        v = {k: x.get() for k, x in self.vars.items()}
        return Config(
            tasa_base=v["tasa_base"], medicos=v["medicos"], enfermeras_triaje=v["enfermeras_triaje"],
            camas=v["camas"], medicos_refuerzo=v["medicos_refuerzo"], apropiativa=v["apropiativa"],
            horizonte_dias=v["horizonte_dias"],
        )

    def _lanzar(self, tarea) -> None:
        try:
            cfg, reps = self._config(), self.vars["reps"].get()
        except tk.TclError:
            messagebox.showerror("Parámetros", "Revisa que todos los campos sean números.")
            return
        for b in (self.b_sim, self.b_cmp):
            b.state(["disabled"])
        # La simulación corre en otro hilo para que la ventana no se congele;
        # los resultados vuelven al hilo de Tk con after().
        def trabajo():
            try:
                resultado = tarea(cfg, reps)
                self.after(0, lambda: self._mostrar(*resultado))
            except Exception as e:
                self.after(0, lambda: messagebox.showerror("Error", str(e)))
            finally:
                self.after(0, self._liberar)
        threading.Thread(target=trabajo, daemon=True).start()

    def _liberar(self) -> None:
        for b in (self.b_sim, self.b_cmp):
            b.state(["!disabled"])

    def _estado(self, texto: str) -> None:
        self.after(0, lambda: self.estado.config(text=texto))

    def _simular(self, cfg: Config, reps: int):
        self._estado("Simulando…")
        r, _ = replicar(cfg, reps, progreso=lambda i, n: self._estado(f"Réplica {i}/{n}"))
        t = resumir(r)
        cols = ("Nivel", "Espera media", "P90", "% cumple", "")
        filas = [(NOMBRES_NIVEL[n], f"{t.loc[f'espera_n{n}', 'media']:.1f} min",
                  f"{t.loc[f'p90_n{n}', 'media']:.1f} min", f"{t.loc[f'cumple_n{n}', 'media']:.1f} %", "") for n in NIVELES]
        filas.append(("Utilización", f"Médicos {t.loc['util_medicos', 'media']:.0f} %",
                      f"Triaje {t.loc['util_triaje', 'media']:.0f} %", f"Camas {t.loc['util_camas', 'media']:.0f} %", ""))
        return "sim", t, cols, filas, "Simulación terminada"

    def _comparar(self, cfg: Config, reps: int):
        self._estado("Comparando escenarios…")
        tabla = comparar(cfg, n_rep=reps, progreso=lambda i, n: self._estado(f"Escenario {i}/{n}"))
        cumpl = cumplimiento_clinico(tabla)
        cols = ("Escenario", "% niv. 1-3", "Espera niv. 3", "Util. médicos", "Costo/día")
        filas = [(n, f"{cumpl[n]:.1f}", f"{tabla.loc[n, 'espera_n3']:.1f} min",
                  f"{tabla.loc[n, 'util_medicos']:.0f} %", f"${tabla.loc[n, 'costo_dia']:,.0f}") for n in tabla.index]
        mejor, motivo = recomendar(tabla)
        return "cmp", tabla, cols, filas, f"Recomendado: {mejor} ({motivo})"

    def _mostrar(self, tipo, datos, cols, filas, mensaje) -> None:
        (graficas.espera_por_nivel if tipo == "sim" else graficas.comparacion)(self.fig, datos)
        self.canvas.draw_idle()
        self.tabla.delete(*self.tabla.get_children())
        self.tabla["columns"] = cols
        for c in cols:
            self.tabla.heading(c, text=c)
            self.tabla.column(c, width=180 if c in ("Escenario", "Nivel") else 110, anchor="w")
        for f in filas:
            self.tabla.insert("", "end", values=f)
        self.estado.config(text=mensaje)


def abrir() -> None:
    App().mainloop()


if __name__ == "__main__":
    abrir()
