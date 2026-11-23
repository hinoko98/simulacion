# Flujo catástrofe → resultados → optimización → recomendaciones

Fecha: 2026-11-13 · Estado: aprobado por el usuario · Ámbito: `juego/` (HTML/JS sin dependencias)

## Por qué

El proyecto es la "Optimización del Sistema de Asignación de Recursos y Tiempos de Espera en Salas de
Urgencias mediante Simulación de Eventos Discretos con Colas de Prioridad". El juego debe contar esa
historia en orden: se simula la catástrofe, se ven sus resultados, se optimizan los recursos **para esa
misma catástrofe** y se cierran con recomendaciones coherentes con lo simulado y lo optimizado.

Hoy el menú va Simulación → Optimización → Resultados → Recomendaciones, la optimización lee los
controles del formulario (no la corrida simulada) y las recomendaciones ignoran la optimización.

## Objetivos

1. **Orden nuevo** en el menú lateral y en el aviso de fin de simulación:
   Simulación → Resultados → Optimización → Recomendaciones. Cada pantalla ofrece un botón al paso
   siguiente ("Optimizar recursos →" en Resultados, "Ver recomendaciones →" en Optimización).
2. **Optimización atada a la corrida seleccionada**: usa la `cfg` de la corrida (escenario, víctimas por
   nivel, plan, apropiativa, derivar, realismo, semilla) y muestra cuál es. Sin corrida: estado vacío que
   pide simular. Día normal: aviso de que no aplica.
3. **Resultado de optimización guardado junto a la corrida** (`corrida.opt`, versión resumida: meta,
   réplicas, cumpleMeta, mejor, actual, total). Al cambiar de corrida en el historial cambia todo junto.
4. **Recomendaciones unidas**: si la corrida tiene `opt`, primera tarjeta "Asignación óptima para esta
   catástrofe" comparando actual vs. óptima (médicos, enfermeras, camas, fallecidos I-III, cumplimiento,
   costo) y las acciones de recursos llevan cifras ("pasar de 4 a 6 médicos"). Si no tiene `opt`, aviso
   con botón para optimizar.
5. **Ayudas en "Desempeño por nivel de triaje"** (Resultados): al pasar el cursor (o enfocar con teclado)
   sobre el nombre de cada columna y de cada nivel aparece un mensaje que explica qué significa.

## No objetivos

- No cambiar el motor (`sim.js`), el algoritmo del optimizador ni la parte Python.
- La optimización no arranca sola: se lanza con su botón (tarda segundos).

## Enfoques considerados

- **A (elegido): optimización atada a la corrida y guardada en ella.** Un único hilo: todo lo que se ve
  en las tres pestañas habla de la misma corrida.
- B: solo reordenar botones y dejar la optimización leyendo el formulario. Descartado: mantiene la
  desconexión que motivó el cambio.
- C: optimizar automáticamente al terminar la simulación. Descartado: bloquea varios segundos sin que
  el usuario lo pida.

## Decisiones del constructor (no pedidas explícitamente)

- "Aplicar en Simulación" se mantiene y además carga escenario, víctimas y semilla de la corrida para
  que los pacientes sean los mismos.
- Los tooltips son CSS propios (`data-tip`), no el atributo `title`, para que salgan de inmediato y
  funcionen con foco de teclado.
- Las corridas parciales se pueden optimizar (la optimización depende de la `cfg`, no del resultado).
- La lógica nueva de recomendaciones se añade en `recomendaciones.js` (datos puros) y se prueba con
  `node` igual que `juego/prueba.js`.
