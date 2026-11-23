/* UI: pestaña "Optimización". El usuario elige QUÉ simulación optimizar; el optimizador parte de sus resultados
 * (diagnóstico) y busca a quién convocar de refuerzo durante esa misma catástrofe. */
(function (root) {
  'use strict';
  const S = root.UrgSim;
  const O = root.UrgOptimizador;
  const cop = (x) => '$' + Math.round(x).toLocaleString('es-CO');
  const pm = (v, ic, d) => v.toFixed(d) + (ic > 0 ? ' ± ' + ic.toFixed(d) : '');
  const f0 = (x) => Math.round(x);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NOMBRE_REC = { medicos: 'Médicos', enfermeras: 'Enfermeras de triaje', camas: 'Camas de sobrecarga' };
  let buscando = null;         // id de la corrida que se está optimizando

  /** Corridas que se pueden optimizar: catástrofes simuladas por el usuario (no el día normal ni las generadas por una optimización). */
  const optimizables = (runs) => runs.filter(r => S.ESCENARIOS[r.cfg.escenario].evento && !r.deOpt);
  const optV2 = (r) => (r && r.opt && r.opt.version === 2 ? r.opt : null);

  function opcion(r, i, runs) {
    const c = r.cfg, m = O.metricas(r.res);
    const nVic = (c.victimasNivel || S.distribucionBase(c.escenario)).reduce((s, v) => s + v, 0);
    return `#${runs.indexOf(r) + 1} · ${S.ESCENARIOS[c.escenario].nombre} · ${nVic} víctimas · ${c.medicos}/${c.enfermeras}/${c.camas} méd/enf/camas · ` +
      `${c.plan ? 'con plan' : 'sin plan'} · ${m.muertosG} fallecidos I-III · ${f0(m.cumpleG)} % a tiempo${r.parcial ? ' · parcial' : ''}${optV2(r) ? ' · ✓ optimizada' : ''}`;
  }

  function render(cont, runs, selIn, api) {
    const lista = optimizables(runs);
    if (!lista.length) {
      cont.innerHTML = `<header class="vh"><h1>Optimización de la respuesta</h1></header><div class="vacio"><h2>Primero simula una catástrofe</h2>
        <p>La optimización parte de los resultados de una simulación concreta: mismos pacientes, mismo escenario.</p>
        <button class="prim" data-ir="sim">🏥 Ir a Simulación</button></div>`;
      return;
    }
    const sel = lista.includes(selIn) ? selIn : lista[lista.length - 1];
    if (sel !== selIn) api.seleccionar(sel.id);
    cont.dataset.corrida = sel.id;
    const c = sel.cfg, m = O.metricas(sel.res), o = optV2(sel), meta = o ? o.meta : 70;
    const diag = O.diagnosticar(m, meta), disp = o ? o.disponibles : O.limites(c);

    cont.innerHTML = `<header class="vh"><h1>Optimización de la respuesta</h1>
      <p>¿A quién convocar de refuerzo durante la catástrofe? Se parte de los resultados de la simulación que elijas.</p></header>
      <section class="card"><h2>1 · Simulación a optimizar</h2>
        <select id="optSel" class="selector">${lista.slice().reverse().map(r => `<option value="${r.id}" ${r.id === sel.id ? 'selected' : ''}>${esc(opcion(r, 0, runs))}</option>`).join('')}</select>
        <p class="nota">La lista muestra las catástrofes de tu historial. Cambiarla también cambia la corrida que ves en Resultados y Recomendaciones.</p></section>
      <section class="card"><h2>2 · Lo que mostraron sus resultados</h2>
        <div class="kpis">
          <div class="kpi ${m.muertosG ? 'mal' : 'bien'}"><div class="v">${m.muertosG}</div><div class="l">fallecidos I-III</div></div>
          <div class="kpi"><div class="v">${m.muertosTriajeG}</div><div class="l">murieron antes de ser clasificados</div></div>
          <div class="kpi"><div class="v">${m.muertosColaG}</div><div class="l">murieron esperando médico</div></div>
          <div class="kpi"><div class="v">${f0(m.cumpleG)} %</div><div class="l">I-III atendidos a tiempo</div></div>
          <div class="kpi"><div class="v">${f0(m.util.medicos)}/${f0(m.util.enfermeras)}/${f0(m.util.camas)} %</div><div class="l">utilización méd/enf/camas</div></div>
        </div>
        <ul class="diag">${O.RECURSOS.map(k => `<li class="${diag[k] ? 'mal' : 'bien'}"><b>${NOMBRE_REC[k]}:</b> ${diag[k] ? esc(diag[k]) + ' → <b>candidato a refuerzo</b>' : 'sin señales de saturación'}</li>`).join('')}</ul>
        ${c.plan ? '' : '<p class="nota"><b>Esta corrida no activó el plan de desastre.</b> Sin plan nadie convoca refuerzos, así que la optimización lo asume activo (a los 10 min de la alerta).</p>'}
      </section>
      <section class="card"><h2>3 · Buscar la mejor respuesta</h2>
        <div class="controles">
          <label>Meta: % de I-III atendidos a tiempo<input id="optMeta" type="number" min="30" max="100" value="${meta}"></label>
          <label>Réplicas por prueba<input id="optRep" type="number" min="2" max="20" value="${o ? o.replicas : 5}"></label>
          ${O.RECURSOS.map(k => `<label>${NOMBRE_REC[k]} disponibles<input id="optD_${k}" type="number" min="0" max="${O.limites(c, { [k]: 99 })[k]}" value="${disp[k]}"></label>`).join('')}
          <button id="optIr" class="prim">⚙ ${o ? 'Volver a optimizar' : 'Optimizar esta simulación'}</button>
        </div><div class="prog" id="optProgWrap" hidden><i id="optProg"></i></div><p class="nota" id="optEstado"></p>
        <p class="nota">Los refuerzos llegan ${S.DEMORA_REF.enfermeras} min (enfermeras), ${S.DEMORA_REF.medicos} min (médicos) y ${S.DEMORA_REF.camas} min (camas) después de la convocatoria y se pagan desde que llegan:
        médico ${cop(O.COSTO_H.medico)}/h, enfermera ${cop(O.COSTO_H.enfermera)}/h, cama ${cop(O.COSTO_H.cama)}/h. Cada prueba se repite con varias semillas (media ± IC 95 %).
        Meta: cero fallecidos I-III y al menos el % indicado atendido dentro de su tiempo máximo.</p></section>
      <div id="optRes"></div>`;

    cont.querySelector('#optSel').onchange = (ev) => { api.seleccionar(+ev.target.value); api.repintar(); };
    const btn = cont.querySelector('#optIr');
    if (buscando !== null) { btn.disabled = true; btn.textContent = '⚙ Optimizando…'; }
    btn.onclick = () => {
      const id = sel.id, base = Object.assign({}, c, { manual: false });
      const metaN = Math.max(30, Math.min(100, +cont.querySelector('#optMeta').value || 70));
      const replicas = Math.max(2, Math.min(20, Math.round(+cont.querySelector('#optRep').value || 5)));
      const disponibles = {};
      for (const k of O.RECURSOS) disponibles[k] = Math.max(0, Math.round(+cont.querySelector('#optD_' + k).value || 0));
      const visible = () => String(cont.dataset.corrida) === String(id) && !cont.hidden;
      btn.disabled = true; buscando = id; cont.querySelector('#optProgWrap').hidden = false; cont.querySelector('#optRes').innerHTML = '';
      O.optimizarRespuesta(base, { meta: metaN, replicas, disponibles },
        (f, n) => {
          if (!visible()) return;
          cont.querySelector('#optProg').style.width = (100 * f) + '%';
          cont.querySelector('#optEstado').textContent = `${n} combinaciones de refuerzos probadas (${n * replicas} simulaciones)…`;
        },
        (opt) => {
          buscando = null;
          // la misma catástrofe con la respuesta recomendada, para el antes / después
          const despues = O.simular(O.cfgOptimizada(base, opt));
          const antes = (sel.parcial || c.manual) ? O.simular(base).res : sel.res;
          opt.antes = O.indicadores(antes); opt.despues = O.indicadores(despues.res);
          api.guardar(id, opt, despues);
          api.repintar();
        });
    };
    if (o) pintar(cont.querySelector('#optRes'), sel, o, api);
  }

  const refTxt = (ref) => O.RECURSOS.filter(k => ref[k] > 0).map(k => `${ref[k]} ${O.nombre(k, ref[k])}`).join(', ') || 'ningún refuerzo';

  function pintar(el, sel, o, api) {
    const f = o.final, ini = o.inicial;
    const pasos = o.pasos.map(p => `<tr><td>${p.n}</td><td><b>${esc(p.decision)}</b></td><td>${esc(p.porque || (p.diagnostico && p.diagnostico.length ? p.diagnostico.join(' · ') : '—'))}</td>
      <td class="${p.muertosG ? 'mal' : 'bien'}">${pm(p.muertosG, p.muertosGIc, 1)}</td><td>${pm(p.cumpleG, p.cumpleGIc, 0)} %</td><td>${cop(p.costo)}</td></tr>`).join('');
    const d0 = o.demora.find(x => x.llamada === 0);
    const demora = o.demora.map(d => `<tr><td>${d.llamada === 0 ? 'Al recibir la alerta' : `${d.llamada} min después`}${d.llamada === o.llamada ? ' (estándar)' : ''}</td>
      <td class="${d.muertosG ? 'mal' : 'bien'}">${pm(d.muertosG, d.muertosGIc, 1)}</td><td>${pm(d.cumpleG, d.cumpleGIc, 0)} %</td>
      <td>${d0 && d.llamada ? (d.muertosG - d0.muertosG > 0 ? '+' : '') + (d.muertosG - d0.muertosG).toFixed(1) + ' fallecidos' : '—'}</td></tr>`).join('');
    el.innerHTML = `
      <section class="card ${o.cumpleMeta ? 'aplicada' : 'aviso'}"><h2>${o.cumpleMeta ? '✔ Respuesta recomendada' : 'Ninguna respuesta alcanza la meta: esta es la más cercana'}</h2>
        <div class="kpis">
          ${O.RECURSOS.map(k => `<div class="kpi"><div class="v">+${f.ref[k]}</div><div class="l">${NOMBRE_REC[k].toLowerCase()}</div></div>`).join('')}
          <div class="kpi ${f.muertosG ? 'mal' : 'bien'}"><div class="v">${pm(f.muertosG, f.muertosGIc, 1)}</div><div class="l">fallecidos I-III (IC 95 %)</div></div>
          <div class="kpi"><div class="v">${pm(f.cumpleG, f.cumpleGIc, 0)} %</div><div class="l">I-III a tiempo (IC 95 %)</div></div>
          <div class="kpi"><div class="v">${cop(f.costo)}</div><div class="l">costo de los refuerzos</div></div>
        </div>
        <p>Convocar <b>${refTxt(f.ref)}</b> al activar el plan (${o.llamada} min tras la alerta). Sin refuerzos: ${pm(ini.muertosG, ini.muertosGIc, 1)} fallecidos I-III y ${pm(ini.cumpleG, ini.cumpleGIc, 0)} % a tiempo.
        ${ini.muertosG > f.muertosG ? ` La respuesta evita <b>${(ini.muertosG - f.muertosG).toFixed(1)}</b> fallecidos graves.` : ''}
        ${o.cumpleMeta ? '' : ` ${esc(o.motivo)} Con tantas víctimas a la vez hay que reducir la demanda (derivación, red de referencia) además de reforzar.`}</p>
        <p class="nota">Meta ${o.meta} % · ${o.replicas} réplicas por prueba · ${o.evaluaciones} combinaciones probadas · disponibles ${o.disponibles.medicos}/${o.disponibles.enfermeras}/${o.disponibles.camas} méd/enf/camas.</p>
        <div class="pasos-sig"><button class="prim" data-ir="rec">💡 Ver recomendaciones →</button>
        <button id="optAplicar" class="sec">▶ Verla animada en Simulación</button></div></section>
      <section class="card"><h2>Cómo se llegó: cada paso sale del diagnóstico de los resultados</h2>
        <div class="tabla-wrap"><table class="cmp"><thead><tr><th>Paso</th><th>Decisión</th><th>Por qué (lo que mostraban los resultados)</th><th>Fallecidos I-III</th><th>I-III a tiempo</th><th>Costo refuerzos</th></tr></thead>
        <tbody>${pasos}</tbody></table></div></section>
      <section class="card"><h2>Efecto de convocar tarde</h2>
        <p class="nota">La misma respuesta (${refTxt(f.ref)}) convocada en distintos momentos.</p>
        <div class="tabla-wrap"><table class="cmp"><thead><tr><th>Convocatoria</th><th>Fallecidos I-III</th><th>I-III a tiempo</th><th>Frente a convocar con la alerta</th></tr></thead><tbody>${demora}</tbody></table></div></section>
      ${antesDespues(sel)}`;
    el.querySelector('#optAplicar').onclick = () => api.aplicar(sel, O.cfgOptimizada(sel.cfg, o));
  }

  /** Tarjeta "antes y después": la misma catástrofe con lo simulado y con la respuesta optimizada. */
  function antesDespues(sel) {
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
    return `<section class="card aplicada"><h2>Antes y después en tu simulación</h2>
      <p>Se repitió <b>la misma catástrofe</b> (mismos ${A.llegados} pacientes, semilla ${c.semilla}) con el plan activo y convocando ${refTxt(o.final.ref)}. La corrida quedó en el historial de <b>Resultados</b> como «optimizada».</p>
      <div class="tabla-wrap"><table class="cmp"><thead><tr><th></th><th>Antes: lo que simulaste<br>${c.plan ? 'con plan · ' + refTxt(c.refuerzos || { medicos: S.R_MED, enfermeras: S.R_ENF, camas: S.R_CAMA }) : 'sin plan, sin refuerzos'}</th><th>Después: respuesta optimizada<br>${refTxt(o.final.ref)}</th><th>Cambio</th></tr></thead>
      <tbody>${filas}</tbody></table></div>
      <p class="nota">Esta tabla es una sola corrida; las cifras con ± son el promedio de ${o.replicas} réplicas con semillas distintas, por eso pueden diferir un poco.${sel.parcial || c.manual ? ' Como tu corrida fue parcial o en modo comandante, el «antes» se recalculó completo y en automático para que la comparación sea justa.' : ''}</p></section>`;
  }

  root.UrgPanelOpt = { render, antesDespues, optimizables };
})(window);
