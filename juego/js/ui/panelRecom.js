/* UI: pestaña "Recomendaciones" (basada en triaje y en los resultados de la corrida). */
(function (root) {
  'use strict';
  const S = root.UrgSim;
  const { COLOR, ESCENARIOS } = S;
  const f0 = (x) => Math.round(x);
  const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const TXT = { ok: 'Cumple', aviso: 'En riesgo', critico: 'Crítico' };

  function render(cont, runs, sel) {
    if (!sel) {
      cont.innerHTML = `<div class="vacio"><h2>Sin datos para recomendar</h2>
        <p>Termina una simulación (o pulsa <b>Ver resultados</b> a mitad de la corrida) y aquí aparecerán las recomendaciones.</p></div>`;
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
        <div class="pasos-sig"><button class="sec" data-ir="opt">⚙ Ver los pasos de la optimización</button></div></section>`);
      h.push(root.UrgPanelOpt.antesDespues(sel));
    } else if (ESCENARIOS[sel.cfg.escenario].evento) {
      h.push(`<section class="card aviso"><h2>Aún no has optimizado esta catástrofe</h2>
        <p>Las recomendaciones de recursos serán generales hasta que lo hagas: la optimización dice a quién convocar de refuerzo, y cuándo, en esta misma catástrofe.</p>
        <div class="pasos-sig"><button class="prim" data-ir="opt">⚙ Optimizar esta simulación →</button></div></section>`);
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
      h.push(`<section class="card"><h2>Cómo probarlas</h2><p>Abre <b>Optimización</b> y pulsa <b>▶ Verla animada en Simulación</b>: se repite la misma catástrofe (mismos pacientes, semilla ${sel.cfg.semilla})
        con la respuesta ${o.cumpleMeta ? 'óptima' : 'más cercana a la meta'}. Cualquier diferencia en los resultados se debe solo a los refuerzos, y la nueva corrida queda en el historial para compararla.</p>
        <div class="pasos-sig"><button class="sec" data-ir="opt">⚙ Ir a Optimización</button></div></section>`);
    } else h.push(`<section class="card"><h2>Cómo probarlas</h2><p>Vuelve a <b>Simulación</b>, elige el mismo escenario y <b>la misma semilla (${sel.cfg.semilla})</b>: los pacientes serán exactamente los mismos, así que
      cualquier diferencia se debe a tus cambios. Prueba, en este orden: activar el plan, activar la atención apropiativa, subir enfermeras de triaje y subir médicos. Cada corrida queda guardada para compararla.</p></section>`);
    cont.innerHTML = h.join('');
  }

  root.UrgPanelRecom = { render };
})(window);
