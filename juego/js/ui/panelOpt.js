/* UI: optimización de la respuesta, lanzada desde el historial de Resultados (ya no tiene pestaña propia).
 * Solo se optimiza una corrida a la vez. Al terminar, la app abre las Recomendaciones de esa corrida. */
(function (root) {
  'use strict';
  const S = root.UrgSim;
  const O = root.UrgOptimizador;
  const cop = (x) => '$' + Math.round(x).toLocaleString('es-CO');
  const pm = (v, ic, d) => v.toFixed(d) + (ic > 0 ? ' ± ' + ic.toFixed(d) : '');
  const f0 = (x) => Math.round(x);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NOMBRE_REC = { medicos: 'Médicos', enfermeras: 'Enfermeras', camas: 'Camas de sobrecarga' };
  const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);

  let buscando = null;                                   // id de la corrida que se está optimizando
  let opciones = { meta: 70, replicas: 5, disponibles: Object.assign({}, O.DISPONIBLES) };   // últimas usadas

  const optV2 = (r) => (r && r.opt && r.opt.version === 2 ? r.opt : null);
  /** ¿Se puede optimizar esta corrida? Catástrofes simuladas por el usuario (no el día normal ni corridas generadas al optimizar). */
  const optimizable = (r) => S.ESCENARIOS[r.cfg.escenario].evento && !r.deOpt;
  const refTxt = (ref) => O.RECURSOS.filter(k => ref[k] > 0).map(k => `${ref[k]} ${O.nombre(k, ref[k])}`).join(', ') || 'ningún refuerzo';

  /** Controles comunes (meta, réplicas, refuerzos disponibles) que se muestran sobre el historial. */
  function controlesHtml() {
    const o = opciones, dis = buscando !== null ? 'disabled' : '';
    return `<div class="controles opt-ctl">
      <label>Meta: % de I-III a tiempo<input id="optMeta" type="number" min="30" max="100" value="${o.meta}" ${dis}></label>
      <label>Réplicas por prueba<input id="optRep" type="number" min="2" max="20" value="${o.replicas}" ${dis}></label>
      ${O.RECURSOS.map(k => `<label>${NOMBRE_REC[k]} disponibles<input id="optD_${k}" type="number" min="0" max="20" value="${o.disponibles[k]}" ${dis}></label>`).join('')}
      </div>
      <div class="prog" id="optProgWrap" ${buscando === null ? 'hidden' : ''}><i id="optProg"></i></div><p class="nota" id="optEstado"></p>
      <p class="nota">Los refuerzos llegan ${S.DEMORA_REF.enfermeras} min (enfermeras), ${S.DEMORA_REF.medicos} min (médicos) y ${S.DEMORA_REF.camas} min (camas) después de convocarlos y se pagan desde que llegan
      (médico ${cop(O.COSTO_H.medico)}/h, enfermera ${cop(O.COSTO_H.enfermera)}/h, cama ${cop(O.COSTO_H.cama)}/h). Meta: cero fallecidos I-III y al menos el % indicado atendido a tiempo.</p>`;
  }

  function leerOpciones() {
    const v = (id, d) => { const e = $(id); return e ? +e.value : d; };
    const meta = Math.max(30, Math.min(100, v('optMeta', opciones.meta) || 70));
    const replicas = Math.max(2, Math.min(20, Math.round(v('optRep', opciones.replicas) || 5)));
    const disponibles = {};
    for (const k of O.RECURSOS) disponibles[k] = Math.max(0, Math.round(v('optD_' + k, opciones.disponibles[k]) || 0));
    opciones = { meta, replicas, disponibles };
    return opciones;
  }

  /**
   * Optimiza una corrida. api: { guardar(id, opt, despues), alTerminar(id), alCambiar() }.
   * Devuelve false si ya hay otra optimización en curso.
   */
  function lanzar(run, api) {
    if (buscando !== null || !optimizable(run)) return false;
    const op = leerOpciones(), id = run.id, c = run.cfg, base = Object.assign({}, c, { manual: false });
    buscando = id; api.alCambiar();
    O.optimizarRespuesta(base, op,
      (f, n) => {
        const w = $('optProgWrap'), p = $('optProg'), e = $('optEstado');
        if (w) w.hidden = false; if (p) p.style.width = (100 * f) + '%';
        if (e) e.textContent = `Optimizando la corrida… ${n} combinaciones de refuerzos probadas (${n * op.replicas} simulaciones).`;
      },
      (opt) => {
        const despues = O.simular(O.cfgOptimizada(base, opt));           // la misma catástrofe con la respuesta recomendada
        const antes = (run.parcial || c.manual) ? O.simular(base).res : run.res;
        opt.antes = O.indicadores(antes); opt.despues = O.indicadores(despues.res);
        buscando = null;
        api.guardar(id, opt, despues);
        api.alTerminar(id);
      });
    return true;
  }

  /** Tabla de pasos: cada refuerzo con el dato de los resultados que lo justificó. */
  function pasosHtml(o) {
    return `<div class="tabla-wrap"><table class="cmp"><thead><tr><th>Paso</th><th>Decisión</th><th>Por qué (lo que mostraban los resultados)</th><th>Fallecidos I-III</th><th>I-III a tiempo</th><th>Costo refuerzos</th></tr></thead><tbody>` +
      o.pasos.map(p => `<tr><td>${p.n}</td><td><b>${esc(p.decision)}</b></td><td>${esc(p.porque || (p.diagnostico && p.diagnostico.length ? p.diagnostico.join(' · ') : '—'))}</td>
        <td class="${p.muertosG ? 'mal' : 'bien'}">${pm(p.muertosG, p.muertosGIc, 1)}</td><td>${pm(p.cumpleG, p.cumpleGIc, 0)} %</td><td>${cop(p.costo)}</td></tr>`).join('') +
      '</tbody></table></div>';
  }

  /** Tabla de efecto de la demora en la convocatoria. */
  function demoraHtml(o) {
    const d0 = o.demora.find(x => x.llamada === 0);
    return `<div class="tabla-wrap"><table class="cmp"><thead><tr><th>Convocatoria</th><th>Fallecidos I-III</th><th>I-III a tiempo</th><th>Frente a convocar con la alerta</th></tr></thead><tbody>` +
      o.demora.map(d => `<tr><td>${d.llamada === 0 ? 'Al recibir la alerta' : `${d.llamada} min después`}${d.llamada === o.llamada ? ' (estándar)' : ''}</td>
        <td class="${d.muertosG ? 'mal' : 'bien'}">${pm(d.muertosG, d.muertosGIc, 1)}</td><td>${pm(d.cumpleG, d.cumpleGIc, 0)} %</td>
        <td>${d0 && d.llamada ? (d.muertosG - d0.muertosG > 0 ? '+' : '') + (d.muertosG - d0.muertosG).toFixed(1) + ' fallecidos' : '—'}</td></tr>`).join('') +
      '</tbody></table></div>';
  }

  /** Tarjeta "antes y después": la misma catástrofe con lo simulado y con la respuesta optimizada. */
  function antesDespues(sel, graficas) {
    const o = optV2(sel); if (!o || !o.antes || !o.despues) return '';
    const c = sel.cfg, A = o.antes, D = o.despues;
    // [nombre, clave, unidad, sentido]: sentido -1 = menos es mejor, 1 = más es mejor
    const FILAS = [['Fallecidos (todos los niveles)', 'muertos', '', -1], ['Fallecidos triage I-III', 'muertosG', '', -1],
      ['Cumple tiempos de triage (todos)', 'cumple', ' %', 1], ['Cumple tiempos triage I-III', 'cumpleG', ' %', 1],
      ['Espera media a médico', 'espMedia', ' min', -1], ['Abandonos sin atención', 'abandonos', '', -1],
      ['Derivados a otros hospitales', 'derivados', '', -1], ['Altas', 'altas', '', 1]];
    const filas = FILAS.map(([n, k, u, s]) => {
      const a = f0(A[k]), d = f0(D[k]), dif = d - a, cl = dif === 0 ? '' : (dif * s > 0 ? 'bien' : 'mal');
      return `<tr><td>${n}</td><td>${a}${u}</td><td><b>${d}${u}</b></td><td class="${cl}">${dif === 0 ? 'igual' : (dif > 0 ? '+' : '−') + Math.abs(dif) + u}</td></tr>`;
    }).join('');
    const antesTxt = c.plan ? 'con plan · ' + refTxt(c.refuerzos || { medicos: S.R_MED, enfermeras: S.R_ENF, camas: S.R_CAMA }) : 'sin plan, sin refuerzos';
    return `<section class="card aplicada"><h2>Antes y después en tu simulación</h2>
      <p>Se repitió <b>la misma catástrofe</b> (mismos ${A.llegados} pacientes, semilla ${c.semilla}) con el plan activo y convocando ${refTxt(o.final.ref)}. La corrida quedó en el historial de <b>Resultados</b> como «optimizada».</p>
      ${graficas || ''}
      <div class="tabla-wrap"><table class="cmp"><thead><tr><th></th><th>Antes: lo que simulaste<br>${antesTxt}</th><th>Después: respuesta optimizada<br>${refTxt(o.final.ref)}</th><th>Cambio</th></tr></thead>
      <tbody>${filas}</tbody></table></div>
      <p class="nota">Esta tabla es una sola corrida; las cifras con ± son el promedio de ${o.replicas} réplicas con semillas distintas, por eso pueden diferir un poco.${sel.parcial || c.manual ? ' Como tu corrida fue parcial o en modo comandante, el «antes» se recalculó completo y en automático para que la comparación sea justa.' : ''}</p></section>`;
  }

  root.UrgPanelOpt = { controlesHtml, lanzar, optimizable, optV2, pasosHtml, demoraHtml, antesDespues, refTxt, buscando: () => buscando };
})(window);
