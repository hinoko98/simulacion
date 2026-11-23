// Prueba de refuerzos en el motor y del optimizador guiado por resultados: node prueba_opt.js
const assert = require('assert');
globalThis.UrgSim = require('./js/motor/sim.js');
const O = require('./js/analisis/optimizador.js');
const S = globalThis.UrgSim;
const BASE = { escenario: 'bus', medicos: 4, enfermeras: 2, camas: 10, plan: true, apropiativa: true, derivar: true, semilla: 42 };

// --- motor ---
let s = new S.Sim({ escenario: 'sismo' });
assert.deepStrictEqual([s.nRefMed, s.nRefEnf, s.nRefCama], [3, 2, 6], 'por defecto, refuerzos de siempre');
s = new S.Sim({ escenario: 'sismo', refuerzos: { medicos: 0, enfermeras: 0, camas: 0 } });
assert.deepStrictEqual([s.nRefMed, s.nRefEnf, s.nRefCama], [0, 0, 0]);
s = new S.Sim({ escenario: 'sismo', medicos: 9, refuerzos: { medicos: 4 } });
assert.strictEqual(s.nRefMed, 1, 'recorta por la capacidad del motor');
s = new S.Sim({ escenario: 'sismo', llamada: 0 });
assert.strictEqual(s.planT, 60, 'llamada 0 = al recibir la alerta');
assert.strictEqual(new S.Sim({ escenario: 'sismo' }).planT, 70);

// --- piezas ---
assert.strictEqual(O.costoRef({ medicos: 1, enfermeras: 0, camas: 0 }, 10, 720, 60), 45000 * (720 - 100) / 60);
assert.deepStrictEqual(O.limites({ medicos: 9, enfermeras: 2, camas: 20 }), { medicos: 1, enfermeras: 3, camas: 4 });
const d = O.diagnosticar({ muertosTriajeG: 2, muertosColaG: 0, picoColaT: 3, picoColaC: 0, cumpleG: 90, util: { medicos: 50, enfermeras: 50, camas: 50 } }, 70);
assert.ok(d.enfermeras && d.enfermeras.includes('antes de ser clasificados'));
assert.strictEqual(d.medicos, null); assert.strictEqual(d.camas, null);

// --- búsqueda ---
function revisar(opt, disp) {
  for (const k of O.RECURSOS) assert.ok(opt.final.ref[k] <= disp[k], 'respeta disponibles: ' + k);
  for (const p of opt.pasos.slice(1)) if (p.cambio > 0) assert.ok(p.porque && p.porque.length > 0, 'cada refuerzo tiene su porqué');
  assert.deepStrictEqual(opt.demora.map(x => x.llamada), [0, 10, 30]);
  assert.strictEqual(opt.version, 2);
}
const t0 = Date.now();
const a = O.optimizarRespuestaSync(BASE, { meta: 70, replicas: 3 });
revisar(a, O.DISPONIBLES);
const todo = O.costoRef(O.DISPONIBLES, 10, 720, 60);
assert.ok(a.final.costo <= todo);
assert.strictEqual(a.sinPlan, false);
console.log('bus:', a.pasos.map(p => p.decision).join(' | '), '→', JSON.stringify(a.final.ref), 'cumple', a.cumpleMeta, a.evaluaciones, 'evals', Date.now() - t0, 'ms');

const b = O.optimizarRespuestaSync(Object.assign({}, BASE, { escenario: 'sismo', plan: false }), { meta: 100, replicas: 2, disponibles: { medicos: 1, enfermeras: 1, camas: 2 } });
revisar(b, { medicos: 1, enfermeras: 1, camas: 2 });
assert.strictEqual(b.cumpleMeta, false, 'meta inalcanzable');
assert.strictEqual(b.sinPlan, true);
console.log('sismo:', b.pasos.map(p => p.decision).join(' | '), '→', JSON.stringify(b.final.ref), b.motivo);

const c = O.optimizarRespuestaSync(Object.assign({}, BASE, { medicos: 9 }), { meta: 70, replicas: 2 });
assert.ok(c.final.ref.medicos <= 1);

// la respuesta óptima se puede repetir sobre la misma catástrofe
const cfgO = O.cfgOptimizada(BASE, a);
assert.deepStrictEqual(cfgO.refuerzos, a.final.ref); assert.strictEqual(cfgO.plan, true); assert.strictEqual(cfgO.llamada, 10);
assert.ok(O.simular(cfgO).res.llegados > 0);
console.log('prueba_opt OK');
