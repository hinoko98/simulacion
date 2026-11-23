/* ANÁLISIS: optimización de la RESPUESTA a una catástrofe, guiada por los resultados de la simulación
 * (objetivo 4 del proyecto).
 *
 * Pregunta que responde: "con la plantilla que tenía el hospital, ¿a quién convoco de refuerzo?".
 *   1. Parte de la corrida elegida con el plan activo y SIN refuerzos.
 *   2. Diagnostica sus resultados: muertes antes de clasificar, muertes esperando médico, colas y utilización.
 *   3. Prueba añadir solo los recursos que el diagnóstico señala (+1 médico, +1 enfermera, +2 camas) y se queda con
 *      el que más beneficio da por peso. Repite hasta cumplir la meta o agotar los refuerzos disponibles.
 *   4. Revisión final: quita unidades que sobran si sigue cumpliendo y sale más barato.
 *   5. Mide cuánto cambia el resultado si la convocatoria se hace a los 0, 10 o 30 min de la alerta.
 * Cada estado se evalúa con varias réplicas (semillas distintas, mismos pacientes entre estados) y se reporta
 * media ± IC 95 % (t de Student). Los refuerzos llegan con demora (sim.js: DEMORA_REF) y se pagan desde su llegada.
 */
(function (root) {
  'use strict';
  const S = root.UrgSim;
  const COSTO_H = { medico: 45000, enfermera: 20000, cama: 5000 };   // COP/hora (urgencias/modelo.py)
  const RECURSOS = ['enfermeras', 'medicos', 'camas'];
  const CLAVE_COSTO = { medicos: 'medico', enfermeras: 'enfermera', camas: 'cama' };
  const MAX_MOTOR = { medicos: S.MAXDOC, enfermeras: S.MAXENF, camas: S.MAXCAMA };
  const DISPONIBLES = { medicos: 4, enfermeras: 3, camas: 8 };
  const PASO = { medicos: 1, enfermeras: 1, camas: 2 };
  const LLAMADA = 10;
  const LLAMADAS_DEMORA = [0, 10, 30];
  const NOM = { medicos: ['médico', 'médicos'], enfermeras: ['enfermera de triaje', 'enfermeras de triaje'], camas: ['cama de sobrecarga', 'camas de sobrecarga'] };
  const nombre = (k, n) => NOM[k][n === 1 ? 0 : 1];

  /* Valor crítico t de Student (dos colas, 95 %) para gl = 1..30; z = 1,96 para más. */
  const T95 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131,
    2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];

  /** Media e intervalo de confianza del 95 % (media ± t·s/√n) de una muestra de réplicas. */
  function ic95(x) {
    const n = x.length, media = x.reduce((a, b) => a + b, 0) / n;
    if (n < 2) return { media, ic: 0, n };
    const s2 = x.reduce((a, b) => a + (b - media) * (b - media), 0) / (n - 1);
    const t = n - 1 <= 30 ? T95[n - 2] : 1.96;
    return { media, ic: t * Math.sqrt(s2 / n), n };
  }

  /** Indicadores de triage I-III y de cuello de botella de un resumen de simulación. */
  function metricas(r) {
    let muertosG = 0, ok = 0, tot = 0, mTri = 0, mCola = 0;
    for (const lv of [1, 2, 3]) {
      const l = r.porNivel[lv];
      muertosG += l.muertos; ok += l.cumple * l.llegados / 100; tot += l.llegados;
      mTri += l.muertosTriaje; mCola += l.muertosCola;
    }
    return { muertosG, cumpleG: tot ? 100 * ok / tot : 100, muertosTriajeG: mTri, muertosColaG: mCola,
      picoColaT: r.picoColaT, picoColaC: Math.max(0, ...r.serie.map(s => s.colaC)),
      util: { medicos: r.util.medicos, enfermeras: r.util.enfermeras, camas: r.util.camas },
      abandonos: r.abandonos, derivados: r.derivados };
  }

  /** Qué recursos señalan los resultados como cuello de botella. Devuelve, por recurso, el texto de la causa o null.
   *  Umbrales iguales a los de recomendaciones.js para que diagnóstico y recomendaciones digan lo mismo. */
  function diagnosticar(m, meta) {
    const f1 = (x) => (Math.round(x * 10) / 10).toLocaleString('es-CO'), f0 = Math.round;
    const enf = [], med = [], cam = [];
    if (m.muertosTriajeG > 0) enf.push(`${f1(m.muertosTriajeG)} fallecidos graves antes de ser clasificados`);
    if (m.picoColaT >= 8) enf.push(`hasta ${f0(m.picoColaT)} personas esperando triaje`);
    if (m.util.enfermeras > 85) enf.push(`triaje ocupado al ${f0(m.util.enfermeras)} %`);
    if (m.muertosColaG > 0) med.push(`${f1(m.muertosColaG)} fallecidos graves esperando médico`);
    if (m.cumpleG < meta && m.util.medicos > 85) med.push(`solo ${f0(m.cumpleG)} % de I-III atendido a tiempo con médicos al ${f0(m.util.medicos)} %`);
    if (m.util.camas > 85) cam.push(`camas ocupadas al ${f0(m.util.camas)} %`);
    if (m.picoColaC >= 3) cam.push(`hasta ${f0(m.picoColaC)} pacientes esperando cama`);
    const t = (a) => (a.length ? a.join('; ') : null);
    return { enfermeras: t(enf), medicos: t(med), camas: t(cam) };
  }

  /** Costo (COP) de los refuerzos: cada uno se paga desde que llega hasta el fin del horizonte. */
  function costoRef(ref, llamada, horizonte, eventoT) {
    let c = 0;
    for (const k of RECURSOS) {
      const llega = eventoT + llamada + S.DEMORA_REF[k];
      c += (ref[k] || 0) * COSTO_H[CLAVE_COSTO[k]] * Math.max(0, horizonte - llega) / 60;
    }
    return c;
  }

  /** Refuerzos que realmente se pueden convocar: disponibles, recortados por la capacidad física del motor. */
  function limites(base, disp) {
    const d = Object.assign({}, DISPONIBLES, disp || {}), out = {};
    for (const k of RECURSOS) out[k] = Math.max(0, Math.min(d[k], MAX_MOTOR[k] - base[k]));
    return out;
  }

  const cfgRespuesta = (base, ref, llamada) => Object.assign({}, base, { plan: true, manual: false, refuerzos: Object.assign({}, ref), llamada });

  /** Simula un conjunto de refuerzos con `replicas` semillas y devuelve medias ± IC 95 % y el diagnóstico medio. */
  function evaluarRef(base, ref, replicas, llamada, meta) {
    llamada = llamada ?? LLAMADA;
    const ms = [];
    for (let k = 0; k < replicas; k++) {
      const sim = new S.Sim(Object.assign(cfgRespuesta(base, ref, llamada), { semilla: base.semilla + k }));
      let n = 0; while (!sim.terminado && n++ < 200000) sim.step();
      ms.push(metricas(sim.resumen()));
    }
    const md = (f) => ms.reduce((a, m) => a + f(m), 0) / ms.length;
    const mg = ic95(ms.map(m => m.muertosG)), cg = ic95(ms.map(m => m.cumpleG));
    const prom = { muertosG: mg.media, cumpleG: cg.media, muertosTriajeG: md(m => m.muertosTriajeG), muertosColaG: md(m => m.muertosColaG),
      picoColaT: md(m => m.picoColaT), picoColaC: md(m => m.picoColaC),
      util: { medicos: md(m => m.util.medicos), enfermeras: md(m => m.util.enfermeras), camas: md(m => m.util.camas) } };
    const esc = S.ESCENARIOS[base.escenario];
    return { ref: Object.assign({}, ref), llamada, muertosG: mg.media, muertosGIc: mg.ic, cumpleG: cg.media, cumpleGIc: cg.ic,
      abandonos: md(m => m.abandonos), derivados: md(m => m.derivados), metricas: prom,
      diag: diagnosticar(prom, meta ?? 70), costo: costoRef(ref, llamada, esc.horizonte, 60) };
  }

  const cumple = (e, meta) => e.muertosG === 0 && e.cumpleG >= meta;
  const beneficio = (de, a) => 100 * (de.muertosG - a.muertosG) + (a.cumpleG - de.cumpleG);
  const mas = (ref, k, d) => Object.assign({}, ref, { [k]: ref[k] + d });
  const corto = (e) => ({ ref: Object.assign({}, e.ref), muertosG: e.muertosG, muertosGIc: e.muertosGIc, cumpleG: e.cumpleG, cumpleGIc: e.cumpleGIc, costo: e.costo,
    abandonos: e.abandonos, derivados: e.derivados });
  const listaDiag = (d) => RECURSOS.filter(k => d[k]).map(k => `${nombre(k, 2)}: ${d[k]}`);

  /** Búsqueda guiada (generador: cede tras cada evaluación para no congelar la página). */
  function* buscar(base, opc) {
    const meta = opc.meta ?? 70, replicas = opc.replicas ?? 5, disp = limites(base, opc.disponibles);
    let evals = 0;
    const ev = (ref, llamada) => { evals++; return evaluarRef(base, ref, replicas, llamada, meta); };
    let ref = { medicos: 0, enfermeras: 0, camas: 0 };
    let actual = ev(ref); yield evals;
    const inicial = actual;
    const pasos = [Object.assign({ n: 0, diagnostico: listaDiag(actual.diag), decision: 'Punto de partida: plan activo sin convocar refuerzos' }, corto(actual))];
    let motivo = '';

    while (!cumple(actual, meta)) {
      const libres = RECURSOS.filter(k => ref[k] + PASO[k] <= disp[k]);
      if (!libres.length) { motivo = 'Se agotaron los refuerzos disponibles.'; break; }
      const senalados = libres.filter(k => actual.diag[k]);
      let mejor = null, guiado = true;
      const probar = (ks) => {
        for (const k of ks) {
          const e = ev(mas(ref, k, PASO[k]));
          const b = beneficio(actual, e), dc = e.costo - actual.costo;
          const valor = b <= 0 ? -Infinity : (dc > 0 ? b / dc : Infinity);
          if (!mejor || valor > mejor.valor) mejor = { k, e, valor, b };
        }
      };
      probar(senalados.length ? senalados : libres);
      if (!senalados.length) guiado = false;
      yield evals;
      if ((!mejor || mejor.valor === -Infinity) && senalados.length && senalados.length < libres.length) {
        // lo señalado no mejoró: se prueban los demás recursos por descarte
        mejor = null; guiado = false; probar(libres.filter(k => !senalados.includes(k))); yield evals;
      }
      if (!mejor || mejor.valor === -Infinity) { motivo = 'Ningún refuerzo adicional mejora el resultado.'; break; }
      const k = mejor.k;
      const porque = guiado ? actual.diag[k] : 'ningún recurso estaba claramente saturado; se eligió el que más mejoró entre todos';
      pasos.push(Object.assign({ n: pasos.length, recurso: k, cambio: PASO[k], porque,
        diagnostico: listaDiag(actual.diag), decision: `+${PASO[k]} ${nombre(k, PASO[k])}` }, corto(mejor.e)));
      ref = mejor.e.ref; actual = mejor.e;
    }

    // Revisión final: ¿sobra alguna unidad?
    const cumplia = cumple(actual, meta);
    for (let cambio = true; cambio;) {
      cambio = false;
      for (const k of RECURSOS) {
        if (ref[k] < PASO[k]) continue;
        const e = ev(mas(ref, k, -PASO[k]));
        const ok = cumplia ? cumple(e, meta) : (e.muertosG <= actual.muertosG && e.cumpleG >= actual.cumpleG - 1);
        if (ok && e.costo < actual.costo) {
          pasos.push(Object.assign({ n: pasos.length, recurso: k, cambio: -PASO[k], porque: 'revisión final: sin esa unidad el resultado se mantiene y sale más barato',
            diagnostico: [], decision: `−${PASO[k]} ${nombre(k, PASO[k])}` }, corto(e)));
          ref = e.ref; actual = e; cambio = true; break;
        }
      }
      yield evals;
    }

    // Efecto de convocar antes o después
    const demora = [];
    for (const L of LLAMADAS_DEMORA) {
      const e = L === LLAMADA ? actual : ev(ref, L);
      demora.push({ llamada: L, muertosG: e.muertosG, muertosGIc: e.muertosGIc, cumpleG: e.cumpleG, cumpleGIc: e.cumpleGIc, costo: e.costo });
      yield evals;
    }

    return { version: 2, meta, replicas, disponibles: disp, llamada: LLAMADA, pasos, inicial: corto(inicial), final: corto(actual),
      cumpleMeta: cumple(actual, meta), motivo, demora, sinPlan: !base.plan, evaluaciones: evals };
  }

  /** Versión síncrona (pruebas con node). */
  function optimizarRespuestaSync(base, opc) {
    const g = buscar(Object.assign({}, base, { manual: false }), opc || {});
    for (;;) { const r = g.next(); if (r.done) return r.value; }
  }

  /** Versión por tandas para el navegador. onProgreso(fracción aproximada, evaluaciones). */
  function optimizarRespuesta(base, opc, onProgreso, onFin) {
    const g = buscar(Object.assign({}, base, { manual: false }), opc || {});
    (function tanda() {
      const r = g.next();
      if (r.done) { onProgreso(1, r.value.evaluaciones); onFin(r.value); return; }
      onProgreso(Math.min(0.95, r.value / (r.value + 8)), r.value);
      setTimeout(tanda, 0);
    })();
  }

  /** Corre de principio a fin una catástrofe (sin modo comandante) y devuelve su configuración y su resumen. */
  function simular(cfg) {
    const sim = new S.Sim(Object.assign({}, cfg, { manual: false }));
    let n = 0; while (!sim.terminado && n++ < 200000) sim.step();
    return { cfg: Object.assign({}, sim.cfg), res: sim.resumen() };
  }

  /** La misma catástrofe con la respuesta recomendada (plan activo, refuerzos óptimos, convocatoria estándar). */
  function cfgOptimizada(cfg, opt) { return cfgRespuesta(cfg, opt.final.ref, opt.llamada); }

  /** Indicadores de una corrida para la comparación antes / después de optimizar. */
  function indicadores(r) {
    const m = metricas(r);
    return { llegados: r.llegados, altas: r.altas, muertos: r.muertos, muertosG: m.muertosG, cumple: r.cumple, cumpleG: m.cumpleG,
      espMedia: r.espMedia, abandonos: r.abandonos, derivados: r.derivados };
  }

  root.UrgOptimizador = { optimizarRespuesta, optimizarRespuestaSync, evaluarRef, diagnosticar, metricas, costoRef, limites, cfgOptimizada,
    simular, indicadores, ic95, nombre, COSTO_H, DISPONIBLES, PASO, LLAMADA, LLAMADAS_DEMORA, RECURSOS };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.UrgOptimizador;
