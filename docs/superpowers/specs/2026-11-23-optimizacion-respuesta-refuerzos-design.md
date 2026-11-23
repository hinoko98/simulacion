# Optimización guiada por los resultados: respuesta con refuerzos

Fecha: 2026-11-23 · Estado: borrador para aprobación · Ámbito: `juego/` (HTML/JS sin dependencias)

## Por qué

El flujo Simulación → Resultados → Optimización → Recomendaciones ya existe (spec 2026-11-13), pero la
optimización no usa los resultados: de la corrida solo toma la catástrofe y barre 140 dotaciones fijas
(médicos 1-7 × enfermeras 1-4 × camas 4-16) como si estuvieran completas desde el minuto 0. El usuario
quiere que la optimización **parta de lo que mostró la simulación** y que sea **realista**: durante una
catástrofe no se elige la plantilla del turno, se decide **a quién llamar de refuerzo**, sabiendo que
los refuerzos son limitados y tardan en llegar. Las recomendaciones van después de la optimización.

## Objetivos

1. **Refuerzos como decisión.** El motor acepta cuántos médicos, enfermeras y camas de sobrecarga se
   convocan, en lugar de los fijos 3/2/6 actuales.
2. **Optimizador guiado por diagnóstico (enfoque elegido).** Parte de la dotación de la corrida sin
   refuerzos, lee sus resultados, identifica el cuello de botella y añade refuerzos paso a paso donde
   más rinden por peso, hasta cumplir la meta o agotar los disponibles. Cierra con una revisión de
   vecinos para quitar refuerzos que sobran.
3. **Cada paso queda explicado** con el dato que lo justificó (p. ej. "+1 enfermera: 12 pacientes
   esperaban triaje y 3 graves murieron sin clasificar; utilización de triaje 97 %").
4. **Efecto de la demora.** Con la respuesta final, se mide cuánto cambia el resultado si los refuerzos
   se convocan al recibir la alerta, a los 10 min (actual) o a los 30 min.
5. **Recomendaciones a partir de la optimización**: la primera tarjeta es el plan de respuesta ("convocar
   2 médicos y 1 enfermera, abrir 4 camas, al activar el plan") con sus pasos y el efecto de la demora.

## No objetivos

- No cambiar la parte Python (`urgencias/`).
- No optimizar plan / apropiativa / derivación: se mantienen como en la corrida (salvo lo dicho del plan abajo).
- No garantizar el óptimo global; es una heurística explicable.

## Anti-objetivos

- Que la optimización vuelva a ignorar los resultados (p. ej. evaluar siempre todos los recursos a ciegas).
- Que proponga refuerzos que no existen (más de los disponibles) o que llegan instantáneamente.

## Enfoques considerados

- **1 (elegido): guiado por resultados, paso a paso, con revisión final de vecinos.** Rápido (decenas de
  simulaciones), cada paso explicable, cuenta la historia del proyecto en la sustentación.
- 2: barrido completo de refuerzos × momento de llamada. Descartado: lento y no usa lo que mostraron
  los resultados, que es justo lo pedido.
- (Previo, opción A) planear la dotación del turno: descartado por el usuario a favor de la respuesta
  durante la catástrofe.

## Diseño

### Motor (`js/motor/sim.js`)

- `cfg.refuerzos = { medicos, enfermeras, camas }`. Por defecto `{3, 2, 6}` (comportamiento actual,
  las pruebas existentes no cambian). Se sigue recortando por `MAXDOC/MAXENF/MAXCAMA`.
- `cfg.llamada` = minutos tras la alerta en que se activa el plan y se convoca. Por defecto 10 (actual).
  Las demoras de llegada se mantienen: enfermeras +20, médicos +30, camas +40 desde la llamada.
- El modo comandante usa las mismas cantidades de `cfg.refuerzos`.
- `resumen()` añade la hora de llegada de cada tipo de refuerzo (para el costo).

### Supuestos de realismo (propuestos por Claude, editables en la pestaña)

- Disponibles como máximo: **4 médicos, 3 enfermeras, 8 camas de sobrecarga**.
- Costo: solo el de los refuerzos (la plantilla base es igual en todas las opciones), pagado desde su
  llegada hasta el fin del horizonte, con las tarifas por hora actuales (`COSTO_H`).
- La optimización evalúa con el plan activo: sin plan no hay convocatoria. Si la corrida no usó plan,
  se avisa y las recomendaciones lo marcan como primera acción.

### Optimizador (`js/analisis/optimizador.js`, reemplaza el barrido)

Estado = refuerzos `(rm, re, rc)`, empieza en `(0, 0, 0)`. Cada estado se evalúa con `réplicas`
semillas (números aleatorios comunes, como hoy) y media ± IC 95 %.

Por paso:
1. **Diagnóstico** sobre los resultados del estado actual (la primera vez, equivalentes a la corrida
   sin refuerzos):
   - enfermeras: muertes I-III antes de clasificar > 0, o pico de cola de triaje ≥ 8, o utilización > 85 %;
   - médicos: muertes I-III esperando médico > 0, o cumplimiento I-III < meta con utilización > 85 %;
   - camas: utilización > 85 % o ≥ 3 pacientes esperando cama.
2. **Candidatos** = solo los recursos señalados que aún tengan disponibles (+1 médico, +1 enfermera,
   +2 camas). Si ninguno está señalado pero no se cumple la meta, se prueban todos los disponibles.
3. Se simula cada candidato y se elige el de mayor beneficio por peso:
   beneficio = 100 × (fallecidos I-III evitados) + (puntos de cumplimiento I-III ganados).
4. Se detiene si cumple la meta (0 fallecidos I-III de media y cumplimiento ≥ meta), si ningún
   candidato mejora, o si no quedan refuerzos.

Revisión final: probar quitar una unidad de cada recurso; si sigue cumpliendo (o no empeora cuando la
meta es inalcanzable) y es más barato, se acepta; repetir hasta que no cambie.

Después: medir la respuesta final con llamada a 0, 10 y 30 min (efecto de la demora).

Salida guardada en la corrida (`corrida.opt`): meta, réplicas, límites, `pasos[]` (diagnóstico,
decisión, métricas, costo acumulado), `final`, `cumpleMeta`, `demora[]`, y el antes/después de la misma
catástrofe como hoy.

### Pestaña Optimización (`js/ui/panelOpt.js`)

**1. Elegir qué simulación optimizar** (pedido del usuario: que no sea genérico). Lo primero de la
pestaña es un selector con las corridas del historial que se pueden optimizar:

```
Simulación a optimizar: [ #3 · Sismo · 70 víctimas · 4/2/10 · sin plan · 9 fallecidos I-III · 41 % a tiempo ▾ ]
                          #5 · Bus · 30 víctimas · 3/2/8 · con plan · 0 fallecidos · 85 % a tiempo · ✓ optimizada
```

- Solo aparecen corridas de catástrofe; no aparecen el día normal ni las corridas generadas por una
  optimización (`deOpt`).
- Cada opción muestra número, escenario, víctimas, dotación base, si usó plan, fallecidos I-III,
  cumplimiento I-III y si ya está optimizada.
- Cambiar el selector cambia la corrida seleccionada de toda la app (la misma que en Resultados y
  Recomendaciones), y la pestaña muestra la optimización guardada de esa corrida si la tiene.
- Sin corridas de catástrofe: estado vacío con botón "Ir a Simulación".

**2. Diagnóstico de la simulación elegida**, antes del botón: la tarjeta con los resultados de los que
parte el optimizador (fallecidos I-III antes de clasificar y esperando médico, picos de cola, utilización
de médicos, enfermeras y camas, y el cuello de botella detectado), para que se vea qué se va a corregir.

**3. Controles**: meta, réplicas, disponibles (médicos/enfermeras/camas).
- Tabla de pasos: Paso · Diagnóstico · Decisión · Fallecidos I-III (± IC) · Cumple I-III (± IC) · Costo.
- Tarjeta "Respuesta recomendada" + antes/después + tabla de efecto de la demora.

### Recomendaciones (`js/analisis/recomendaciones.js`)

- La tarjeta de optimización pasa a ser el plan de respuesta, con cifras y el efecto de la demora
  ("convocar a los 30 min en vez de al alertar cuesta X fallecidos graves").
- Las reglas actuales se mantienen; cuando chocan con la optimización (p. ej. "reforzar médicos" pero
  la optimización no añadió médicos) manda la optimización.

## Pruebas

- `node prueba.js`: refuerzos por defecto dan los mismos números que hoy; `refuerzos {0,0,0}` no
  convoca a nadie; `llamada` cambia la hora de llegada.
- `node prueba_recom.js`: el optimizador termina, respeta los límites, cada paso tiene diagnóstico y la
  tarjeta de recomendaciones usa el plan final.

## Decisiones de Claude (revísalas)

- Disponibles 4/3/8, costo solo de refuerzos desde su llegada, beneficio 100 × vidas + cumplimiento.
- Paso de camas de 2 en 2 (son baratas y de 1 en 1 apenas se nota).
- El momento de llamada no se optimiza (llamar antes siempre gana y no cuesta más); se muestra como
  efecto de la demora para la recomendación.
- El selector de Optimización comparte la selección con Resultados y Recomendaciones (una sola corrida
  activa en toda la app); las corridas generadas por una optimización no se ofrecen para optimizar.
- Se reemplaza el barrido de dotación anterior en lugar de mantener las dos optimizaciones.
- Umbrales del diagnóstico (85 %, cola ≥ 8, ≥ 3 esperando cama) tomados de las reglas actuales de
  recomendaciones, para que diagnóstico y recomendaciones digan lo mismo.
