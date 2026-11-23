/* UI: pestaña "Resultados" (KPIs, tabla por nivel de triaje, línea de tiempo, historial). */
(function (root) {
  'use strict';
  const S = root.UrgSim;
  const { NOMBRE, COLOR, NIVELES, ESCENARIOS } = S;
  const f0 = (x) => Math.round(x);
  const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function etiquetaCorrida(c) {
    return `${ESCENARIOS[c.cfg.escenario].nombre} · ${c.cfg.plan ? 'con plan' : 'sin plan'}${c.cfg.apropiativa ? ' · apropiativa' : ''}${c.deOpt ? ' · optimizada' : ''}`;
  }

  /* Ayudas emergentes de la tabla "Desempeño por nivel de triaje": [columna, explicación]. */
  const AYUDA = [
    ['Triage', 'Nivel de prioridad asignado en la clasificación (Res. 5596/2015): I es el más grave, V el menos.'],
    ['Llegados', 'Pacientes de este nivel que entraron a urgencias durante la simulación.'],
    ['Atendidos', 'Pacientes de este nivel que alcanzaron a ser vistos por un médico.'],
    ['Espera media', 'Tiempo promedio desde la llegada hasta que los ve el médico.'],
    ['P90', 'Percentil 90: 9 de cada 10 pacientes esperaron este tiempo o menos. Muestra los peores casos, que el promedio esconde.'],
    ['Límite', 'Tiempo máximo de espera que la norma permite para este nivel.'],
    ['Cumple', 'Porcentaje de pacientes atendidos dentro del límite. Verde: 85 % o más. Rojo: menos de 60 %.'],
    ['Fallecidos', 'Pacientes de este nivel que murieron esperando atención.'],
    ['Abandonos', 'Pacientes que se cansaron de esperar y se fueron sin ser atendidos.'],
    ['Derivados', 'Pacientes enviados a otros hospitales porque este estaba desbordado.'],
  ];
  const attr = (s) => esc(s).replace(/"/g, '&quot;');
  const tip = (nombre, texto, clase) => `<span class="tip ${clase || ''}" tabindex="0" data-tip="${attr(texto)}">${esc(nombre)}</span>`;

  function kpi(valor, etiqueta, clase) {
    return `<div class="kpi ${clase || ''}"><div class="v">${valor}</div><div class="l">${etiqueta}</div></div>`;
  }

  function render(cont, runs, sel) {
    if (!sel) {
      cont.innerHTML = `<div class="vacio"><h2>Aún no hay resultados</h2>
        <p>Ejecuta una simulación en la pestaña <b>Simulación</b> y pulsa <b>Ver resultados</b> o deja que termine.</p></div>`;
      return;
    }
    const r = sel.res, c = sel.cfg;
    const html = [];
    html.push(`<header class="vh"><h1>Resultados de la catástrofe</h1>
      <p>${esc(etiquetaCorrida(sel))} · ${c.medicos} médicos, ${c.enfermeras} enfermeras, ${c.camas} camas · semilla ${c.semilla}
      ${sel.parcial ? ' · <b>corrida parcial</b> (' + f0(r.t) + ' min simulados)' : ''}</p></header>`);

    html.push('<section class="kpis">' +
      kpi(r.llegados, 'pacientes llegados') +
      kpi(r.altas, 'altas') +
      kpi(r.muertos, 'fallecidos esperando', r.muertos ? 'mal' : 'bien') +
      kpi(r.abandonos, 'abandonos sin atención', r.abandonos > r.llegados * 0.15 ? 'mal' : '') +
      kpi(r.derivados, 'derivados a otros hospitales') +
      kpi(f0(r.espMedia) + ' min', 'espera media a médico') +
      kpi(f0(r.cumple) + ' %', 'cumple tiempos de triage', r.cumple < 60 ? 'mal' : r.cumple > 85 ? 'bien' : '') +
      kpi(f0(r.estancia) + ' min', 'estancia media') +
      kpi(r.enSistema, 'aún en el hospital') + '</section>');

    if (ESCENARIOS[c.escenario].evento && !sel.deOpt) {
      const o = sel.opt && sel.opt.version === 2 ? sel.opt : null;
      const ref = o ? ['medicos', 'enfermeras', 'camas'].filter(k => o.final.ref[k] > 0).map(k => `${o.final.ref[k]} ${root.UrgOptimizador.nombre(k, o.final.ref[k])}`).join(', ') : '';
      html.push(`<section class="card sig"><div><h2>${o ? 'Esta catástrofe ya está optimizada' : 'Siguiente paso: optimizar la respuesta a esta catástrofe'}</h2>
        <p class="nota">${o ? `Respuesta ${o.cumpleMeta ? 'óptima' : 'más cercana a la meta'}: convocar ${ref || 'ningún refuerzo'}.`
          : 'A partir de estos resultados, busca a quién convocar de refuerzo (médicos, enfermeras, camas) con estos mismos pacientes.'}</p></div>
        <div class="pasos-sig"><button class="prim" data-ir="opt">⚙ ${o ? 'Ver optimización' : 'Optimizar esta simulación'} →</button>
        ${o ? '<button class="sec" data-ir="rec">💡 Ver recomendaciones →</button>' : ''}</div></section>`);
    }

    html.push(`<section class="card"><h2>Utilización de recursos</h2><div class="barras">` +
      [['Médicos', r.util.medicos], ['Enfermeras de triaje', r.util.enfermeras], ['Camas', r.util.camas]].map(([n, v]) =>
        `<div class="barra"><span>${n}</span><div class="pista"><i style="width:${Math.min(100, v)}%;background:${v > 90 ? '#e53935' : v > 75 ? '#fb8c00' : '#26a69a'}"></i></div><b>${f0(v)} %</b></div>`).join('') +
      `</div><p class="nota">Picos: ${r.picoColaT} esperando triaje · ${r.picoColaD} esperando médico · ${r.interrup} consultas interrumpidas por prioridad · ${r.ingresoDirecto} ingresos directos por ambulancia.</p></section>`);

    html.push(`<section class="card"><h2>Desempeño por nivel de triaje</h2>
      <p class="nota">Pasa el cursor (o toca) sobre el nombre de cada columna o nivel para ver qué significa.</p><div class="tabla-wrap con-tips"><table>
      <thead><tr>${AYUDA.map(([n, t], i) => `<th>${tip(n, t, i >= AYUDA.length - 3 ? 'der' : '')}</th>`).join('')}</tr></thead><tbody>` +
      NIVELES.map(n => {
        const l = r.porNivel[n];
        return `<tr><td><span class="dot" style="background:${COLOR[n]}"></span>${tip(S.ROMANO[n] + ' · ' + NOMBRE[n], `${S.DESC[n]}. Debe ser atendido en máximo ${S.LIMITE[n]} min.`, 'lado')}</td><td>${l.llegados}</td><td>${l.atendidos}</td>
          <td>${f0(l.espMedia)} min</td><td>${f0(l.espP90)} min</td><td>${l.limite} min</td>
          <td class="${l.cumple < 60 ? 'mal' : l.cumple >= 85 ? 'bien' : ''}">${f0(l.cumple)} %</td>
          <td class="${l.muertos ? 'mal' : ''}">${l.muertos}</td><td>${l.abandonos}</td><td>${l.derivados}</td></tr>`;
      }).join('') + '</tbody></table></div></section>');

    html.push(`<section class="card"><h2>Evolución durante el turno</h2>
      <canvas id="grafLinea" height="260"></canvas>
      <div class="leyenda"><span><i style="background:#1565c0"></i>Esperan médico</span><span><i style="background:#26a69a"></i>Esperan triaje</span>
      <span><i style="background:#e53935"></i>Fallecidos (acum.)</span><span><i style="background:#7e57c2"></i>Esperan cama</span></div></section>`);

    html.push(`<section class="card"><h2>Historial de corridas</h2><p class="nota">Compara escenarios y configuraciones. Pulsa una fila para verla en detalle.</p>
      <div class="tabla-wrap"><table class="hist"><thead><tr><th>#</th><th>Escenario</th><th>Plan</th><th>Apropiativa</th><th>Méd/Enf/Camas</th><th>Semilla</th><th>Llegados</th><th>Fallecidos</th><th>Abandonos</th><th>Cumple</th></tr></thead><tbody>` +
      runs.map((h, i) => `<tr data-id="${h.id}" class="${h.id === sel.id ? 'sel' : ''}"><td>${i + 1}</td><td>${esc(ESCENARIOS[h.cfg.escenario].nombre)}${h.parcial ? ' (parcial)' : ''}${h.deOpt ? ' <b class="bien">· optimizada</b>' : ''}</td>
        <td>${h.cfg.plan ? 'Sí' : 'No'}</td><td>${h.cfg.apropiativa ? 'Sí' : 'No'}</td><td>${h.cfg.medicos}/${h.cfg.enfermeras}/${h.cfg.camas}</td><td>${h.cfg.semilla}</td>
        <td>${h.res.llegados}</td><td class="${h.res.muertos ? 'mal' : 'bien'}">${h.res.muertos}</td><td>${h.res.abandonos}</td><td>${f0(h.res.cumple)} %</td></tr>`).join('') +
      `</tbody></table></div><button id="btnBorrarHist" class="sec">Borrar historial</button></section>`);

    cont.innerHTML = html.join('');
    grafica(cont.querySelector('#grafLinea'), r);
  }

  function grafica(cv, r) {
    const dpr = window.devicePixelRatio || 1, w = cv.parentElement.clientWidth - 32, h = 260;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    const m = { l: 40, r: 12, t: 12, b: 28 }, pw = w - m.l - m.r, ph = h - m.t - m.b;
    const s = r.serie; if (s.length < 2) return;
    const tMax = s[s.length - 1].t;
    const ymax = Math.max(5, ...s.map(p => Math.max(p.colaD, p.colaT, p.muertos, p.colaC))) * 1.1;
    const X = (t) => m.l + pw * t / tMax, Y = (v) => m.t + ph * (1 - v / ymax);
    ctx.font = '11px system-ui'; ctx.fillStyle = '#6b7a86'; ctx.strokeStyle = '#e3e8ec'; ctx.lineWidth = 1; ctx.textAlign = 'right';
    for (let k = 0; k <= 4; k++) { const v = ymax * k / 4; ctx.beginPath(); ctx.moveTo(m.l, Y(v)); ctx.lineTo(w - m.r, Y(v)); ctx.stroke(); ctx.fillText(Math.round(v), m.l - 6, Y(v) + 4); }
    ctx.textAlign = 'center';
    for (let t = 0; t <= tMax; t += 120) ctx.fillText(S.hora(t), X(t), h - 8);
    const marca = (t, color, txt) => { if (t === null || t > tMax) return; ctx.strokeStyle = color; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(X(t), m.t); ctx.lineTo(X(t), m.t + ph); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(txt, X(t) + 4, m.t + 10); };
    marca(r.eventoT, '#e53935', 'catástrofe'); marca(r.planT, '#2e7d32', 'plan');
    const linea = (campo, color) => { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); s.forEach((p, i) => i ? ctx.lineTo(X(p.t), Y(p[campo])) : ctx.moveTo(X(p.t), Y(p[campo]))); ctx.stroke(); };
    linea('colaT', '#26a69a'); linea('colaC', '#7e57c2'); linea('colaD', '#1565c0'); linea('muertos', '#e53935');
  }

  root.UrgResultados = { render, etiquetaCorrida };
})(window);
