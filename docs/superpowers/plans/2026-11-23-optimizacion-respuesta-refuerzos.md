# Optimización guiada por resultados (refuerzos) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el barrido de dotaciones por un optimizador de refuerzos guiado por el diagnóstico de la corrida elegida, con selector de corrida, efecto de la demora y recomendaciones basadas en el plan de respuesta.

**Architecture:** El motor acepta `cfg.refuerzos` y `cfg.llamada`. `optimizador.js` expone diagnóstico + búsqueda voraz + revisión de vecinos + demora (datos puros, probados con node). La UI (`panelOpt.js`, `panelRecom.js`, `resultados.js`, `app.js`) solo pinta.

**Tech Stack:** HTML/JS sin dependencias (IIFE sobre `window`/`globalThis`), pruebas con `node` + `assert`.

**Spec:** `docs/superpowers/specs/2026-11-23-optimizacion-respuesta-refuerzos-design.md`

## Global Constraints

- Sin dependencias nuevas; los módulos siguen funcionando en navegador y en node.
- Defaults del motor: `refuerzos {medicos:3, enfermeras:2, camas:6}`, `llamada 10`; demoras de llegada +20 enf, +30 méd, +40 camas desde la llamada.
- Disponibles por defecto: 4 médicos, 3 enfermeras, 8 camas. Paso: +1 méd, +1 enf, +2 camas.
- Beneficio = 100 × fallecidos I-III evitados + puntos de cumplimiento I-III; se elige mayor beneficio / Δcosto.
- Costo = solo refuerzos, desde su llegada hasta el horizonte, con `COSTO_H`.
- Umbrales de diagnóstico: utilización > 85 %, cola de triaje ≥ 8, ≥ 3 esperando cama.
- Demora evaluada con llamada a 0, 10 y 30 min.
- Textos de la interfaz en español.
- No es repositorio git: no hay pasos de commit.

## Review Focus

- Corridas guardadas con el formato viejo de `opt` (`opt.mejor.m`): deben tratarse como "sin optimizar", sin romper Resultados ni Recomendaciones → prueba en Task 3.
- Corrida sin plan: la optimización evalúa con plan activo y las recomendaciones lo marcan → prueba en Task 2/3.
- Meta inalcanzable con todos los refuerzos: termina, `cumpleMeta=false`, respeta límites → prueba en Task 2.
- Base cerca del máximo del motor (p. ej. 9 médicos, MAXDOC 10): los disponibles se recortan → prueba en Task 2.
- Historial sin corridas de catástrofe o solo corridas `deOpt`: estado vacío en el selector → verificado a mano en Task 4.

---

### Task 1: Refuerzos configurables en el motor

**Files:** Modify `juego/js/motor/sim.js` (init ~l.236-284). Test: create `juego/prueba_opt.js`.

**Interfaces — Produces:** `cfg.refuerzos {medicos, enfermeras, camas}`, `cfg.llamada` (min tras la alerta); `sim.nRefMed/nRefEnf/nRefCama`; `resumen().planT`.

- [ ] Test: con defaults, los números de `prueba.js` no cambian (sismo con plan: muertos 5). `refuerzos {0,0,0}` → `nRefMed=nRefEnf=nRefCama=0`. `llamada: 0` → `resumen().planT === 60`. `medicos: 9, refuerzos.medicos: 4` → `nRefMed === 1`.
- [ ] Implementar: `reps(cfg.refuerzos.x ?? R_X, base, MAX)`; `planT = eventoT + (cfg.llamada ?? 10)`.
- [ ] `node prueba.js` (igual que antes) y `node prueba_opt.js` pasan.

### Task 2: Optimizador guiado por diagnóstico

**Files:** Rewrite `juego/js/analisis/optimizador.js`. Test: `juego/prueba_opt.js`.

**Interfaces — Produces (`UrgOptimizador`):**
- `diagnosticar(res, meta) -> { enfermeras: string|null, medicos: string|null, camas: string|null }` (texto de la causa o null).
- `costoRef(ref, llamada, horizonte, eventoT) -> number`.
- `evaluarRef(base, ref, replicas, llamada=10) -> { ref, muertosG, muertosGIc, cumpleG, cumpleGIc, costo, abandonos, derivados, diag, res0 }`.
- `optimizarRespuesta(base, { meta, replicas, disponibles }, onProgreso, onFin(opt))`; también `optimizarRespuestaSync(base, opc)` para pruebas.
- `opt = { version: 2, meta, replicas, disponibles, pasos: [{ n, diagnostico: string[], decision: string, ref, muertosG, muertosGIc, cumpleG, cumpleGIc, costo }], final: {ref, muertosG, muertosGIc, cumpleG, cumpleGIc, costo}, inicial: igual, cumpleMeta, demora: [{ llamada, muertosG, cumpleG }], sinPlan: bool }`.
- Se mantienen `ic95`, `simular`, `indicadores`, `COSTO_H`.

- [ ] Tests: bus/sismo terminan; `final.ref` ≤ disponibles; cada paso con decisión tiene `diagnostico.length ≥ 1`; `final.costo ≤` costo de todos los disponibles; meta 100 en sismo con disponibles {1,1,2} → `cumpleMeta false` y termina; `demora` tiene 3 entradas en orden 0/10/30; corrida con `plan:false` → `sinPlan true`; base 9 médicos → `final.ref.medicos ≤ 1`.
- [ ] Implementar según el spec (diagnóstico → candidatos señalados o todos → mejor beneficio/costo → parar; revisión quitando unidades; demora).
- [ ] `node prueba_opt.js` pasa.

### Task 3: Recomendaciones desde el plan de respuesta

**Files:** Modify `juego/js/analisis/recomendaciones.js` (bloque 8c), `juego/prueba_recom.js`.

**Interfaces — Produces:** `generar(...).optimo = null | { ...opt, refuerzos: [{recurso, n}], costoDemora: muertosG(30) − muertosG(0) }`. `opt` sin `version: 2` se ignora.

- [ ] Tests: opt viejo → `optimo null`; opt v2 con refuerzos → rec prio 1 cuyo título incluye "Convocar" y las cifras; opt con `final.ref` {0,0,0} y cumpleMeta → rec "no hacen falta refuerzos"; `cumpleMeta false` → rec prio 1 "Ni con todos los refuerzos…"; `sinPlan` → existe rec "Activar el plan de desastre"; con `costoDemora > 0` el detalle menciona la demora.
- [ ] Implementar; `node prueba_recom.js` pasa.

### Task 4: Interfaz

**Files:** Rewrite `juego/js/ui/panelOpt.js`; modify `juego/js/ui/app.js` (`apiOpt.seleccionar(id)`, `irA('opt')` pasa `runs`), `juego/js/ui/panelRecom.js` (tarjeta de optimización), `juego/js/ui/resultados.js` (tarjeta "siguiente paso").

- [ ] `UrgPanelOpt.render(cont, runs, sel, api)`: selector (solo catástrofes no `deOpt`, opción con nº/escenario/víctimas/dotación/plan/fallecidos I-III/cumple/✓ optimizada); si `sel` no es optimizable, usar la última optimizable; diagnóstico de la corrida; controles meta/réplicas/disponibles; tabla de pasos; respuesta recomendada; tabla de demora; antes/después (misma catástrofe con `refuerzos=final.ref`, `plan:true`, `llamada:10`).
- [ ] `aplicar` carga la corrida en Simulación con plan activo (los refuerzos van en `cfg`, se pasan al reiniciar).
- [ ] Verificación: `node prueba.js`, `node prueba_opt.js`, `node prueba_recom.js`; abrir en navegador, simular sismo, optimizar, cambiar de corrida en el selector, ver recomendaciones.
