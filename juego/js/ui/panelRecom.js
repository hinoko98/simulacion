/* UI: pestaña "Recomendaciones" (basada en triaje y en los resultados de la corrida). */
(function (root) {
  'use strict';
  const S = root.UrgSim;
  const { COLOR, ESCENARIOS } = S;
  const f0 = (x) => Math.round(x);
  const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const TXT = { ok: 'Cumple', aviso: 'En riesgo', critico: 'Crítico' };
  const G = root.UrgGraficas;

  function render(cont, runs, sel) {
    if (!sel) {
      cont.innerHTML = `<div class="vacio"><h2>Sin datos para recomendar</h2>
        <p>Termina una simulación (o pulsa <b>Ver resultados</b> a mitad de la corrida) y aquí aparecerán las recomendaciones.</p></div>`;
      return;
    }
    // Una corrida generada al optimizar muestra las recomendaciones de la corrida original.
    if (sel.deOpt) sel = runs.find(x => x.id === sel.deOpt) || sel;
    const P = root.UrgPanelOpt, evento = ESCENARIOS[sel.cfg.escenario].evento;
    if (evento && !P.optV2(sel)) {
      cont.innerHTML = `<header class="vh"><h1>Recomendaciones</h1><p>${esc(root.UrgResultados.etiquetaCorrida(sel))}</p></header>
        <div class="vacio"><h2>Primero optimiza esta corrida</h2>
        <p>Las recomendaciones salen de la optimización: a partir de los resultados de la simulación se decide a quién convocar de refuerzo y cuándo.<br>
        Ve al <b>historial de corridas</b> en Resultados y pulsa <b>⚙ Optimizar</b> en esta corrida.</p>
        <button class="prim" data-ir="res">📊 Ir al historial de Resultados</button></div>`;
      return;
    }
    const a = root.UrgRecomendaciones.generar(sel, runs), r = sel.res;
    const h = [];
    h.push(`<header class="vh"><h1>Recomendaciones</h1>
      <p>Basadas en el triage (Res. 5596/2015), en la corrida ${esc(root.UrgResultados.etiquetaCorrida(sel))}${a.optimo ? ' y en su optimización de recursos' : ''}.</p></header>`);

    const o = a.optimo;
    if (o) {
      const cop = (x) => '$' + Math.round(x).toLocaleString('es-CO');
      const pm = (v, ic, d) => v.toFixed(d) + (ic > 0 ? ' ± ' + ic.toFixed(d) : '');
      const f = o.final, ini = o.inicial, N = root.UrgOptimizador.nombre;
      const ref = o.refuerzos.map(x => `${x.n} ${N(x.recurso, x.n)}`).join(', ') || 'ningún refuerzo';
      h.push(`<section class="card ${o.cumpleMeta ? '' : 'aviso'}"><h2>${o.cumpleMeta ? '⚙ Respuesta óptima para esta catástrofe' : '⚙ Ninguna respuesta alcanza la meta: esta es la más cercana'}</h2>
        <p>Convocar <b>${esc(ref)}</b> al activar el plan.</p>
        <div class="tabla-wrap"><table class="cmp"><thead><tr><th></th><th>Refuerzos</th><th>Fallecidos I-III</th><th>I-III a tiempo</th><th>Costo de refuerzos</th></tr></thead><tbody>
          <tr><td>Plan activo sin refuerzos</td><td>—</td><td class="${ini.muertosG ? 'mal' : 'bien'}">${pm(ini.muertosG, ini.muertosGIc, 1)}</td><td>${pm(ini.cumpleG, ini.cumpleGIc, 0)} %</td><td>${cop(0)}</td></tr>
          <tr><td>Respuesta ${o.cumpleMeta ? 'óptima' : 'más cercana'}</td><td><b>${esc(ref)}</b></td><td class="${f.muertosG ? 'mal' : 'bien'}">${pm(f.muertosG, f.muertosGIc, 1)}</td><td>${pm(f.cumpleG, f.cumpleGIc, 0)} %</td><td>${cop(f.costo)}</td></tr>
        </tbody></table></div>
        ${o.costoDemora >= 0.1 ? `<p><b>Convocar a los 30 min en vez de con la alerta cuesta ${o.costoDemora.toFixed(1)} fallecidos graves más.</b></p>` : ''}
        <p class="nota">Meta: ${o.meta} % de pacientes I-III a tiempo y cero fallecidos I-III · promedio de ${o.replicas} réplicas con los mismos pacientes · cada refuerzo se eligió según el cuello de botella que mostraban los resultados.</p>
        <div class="pasos-sig"><button class="prim" data-animar="${sel.id}">▶ Verla animada en Simulación</button><button class="sec" data-ir="res">📊 Volver al historial</button></div></section>`);
      h.push(graficasOpt(o));
      h.push(`<section class="card"><h2>Cómo se llegó: cada refuerzo sale del diagnóstico de los resultados</h2>${P.pasosHtml(o)}</section>`);
      h.push(`<section class="card"><h2>Efecto de convocar tarde</h2>
        <p class="nota">La misma respuesta (${esc(P.refTxt(o.final.ref))}) convocada en distintos momentos tras la alerta.</p>
        <div class="graf-grid"><div>${G.barras(o.demora.map(d => ({ etq: d.llamada === 0 ? 'Con la alerta' : `A los ${d.llamada} min`, v: d.muertosG, etiqueta: true,
          tip: `Convocar ${d.llamada === 0 ? 'con la alerta' : 'a los ' + d.llamada + ' min'}: ${d.muertosG.toFixed(1)} fallecidos I-III, ${Math.round(d.cumpleG)} % a tiempo` })),
          { titulo: 'Fallecidos I-III según el momento de la convocatoria', alto: 200 })}<p class="graf-t">Fallecidos I-III según cuándo se convoca</p></div>
        <div>${P.demoraHtml(o)}</div></div></section>`);
      const A = o.antes, D = o.despues;
      h.push(P.antesDespues(sel, A && D ? `<div class="graf-una">${G.agrupadas(['Fallecidos', 'Fallecidos I-III', 'Abandonos', 'Derivados'],
        [{ nombre: 'Antes: lo que simulaste', valores: [A.muertos, A.muertosG, A.abandonos, A.derivados] },
         { nombre: 'Después: respuesta optimizada', valores: [D.muertos, D.muertosG, D.abandonos, D.derivados] }], { titulo: 'Antes y después', alto: 220 })}</div>` : ''));
    }

    const d = a.desborde;
    h.push(`<section class="card ${d.saturado ? 'aviso' : ''}"><h2>${d.saturado ? '⚠ El hospital se desbordó: qué hacer cuando todo está lleno' : 'Protocolo si camas, médicos o enfermeras se llenan'}</h2>
      ${d.saturado ? `<p>Se detectó saturación: ${esc(d.razones.join('; '))}. Derivados: <b>${d.derivados}</b> · abandonos: <b>${d.abandonos}</b>.</p>` : '<p>En esta corrida no hubo desborde, pero este es el orden de decisión según el triaje:</p>'}
      <ol class="pasos">${d.pasos.map(p => `<li><b>${esc(p.n)}</b><span>${esc(p.txt)}</span></li>`).join('')}</ol></section>`);

    h.push('<section class="card"><h2>Estado por nivel de triaje</h2><div class="niveles">' + a.niveles.map(n => {
      const d = n.datos;
      return `<article class="nivel ${n.estado}" style="--c:${COLOR[n.nivel]}">
        <div class="cab"><span class="dot" style="background:${COLOR[n.nivel]}"></span><b>Triage ${n.romano} · ${n.nombre}</b><small>${esc(n.desc)}</small><em>${TXT[n.estado]}</em></div>
        <div class="cifras"><span><b>${d.llegados}</b> llegados</span><span><b>${f0(d.cumple)} %</b> a tiempo</span><span><b>${d.muertos}</b> fallecidos</span><span><b>${d.abandonos}</b> abandonos</span></div>
        <p class="proto"><b>Protocolo:</b> ${esc(n.protocolo.accion)}</p>
        <p class="rol">${esc(n.protocolo.rol)}${d.muertos ? ` · ${d.muertosTriaje} murieron sin clasificar, ${d.muertosCola} ya clasificados` : ''}</p>
      </article>`;
    }).join('') + '</div></section>');

    if (a.comparacion) {
      const c = a.comparacion, dif = c.muertosActual - c.muertosOtra;
      h.push(`<section class="card ${dif > 0 ? 'aviso' : ''}"><h2>Comparación con otra corrida (mismo escenario y mismos pacientes)</h2>
        <p>La mejor corrida comparable (${c.plan ? 'con' : 'sin'} plan, ${c.apropiativa ? 'con' : 'sin'} apropiativa, ${c.medicos}/${c.enfermeras}/${c.camas} méd/enf/camas) tuvo <b>${c.muertosOtra}</b> fallecidos frente a <b>${c.muertosActual}</b> de esta corrida
        ${dif > 0 ? '→ cambiar a esa configuración habría evitado ' + dif + ' muertes.' : dif < 0 ? '→ esta corrida ya es mejor que esa.' : '→ resultado igual.'}</p></section>`);
    }

    h.push('<section class="card"><h2>Acciones recomendadas (por prioridad)</h2><ol class="recs">' + a.recs.map(x => `
      <li class="p${x.prio}"><div class="t"><span class="pri">${['', 'Urgente', 'Importante', 'Mejora'][x.prio]}</span>${esc(x.titulo)}</div>
      <p>${esc(x.detalle)}</p>
      <div class="meta">${x.niveles.map(n => `<span class="chip" style="background:${COLOR[n]}">N${n}</span>`).join('')}${x.impacto ? `<small>Impacto esperado: ${esc(x.impacto)}</small>` : ''}</div></li>`).join('') + '</ol></section>');

    if (o && o.refuerzos.length) {
      h.push(`<section class="card"><h2>Cómo probarlas</h2><p>Pulsa <b>▶ Verla animada en Simulación</b>: se repite la misma catástrofe (mismos pacientes, semilla ${sel.cfg.semilla})
        con la respuesta ${o.cumpleMeta ? 'óptima' : 'más cercana a la meta'}. Cualquier diferencia en los resultados se debe solo a los refuerzos, y la nueva corrida queda en el historial para compararla.</p>
        <div class="pasos-sig"><button class="prim" data-animar="${sel.id}">▶ Verla animada en Simulación</button><button class="sec" data-ir="res">📊 Ir al historial</button></div></section>`);
    } else h.push(`<section class="card"><h2>Cómo probarlas</h2><p>Vuelve a <b>Simulación</b>, elige el mismo escenario y <b>la misma semilla (${sel.cfg.semilla})</b>: los pacientes serán exactamente los mismos, así que
      cualquier diferencia se debe a tus cambios. Prueba, en este orden: activar el plan, activar la atención apropiativa, subir enfermeras de triaje y subir médicos. Cada corrida queda guardada para compararla.</p></section>`);
    cont.innerHTML = h.join('');
  }

  /** Gráficas de la búsqueda: cómo cambian fallecidos y cumplimiento con cada paso. */
  function graficasOpt(o) {
    const CORTO = { medicos: 'méd', enfermeras: 'enf', camas: 'camas' };
    const pasos = o.pasos.map(p => ({ p, etq: p.n === 0 ? 'Inicio' : `${p.cambio > 0 ? '+' : '−'}${Math.abs(p.cambio)} ${CORTO[p.recurso]}` }));
    const ult = pasos.length - 1;
    return `<section class="card"><h2>Gráficas de la optimización</h2>
      <p class="nota">Cada punto es un paso de la búsqueda (media de ${o.replicas} réplicas). Pasa el cursor por una barra o un punto para ver el detalle.</p>
      <div class="graf-grid ancha">
        <div>${G.barras(pasos.map(({ p, etq }, i) => ({ etq, v: p.muertosG, etiqueta: i === 0 || i === ult,
          tip: `Paso ${p.n} · ${p.decision}: ${p.muertosG.toFixed(1)} fallecidos I-III` })), { titulo: 'Fallecidos I-III por paso' })}
          <p class="graf-t">Fallecidos I-III en cada paso</p></div>
        <div>${G.linea(pasos.map(({ p, etq }, i) => ({ etq, v: p.cumpleG, etiqueta: i === 0 || i === ult,
          tip: `Paso ${p.n} · ${p.decision}: ${Math.round(p.cumpleG)} % de I-III a tiempo` })), { titulo: '% de I-III atendido a tiempo por paso', unidad: ' %', max: 100, ref: { v: o.meta, txt: `meta ${o.meta} %` } })}
          <p class="graf-t">% de pacientes I-III atendidos a tiempo</p></div>
        <div>${G.barras(pasos.map(({ p, etq }, i) => ({ etq, v: p.costo / 1e6, etiqueta: i === ult, tip: `Paso ${p.n} · ${p.decision}: $${Math.round(p.costo).toLocaleString('es-CO')}` })),
          { titulo: 'Costo de los refuerzos por paso', unidad: ' M', decimales: 2 })}
          <p class="graf-t">Costo acumulado de los refuerzos (millones de COP)</p></div>
      </div></section>`;
  }

  root.UrgPanelRecom = { render };
})(window);
