# Flujo catástrofe → resultados → optimización → recomendaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el juego siga el orden Simulación → Resultados → Optimización → Recomendaciones, con la optimización atada a la corrida simulada y las recomendaciones construidas sobre ambas, más ayudas emergentes en la tabla "Desempeño por nivel de triaje".

**Architecture:** El resultado resumido de la optimización se guarda dentro de la corrida (`corrida.opt`) y viaja con ella en `localStorage`. La lógica (resumir la optimización, derivar la recomendación numérica) vive en `js/analisis/` como datos puros probados con `node`; los paneles de `js/ui/` solo pintan.

**Tech Stack:** HTML + CSS + JavaScript sin dependencias (scripts IIFE con globales `Urg*`), pruebas con `node` y `assert`.

**Spec:** `docs/superpowers/specs/2026-11-13-flujo-optimizacion-recomendaciones-design.md`

## Global Constraints

- No tocar `juego/js/motor/sim.js`, el algoritmo de `optimizar/evaluar/analizar` ni nada de Python.
- Sin dependencias nuevas; textos de interfaz en español.
- La optimización nunca arranca sola: solo con su botón.
- El proyecto **no es un repositorio git**: no hay pasos de commit.
- Todo HTML generado con datos pasa por `esc()` como en el código existente.

## Review Focus

- Corridas antiguas en `localStorage` sin `opt` → Recomendaciones y Optimización se pintan sin error (prueba en Tarea 1).
- Corrida de "Día normal" seleccionada → Optimización muestra aviso, no lanza la búsqueda (verificación en Tarea 3).
- Ninguna combinación cumple la meta → la recomendación dice que es la más cercana, no "óptima" (prueba en Tarea 1).
- La dotación simulada ya es la óptima → sin cambios, recomendación de prioridad 3 (prueba en Tarea 1).
- Cambiar de corrida en el historial tras optimizar → Optimización y Recomendaciones muestran lo de la corrida nueva, no lo anterior (verificación en Tarea 3).

---

### Task 1: Datos puros — resumen de optimización y recomendación numérica

**Files:**
- Modify: `juego/js/analisis/optimizador.js`
- Modify: `juego/js/analisis/recomendaciones.js`
- Create: `juego/prueba_recom.js`

**Interfaces:**
- Produces: `UrgOptimizador.resumir(analisis, actual) -> Opt` donde
  `Opt = { meta, replicas, total, cumpleMeta, mejor: R, actual: R }` y
  `R = { m, e, c, muertosG, muertosGIc, cumpleG, cumpleGIc, costo }` (solo esos campos; `analisis` es lo que devuelve `analizar`, `actual` lo que devuelve `evaluar`).
- Produces: `UrgRecomendaciones.generar(corrida, historial)` añade al retorno `optimo`:
  `null` si `corrida.opt` no existe; si existe,
  `{ meta, replicas, total, cumpleMeta, mejor, actual, cambios: [{ recurso: 'medicos'|'enfermeras'|'camas', de, a }], ahorro, muertesEvitadas }`
  con `de` tomado de `corrida.cfg`, `a` de `opt.mejor`, solo recursos que cambian; `ahorro = actual.costo - mejor.costo`; `muertesEvitadas = actual.muertosG - mejor.muertosG`.
- Además `generar` añade una recomendación a `recs` cuando hay `opt`:
  - hay cambios y `cumpleMeta`: prio 1 si `muertesEvitadas > 0`, si no prio 2; título `Ajustar la dotación a la asignación óptima: médicos 4 → 6, camas 10 → 7` (solo los recursos que cambian, nombres `médicos`, `enfermeras de triaje`, `camas`).
  - hay cambios y `!cumpleMeta`: prio 1; título empieza por `Ninguna dotación alcanza la meta`.
  - sin cambios: prio 3; título `La dotación simulada ya es la óptima`.
  Cuando existe esta recomendación no se añade "Mantener el protocolo actual".

- [ ] **Step 1: Escribir la prueba que falla** en `juego/prueba_recom.js`

```js
// node prueba_recom.js
const assert = require('assert');
globalThis.window = globalThis;
globalThis.UrgSim = require('./js/motor/sim.js');
require('./js/analisis/recomendaciones.js');
const O = require('./js/analisis/optimizador.js');
const S = globalThis.UrgSim, R = globalThis.UrgRecomendaciones;

function corrida(cfgExtra) {
  const cfg = Object.assign({ escenario: 'bus', medicos: 4, enfermeras: 2, camas: 10, plan: true, apropiativa: true, derivar: true, semilla: 42 }, cfgExtra);
  const s = new S.Sim(cfg); let n = 0; while (!s.terminado && n++ < 20000) s.step();
  return { id: 1, cfg, res: s.resumen(), parcial: false };
}
const r = (m, e, c, muertosG, cumpleG, costo) => ({ m, e, c, muertosG, muertosGIc: 0, cumpleG, cumpleGIc: 0, costo, abandonos: 9, replicas: 3 });

// resumir: solo los campos del contrato
const an = { meta: 70, total: 140, cumpleMeta: true, mejor: r(6, 2, 7, 0, 80, 900), todos: [r(1, 1, 4, 5, 10, 100)], frontera: [], factibles: [] };
const opt = O.resumir(an, r(4, 2, 10, 2, 50, 1000));
assert.deepStrictEqual(Object.keys(opt).sort(), ['actual', 'cumpleMeta', 'mejor', 'meta', 'replicas', 'total']);
assert.strictEqual(opt.replicas, 3);
assert.deepStrictEqual(Object.keys(opt.mejor).sort(), ['c', 'costo', 'cumpleG', 'cumpleGIc', 'e', 'm', 'muertosG', 'muertosGIc']);

// sin opt (corridas antiguas): optimo null y no revienta
const base = corrida();
assert.strictEqual(R.generar(base, [base]).optimo, null);

// con opt y cambios
const a = R.generar(Object.assign({}, base, { opt }), [base]);
assert.deepStrictEqual(a.optimo.cambios, [{ recurso: 'medicos', de: 4, a: 6 }, { recurso: 'camas', de: 10, a: 7 }]);
assert.strictEqual(a.optimo.ahorro, 100);
assert.strictEqual(a.optimo.muertesEvitadas, 2);
const rec = a.recs.find(x => x.titulo.startsWith('Ajustar la dotación'));
assert.ok(rec && rec.prio === 1);
assert.ok(rec.titulo.includes('médicos 4 → 6') && rec.titulo.includes('camas 10 → 7') && !rec.titulo.includes('enfermeras'));

// ninguna combinación cumple la meta
const b = R.generar(Object.assign({}, base, { opt: Object.assign({}, opt, { cumpleMeta: false }) }), [base]);
assert.ok(b.recs.some(x => x.prio === 1 && x.titulo.startsWith('Ninguna dotación alcanza la meta')));

// la dotación simulada ya es la óptima
const igual = Object.assign({}, opt, { mejor: r(4, 2, 10, 0, 80, 1000), actual: r(4, 2, 10, 0, 80, 1000) });
const c = R.generar(Object.assign({}, base, { opt: igual }), [base]);
assert.deepStrictEqual(c.optimo.cambios, []);
assert.ok(c.recs.some(x => x.prio === 3 && x.titulo === 'La dotación simulada ya es la óptima'));
assert.ok(!c.recs.some(x => x.titulo === 'Mantener el protocolo actual'));
console.log('prueba_recom OK');
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `node juego/prueba_recom.js` (desde `D:\proyectos\ts\simulacion`)
Expected: FAIL con `O.resumir is not a function`

- [ ] **Step 3: Implementar `resumir(analisis, actual)` en `optimizador.js`** y exportarla en `root.UrgOptimizador`. `replicas` sale de `analisis.todos[0].replicas`.

- [ ] **Step 4: Implementar `optimo` y la recomendación numérica en `generar`** (`recomendaciones.js`), antes del bloque "9. Si todo va bien". El `detalle` de la recomendación incluye fallecidos I-III y % a tiempo de actual y óptima, la meta y las réplicas; `impacto` menciona ahorro o costo adicional por turno en COP.

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `node juego/prueba_recom.js` → `prueba_recom OK`. Run: `node juego/prueba.js` (desde `juego/`) → sigue imprimiendo las 12 líneas sin error.

---

### Task 2: Panel de Optimización atado a la corrida

**Files:**
- Modify: `juego/js/ui/panelOpt.js` (reescritura del panel; conserva `fila`, `pm`, `cop`)

**Interfaces:**
- Consumes: `UrgOptimizador.resumir` (Tarea 1); `UrgResultados.etiquetaCorrida(corrida)`.
- Produces: `UrgPanelOpt.render(cont, sel, api)` — sustituye a `init`. `sel` es la corrida seleccionada o `null`. `api = { guardar(idCorrida, opt), aplicar(corrida, { medicos, enfermeras, camas }), irA(vista) }`.

Comportamiento:
- `sel === null` → `<div class="vacio">` "Primero simula una catástrofe" con botón `data-ir="sim"`.
- `S.ESCENARIOS[sel.cfg.escenario].evento === false` → tarjeta `card aviso`: el día normal no necesita optimización de desastre.
- Si no: cabecera "Optimización de recursos" + línea "Para la corrida: {etiquetaCorrida} · {n} víctimas · {m}/{e}/{c} méd/enf/camas · semilla {s}"; controles meta (por defecto `sel.opt ? sel.opt.meta : 70`) y réplicas (por defecto `sel.opt ? sel.opt.replicas : 5`); botón "⚙ Buscar la mejor asignación".
- La búsqueda usa `base = Object.assign({}, sel.cfg, { manual: false })`. Al terminar: `api.guardar(sel.id, resumir(a, evaluar(base, base.medicos, base.enfermeras, base.camas, replicas)))` y pinta el detalle completo (recomendada, frontera, otras opciones) como hoy.
- El detalle completo (frontera/factibles) se guarda en memoria del módulo con clave `sel.id`; si se vuelve a una corrida que tiene `sel.opt` pero no detalle en memoria (p. ej. tras recargar), se pinta solo la tarjeta de asignación recomendada desde `sel.opt` con la nota "Vuelve a buscar para ver la frontera completa".
- Bajo la tarjeta recomendada: botones "▶ Aplicar en Simulación" (`api.aplicar(sel, {…mejor})`) y "💡 Ver recomendaciones →" (`api.irA('rec')`).
- Si el usuario cambia de pestaña o de corrida mientras corre la búsqueda, el resultado se guarda igualmente en su corrida (`api.guardar` con el id capturado) pero solo se pinta si `cont` sigue mostrando esa corrida.

- [ ] **Step 1: Reescribir `panelOpt.js`** según lo anterior.
- [ ] **Step 2: Verificar sintaxis** — Run: `node --check juego/js/ui/panelOpt.js` → sin salida.

---

### Task 3: Orden nuevo, cableado y persistencia

**Files:**
- Modify: `juego/index.html` (nav líneas 13-16, banner línea 91-92, orden de `<section>` 98-100)
- Modify: `juego/js/ui/app.js`

**Interfaces:**
- Consumes: `UrgPanelOpt.render(cont, sel, api)` (Tarea 2).

- [ ] **Step 1: `index.html`** — nav en orden `sim`, `res`, `opt`, `rec` (el badge `#nRuns` sigue en Resultados); secciones en orden `v-sim`, `v-res`, `v-opt`, `v-rec`; banner de fin con tres botones: `btnVerRes` "📊 Ver resultados" (prim), `btnVerOpt` "⚙ Optimizar recursos" (sec), `btnVerRec` "💡 Recomendaciones" (sec). Subtítulo de Optimización en el menú sin cambios.
- [ ] **Step 2: `app.js`**
  - Quitar `optListo`; en `irA`: `if (v === 'opt') UrgPanelOpt.render($('v-opt'), seleccion(), apiOpt)`.
  - `apiOpt.guardar(id, opt)`: asigna `opt` a la corrida con ese id en `runs` y llama `persistir()`.
  - `apiOpt.aplicar(corrida, d)`: carga en el formulario `escenario`, `plan`, `apropiativa`, `derivar`, `realismo`, `semilla` y las víctimas (`corrida.cfg.victimasNivel`) de la corrida; pone `manual` en `false`; fija médicos/enfermeras/camas a `d`; luego `etiquetas(); reiniciar(); irA('sim')`. No llamar a `cambioEscenario()` (pisaría las víctimas).
  - `$('btnVerOpt').onclick = () => irA('opt')`.
  - Delegación en `<main>`: clic en cualquier `[data-ir]` → `irA(dataset.ir)` (lo usan los botones de paso siguiente de los paneles).
  - "Borrar historial" sigue vaciando `runs` (los `opt` se van con ellas).
- [ ] **Step 3: Verificar** — `node --check juego/js/ui/app.js`. Luego en navegador (`juego/index.html`): simular "Accidente de bus" con ⏭; el menú se lee Simulación/Resultados/Optimización/Recomendaciones; Optimización nombra la corrida; cambiar los controles de Simulación **no** cambia lo que Optimización dice que optimiza; seleccionar otra fila del historial y volver a Optimización muestra esa otra corrida; una corrida "Día normal" muestra el aviso; recargar la página conserva la tarjeta recomendada; consola sin errores.

---

### Task 4: Resultados — ayudas emergentes y paso siguiente

**Files:**
- Modify: `juego/js/ui/resultados.js:45-53`
- Modify: `juego/css/style.css`

- [ ] **Step 1: Tooltips.** Cada `<th>` de "Desempeño por nivel de triaje" pasa a `<th><span class="tip" tabindex="0" data-tip="…">Nombre</span></th>`, y el nombre de cada nivel en la primera columna igual, con estos textos:

| Nombre | `data-tip` |
|---|---|
| Triage | Nivel de prioridad asignado en la clasificación (Res. 5596/2015): I es el más grave, V el menos. |
| Llegados | Pacientes de este nivel que entraron a urgencias durante la simulación. |
| Atendidos | Pacientes de este nivel que alcanzaron a ser vistos por un médico. |
| Espera media | Tiempo promedio desde la llegada hasta que los ve el médico. |
| P90 | Percentil 90: 9 de cada 10 pacientes esperaron este tiempo o menos. Muestra los peores casos, que el promedio esconde. |
| Límite | Tiempo máximo de espera que la norma permite para este nivel. |
| Cumple | Porcentaje de pacientes atendidos dentro del límite. Verde ≥ 85 %, rojo < 60 %. |
| Fallecidos | Pacientes de este nivel que murieron esperando atención. |
| Abandonos | Pacientes que se cansaron de esperar y se fueron sin ser atendidos. |
| Derivados | Pacientes enviados a otros hospitales porque este estaba desbordado. |
| (fila de nivel n) | `{DESC[n]}. Debe ser atendido en máximo {LIMITE[n]} min.` |

- [ ] **Step 2: CSS** `.tip` — subrayado punteado, `cursor: help`, `position: relative`; `.tip:hover::after, .tip:focus::after` muestra `attr(data-tip)` en burbuja oscura (`#263238`, texto blanco, 12px, `width: max-content; max-width: 240px; white-space: normal`, `z-index: 20`) **debajo** del nombre. La burbuja no debe recortarse: el `.tabla-wrap` de esta tabla recibe clase `con-tips` con `padding-bottom` suficiente (o `overflow: visible` en escritorio); las dos últimas columnas alinean la burbuja a la derecha (`.tip.der::after { right: 0; left: auto }`).
- [ ] **Step 3: Paso siguiente.** Tras los KPIs, tarjeta `card` "Siguiente paso: optimizar los recursos para esta catástrofe" con botón `class="prim" data-ir="opt"` "⚙ Optimizar recursos →"; si `sel.opt` existe el texto es "Esta corrida ya está optimizada" y añade un segundo botón `data-ir="rec"` "💡 Ver recomendaciones →".
- [ ] **Step 4: Verificar en navegador** — pasar el cursor por las 10 cabeceras y los 5 niveles: sale cada mensaje completo, sin recortes y sin barra de desplazamiento nueva; con Tab también aparecen; el botón lleva a Optimización.

---

### Task 5: Recomendaciones unidas a la optimización

**Files:**
- Modify: `juego/js/ui/panelRecom.js`
- Modify: `juego/css/style.css` (solo si la tabla comparativa necesita estilo)

**Interfaces:**
- Consumes: `generar(...).optimo` (Tarea 1).

- [ ] **Step 1:** Inmediatamente después de la cabecera:
  - `a.optimo` existe → `card` "Asignación óptima para esta catástrofe" (o "Ninguna dotación alcanza la meta: esta es la más cercana" con clase `aviso` si `!cumpleMeta`): tabla de 3 filas × 6 columnas (Médicos, Enfermeras de triaje, Camas, Fallecidos I-III, Cumple I-III, Costo del turno) con filas "Lo que simulaste", "Asignación óptima" y "Diferencia"; pie con meta, réplicas y combinaciones evaluadas. Formato `± IC` y COP igual que en `panelOpt.js`.
  - `a.optimo === null` y el escenario tiene evento → `card aviso` "Aún no has optimizado esta catástrofe: las recomendaciones de recursos serán generales hasta que lo hagas" con botón `data-ir="opt"` "⚙ Optimizar recursos →".
- [ ] **Step 2:** Cabecera: "Basadas en el triage (Res. 5596/2015), en la corrida {etiqueta}" + ", y en su optimización de recursos" cuando hay `optimo`.
- [ ] **Step 3:** Tarjeta final "Cómo probarlas": cuando hay `optimo` con cambios, el texto indica volver a Optimización y pulsar "Aplicar en Simulación" para repetir la misma catástrofe (mismos pacientes, semilla {s}) con la dotación óptima; si no, se conserva el texto actual.
- [ ] **Step 4: Verificación completa en navegador** — recorrido entero: simular → Resultados → Optimizar → Recomendaciones. La tarjeta comparativa muestra los mismos números que Optimización; la primera acción de recursos lleva cifras "de → a"; una corrida sin optimizar muestra el aviso con botón; "Aplicar en Simulación" deja el formulario con el escenario, víctimas y semilla de la corrida y la dotación óptima; consola sin errores. Run final: `node juego/prueba_recom.js` → `prueba_recom OK`.
