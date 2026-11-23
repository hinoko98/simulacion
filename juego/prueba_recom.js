// Prueba de la unión optimización → recomendaciones: node prueba_recom.js
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
const e = (ref, muertosG, cumpleG, costo) => ({ ref, muertosG, muertosGIc: 0, cumpleG, cumpleGIc: 0, costo });
const R0 = { medicos: 0, enfermeras: 0, camas: 0 };
function optV2(extra) {
  return Object.assign({ version: 2, meta: 70, replicas: 3, llamada: 10, sinPlan: false, cumpleMeta: true,
    inicial: e(R0, 4, 40, 0), final: e({ medicos: 2, enfermeras: 1, camas: 0 }, 0, 80, 900000),
    pasos: [{ n: 0, decision: 'Punto de partida' }, { n: 1, cambio: 1, decision: '+1 médico', porque: '3 fallecidos graves esperando médico' }],
    demora: [{ llamada: 0, muertosG: 0 }, { llamada: 10, muertosG: 0 }, { llamada: 30, muertosG: 2.5 }] }, extra);
}

// sin opt, o con el formato viejo de opt: optimo null y no revienta
const base = corrida();
assert.strictEqual(R.generar(base, [base]).optimo, null);
assert.strictEqual(R.generar(Object.assign({}, base, { opt: { meta: 70, mejor: { m: 6, e: 2, c: 7 }, actual: {} } }), [base]).optimo, null);

// respuesta con refuerzos que cumple la meta
const a = R.generar(Object.assign({}, base, { opt: optV2() }), [base]);
assert.deepStrictEqual(a.optimo.refuerzos, [{ recurso: 'medicos', n: 2 }, { recurso: 'enfermeras', n: 1 }]);
assert.strictEqual(a.optimo.muertesEvitadas, 4);
assert.strictEqual(a.optimo.costoDemora, 2.5);
const rec = a.recs.find(x => x.titulo.startsWith('Convocar'));
assert.ok(rec && rec.prio === 1, 'recomendación principal = plan de respuesta');
assert.ok(rec.titulo.includes('2 médicos') && rec.titulo.includes('1 enfermera de triaje') && !rec.titulo.includes('cama'));
assert.ok(rec.detalle.includes('30 min') && rec.detalle.includes('esperando médico'));
assert.ok(!a.recs.some(x => x.recurso === 'camas'), 'la optimización no convocó camas: fuera la recomendación de camas');

// sin refuerzos necesarios
const b = R.generar(Object.assign({}, base, { opt: optV2({ final: e(R0, 0, 80, 0) }) }), [base]);
assert.ok(b.recs.some(x => x.prio === 3 && x.titulo === 'Con el plan activo no hacen falta refuerzos'));
assert.ok(!b.recs.some(x => x.titulo === 'Mantener el protocolo actual'));

// meta inalcanzable
const c = R.generar(Object.assign({}, base, { opt: optV2({ cumpleMeta: false }) }), [base]);
assert.ok(c.recs.some(x => x.prio === 1 && x.titulo.startsWith('Ni con todos los refuerzos')));

// corrida sin plan: se recomienda activarlo
const sp = corrida({ plan: false });
const d = R.generar(Object.assign({}, sp, { opt: optV2({ sinPlan: true }) }), [sp]);
assert.ok(d.recs.some(x => x.titulo === 'Activar el plan de desastre'));

// simular + indicadores: repetir la misma catástrofe con otra dotación (antes / después)
const s1 = O.simular(base.cfg), s2 = O.simular(base.cfg);
assert.strictEqual(s1.res.muertos, base.res.muertos, 'misma semilla y cfg = misma corrida');
const i1 = O.indicadores(s1.res), i2 = O.indicadores(s2.res);
for (const k of ['llegados', 'altas', 'muertos', 'muertosG', 'abandonos', 'derivados']) assert.strictEqual(i1[k], i2[k], k);
assert.ok(Math.abs(i1.espMedia - i2.espMedia) < 0.5); // el motor deja una variación de centésimas de minuto entre corridas idénticas
const ind = O.indicadores(base.res);
assert.deepStrictEqual(Object.keys(ind).sort(), ['abandonos', 'altas', 'cumple', 'cumpleG', 'derivados', 'espMedia', 'llegados', 'muertos', 'muertosG']);
assert.strictEqual(ind.muertosG, base.res.porNivel[1].muertos + base.res.porNivel[2].muertos + base.res.porNivel[3].muertos);
const pobre = O.simular(Object.assign({}, base.cfg, { medicos: 1, enfermeras: 1, camas: 4, manual: true }));
assert.strictEqual(pobre.cfg.medicos, 1); assert.strictEqual(pobre.cfg.manual, false);
assert.ok(O.indicadores(pobre.res).cumple < ind.cumple, 'menos recursos = peor cumplimiento');
console.log('prueba_recom OK');
