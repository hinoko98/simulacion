// Prueba rápida del motor: node prueba.js
const S = require('./js/motor/sim.js');
for (const esc of ['accidente','normal', 'sismo', 'bus', 'incendio', 'intox']) {
  for (const plan of [false, true]) {
    const s = new S.Sim({ escenario: esc, plan, apropiativa: plan });
    let n = 0;
    while (!s.terminado && n++ < 20000) s.step();
    const r = s.resumen();
    console.log(esc.padEnd(9), plan ? 'plan   ' : 'sin plan', 'lleg', r.llegados, 'muertos', r.muertos,
      'aband', r.abandonos, 'altas', r.altas, 'sist', r.enSistema, 'esp', r.espMedia.toFixed(0),
      'cumple', r.cumple.toFixed(0), 'util', Object.values(r.util).map(x => x.toFixed(0)).join('/'));
  }
}
