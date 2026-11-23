# Simulación de urgencias hospitalarias (eventos discretos + colas de prioridad)

Proyecto de aula – Simulación Digital, UTS. Modelo en SimPy del flujo
llegada → triaje → consulta médica → observación.

## Uso

```
pip install -r requirements.txt
python main.py gui                       # interfaz gráfica
python juego.py                          # juego visual (http://localhost:8080) de catástrofes (navegador, sin dependencias)
python main.py simular --reps 20         # un escenario con IC 95 %
python main.py escenarios --reps 20      # compara escenarios, guarda resultados/
python main.py validar                   # M/M/c vs Erlang C y ley de Little
python main.py ajustar datos.csv col     # ajuste de distribuciones a datos reales
```

## Correspondencia con los objetivos específicos

| Objetivo | Dónde |
|---|---|
| 1. Caracterizar variables estocásticas | `urgencias/caracterizacion.py` (ajuste MLE + KS) y `Config` en `modelo.py` |
| 2. Modelo conceptual y computacional | `urgencias/modelo.py` (prioridad no apropiativa y apropiativa) |
| 3. Validación estadística | `urgencias/validacion.py` (Erlang C, Little, KS contra histórico) |
| 4. Escenarios prospectivos | `urgencias/experimentos.py` (`ESCENARIOS`, costo y recomendación) |

## Supuestos a reemplazar con datos reales

Los parámetros de `Config` (llegadas por hora, medias de servicio, proporción por
nivel de triaje, costos en COP) son **supuestos razonables, no datos de un hospital**.
Para la sustentación hay que ajustarlos con datos reales del centro estudiado
(`ajustar`) y contrastar con `validacion.contrastar_historico`.

- Niveles de triage: Res. 5596/2015 (I rojo … V azul); límites en `LIMITE_MIN` (IV y V son supuestos).
- Escenarios con los mismos pacientes (números aleatorios comunes) para comparar mejor.
- Se descarta 1 día de calentamiento; los pacientes sin atender al final se omiten.

## Juego visual de catástrofes (`juego/`)

Abrir `juego/index.html` en el navegador (no requiere instalar nada).

```
juego/
├── index.html                  # página principal con la barra lateral izquierda
├── css/style.css               # estilos
├── prueba.js                   # prueba del motor:  node prueba.js
└── js/
    ├── motor/sim.js            # MOTOR: modelo de eventos (triaje, médicos, camas, plan, derivación)
    ├── vista/render.js         # VISTA: dibuja el hospital, pacientes, médicos, enfermeras, ambulancias
    ├── analisis/recomendaciones.js  # ANÁLISIS: reglas que generan recomendaciones según triaje
    └── ui/
        ├── app.js              # controles, pestañas, bucle y guardado del historial
        ├── resultados.js       # pestaña Resultados
        └── panelRecom.js       # pestaña Recomendaciones
```

Pestañas, en el orden del flujo: **Simulación** (el hospital en vivo) → **Resultados** (KPIs, tabla
por nivel de triaje con ayudas al pasar el cursor, línea de tiempo, historial comparable) →
**Optimización** (eliges qué simulación optimizar; a partir de sus resultados —muertes antes de
clasificar, muertes esperando médico, colas, utilización— decide paso a paso a quién convocar de refuerzo:
médicos, enfermeras de triaje o camas de sobrecarga, con refuerzos limitados que llegan con demora; muestra
cada paso con su porqué y cuánto cuesta convocar tarde) → **Recomendaciones** (la primera es el plan de
respuesta optimizado; las demás reglas por triaje se ajustan a él). El resultado de la optimización se guarda
junto a la corrida. Con la misma semilla los pacientes son idénticos entre
corridas, así que las diferencias se deben solo a tus decisiones.

Pruebas: `node prueba.js` (motor), `node prueba_opt.js` (refuerzos y optimizador) y `node prueba_recom.js` (unión optimización → recomendaciones).

Documento del proyecto (objetivos específicos y registro de avance): `docs/proyecto_aula.md`.
