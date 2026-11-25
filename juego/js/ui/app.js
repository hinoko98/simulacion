/* UI: controla las pestañas, el bucle de simulación y el historial de corridas. */
(function () {
  'use strict';
  const S = UrgSim;
  const $ = (id) => document.getElementById(id);
  const canvas = $('hospital'), ctx = canvas.getContext('2d');

  let sim = null, corriendo = false, velocidad = 6, acc = 0, ultimo = performance.now();
  // guardada: false = la simulación actual no está en el historial; id = guardada como parcial (se actualizará);
  // true = guardada ya terminada (no se vuelve a guardar)
  let runs = [], selId = null, guardada = false, vista = 'sim';
  let extraCfg = null;   // refuerzos/llamada de una respuesta optimizada cargada con "Verla animada"; se borra al tocar los controles
  const CLAVE = 'urg_runs_v1';

  try { runs = JSON.parse(localStorage.getItem(CLAVE) || '[]'); } catch (e) { runs = []; }
  if (runs.length) selId = runs[runs.length - 1].id;

  /* ---- canvas nítido ---- */
  function ajustarCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = (S.W + S.MARGEN) * dpr; canvas.height = S.H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  ajustarCanvas();

  /* ---- configuración ---- */
  function leerCfg() {
    return { escenario: $('escenario').value, medicos: +$('medicos').value, enfermeras: +$('enfermeras').value,
      camas: +$('camas').value, plan: $('plan').checked, apropiativa: $('apropiativa').checked,
      derivar: $('derivar').checked, manual: $('manual').checked, realismo: $('realismo').checked,
      victimasNivel: S.ESCENARIOS[$('escenario').value].evento ? VIC.map(i => +$(i).value) : null,
      semilla: Math.max(1, parseInt($('semilla').value, 10) || 42), ...(extraCfg || {}) };
  }
  const porUsuario = (fn) => (...a) => { extraCfg = null; return fn(...a); };
  function reiniciar() {
    sim = new S.Sim(leerCfg()); corriendo = false; guardada = false; acc = 0;
    $('btnIniciar').textContent = '▶ Iniciar'; bloquear(false); etiquetas(); actualizarHud(); $('fin').hidden = true;
  }
  const VIC = ['vic1', 'vic2', 'vic3', 'vic4', 'vic5'];
  function bloquear(b) {
    ['escenario', 'medicos', 'enfermeras', 'camas', 'plan', 'apropiativa', 'derivar', 'manual', 'realismo', 'semilla', ...VIC].forEach(i => { $(i).disabled = b; });
    document.querySelectorAll('.step button').forEach(x => { x.disabled = b; });
    $('aviso').hidden = !b;
  }
  function etiquetas() {
    const e = S.ESCENARIOS[$('escenario').value];
    $('descEsc').textContent = e.desc;
    $('vVic').textContent = e.evento ? VIC.reduce((s, i) => s + (+$(i).value || 0), 0) : '—';
    if (!e.evento) { VIC.forEach(i => { $(i).disabled = true; $(i).value = 0; }); document.querySelectorAll('.step button[data-t^=vic]').forEach(x => { x.disabled = true; }); }
  }
  function cambioEscenario() {
    const e = S.ESCENARIOS[$('escenario').value];
    S.distribucionBase($('escenario').value).forEach((n, k) => { $(VIC[k]).value = n; });
    etiquetas(); reiniciar();
  }

  /* ---- historial ---- */
  function guardarCorrida() {
    // Una simulación = una sola entrada del historial: si ya se guardó (p. ej. con "Ver resultados ahora"),
    // se actualiza esa misma entrada en lugar de crear otra.
    if (guardada === true) return;
    if (sim.t === 0) return;                                   // aún no ha empezado: no hay nada que guardar
    const res = sim.resumen(), parcial = !sim.terminado;
    const previa = guardada ? runs.find(r => r.id === guardada) : null;
    if (previa) {
      previa.res = res; previa.parcial = parcial;
      delete previa.opt;                                       // la optimización era de los datos anteriores
      runs = runs.filter(r => r.deOpt !== previa.id);
      selId = previa.id;
    } else {
      const c = { id: Date.now(), cfg: Object.assign({}, sim.cfg), res, parcial };
      runs.push(c); if (runs.length > 12) runs.shift();
      selId = c.id;
    }
    guardada = parcial ? selId : true;                         // parcial: recuerda su id para actualizarla luego
    persistir(); badge();
  }
  function persistir() { try { localStorage.setItem(CLAVE, JSON.stringify(runs)); } catch (e) { /* sin almacenamiento */ } }
  function badge() { $('nRuns').textContent = runs.length; $('nRuns').hidden = !runs.length; }
  const seleccion = () => runs.find(r => r.id === selId) || runs[runs.length - 1] || null;

  /* ---- pestañas ---- */
  /* La optimización trabaja sobre la corrida seleccionada y su resultado se guarda dentro de ella. */
  const apiOpt = {
    /* opt: resumen de la optimización; optimizada: { cfg, res } de la misma catástrofe con la dotación óptima. */
    guardar(id, opt, optimizada) {
      const c = runs.find(r => r.id === id); if (!c) return;
      c.opt = opt;
      if (optimizada) {
        runs = runs.filter(r => r.deOpt !== id);
        runs.push({ id: Date.now(), cfg: optimizada.cfg, res: optimizada.res, parcial: false, deOpt: id });
        while (runs.length > 12) runs.splice(runs.findIndex(r => r.id !== id), 1);
      }
      persistir(); badge();
    },
    alCambiar() { if (vista === 'res') pintarRes(); },
    /* Al terminar una optimización se abren las recomendaciones de esa corrida. */
    alTerminar(id) { selId = id; persistir(); irA('rec'); },
    /* Repite la misma catástrofe (escenario, víctimas, semilla, políticas) con la respuesta optimizada (cfg completa). */
    aplicar(corrida, cfg) {
      const c = cfg;
      bloquear(false);
      $('escenario').value = c.escenario; $('semilla').value = c.semilla;
      ['plan', 'apropiativa', 'derivar', 'realismo'].forEach(i => { $(i).checked = !!c[i]; });
      $('manual').checked = false;
      (c.victimasNivel || S.distribucionBase(c.escenario)).forEach((n, k) => { $(VIC[k]).value = n; });
      $('medicos').value = c.medicos; $('enfermeras').value = c.enfermeras; $('camas').value = c.camas;
      extraCfg = { refuerzos: Object.assign({}, c.refuerzos), llamada: c.llamada };
      etiquetas(); reiniciar(); irA('sim');
    },
  };
  function irA(v) {
    if (v === 'opt') v = 'res';   // la optimización vive en el historial de Resultados
    vista = v;
    document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('act', b.dataset.v === v));
    document.querySelectorAll('.vista').forEach(s => { s.hidden = s.id !== 'v-' + v; });
    if (v === 'res') pintarRes();
    if (v === 'rec') {
      UrgPanelRecom.render($('v-rec'), runs, seleccion());
      $('v-rec').querySelectorAll('[data-animar]').forEach(b => b.onclick = () => {
        const run = runs.find(r => r.id === +b.dataset.animar), o = run && UrgPanelOpt.optV2(run);
        if (o) apiOpt.aplicar(run, UrgOptimizador.cfgOptimizada(run.cfg, o));
      });
    }
  }
  function pintarRes() {
    UrgResultados.render($('v-res'), runs, seleccion());
    $('v-res').querySelectorAll('.hist tbody tr').forEach(tr => tr.onclick = () => { selId = +tr.dataset.id; pintarRes(); });
    $('v-res').querySelectorAll('.btnOpt').forEach(b => b.onclick = (ev) => {
      ev.stopPropagation();
      const run = runs.find(r => r.id === +b.dataset.opt);
      if (run) { selId = run.id; UrgPanelOpt.lanzar(run, apiOpt); }
    });
    $('v-res').querySelectorAll('.btnRec').forEach(b => b.onclick = (ev) => { ev.stopPropagation(); selId = +b.dataset.rec; irA('rec'); });
    const b = $('v-res').querySelector('#btnBorrarHist');
    if (b) b.onclick = () => { runs = []; selId = null; persistir(); badge(); pintarRes(); };
  }
  document.querySelectorAll('.nav button').forEach(b => b.onclick = () => irA(b.dataset.v));
  /* Botones de "paso siguiente" que pintan los paneles: <button data-ir="res"> */
  document.querySelector('main').addEventListener('click', (ev) => { const b = ev.target.closest('[data-ir]'); if (b) irA(b.dataset.ir); });

  /* ---- HUD ---- */
  const TIPO = { alerta: '🔴', plan: '🟢', muerte: '✖', abandono: '↩', info: '•' };
  let ultimoLog = -1;
  function actualizarHud() {
    const c = sim.contadores();
    $('hCola').textContent = c.colaT; $('hMed').textContent = c.colaD; $('hCons').textContent = `${c.consulta}/${c.medAct}`;
    $('hCam').textContent = `${c.camas}/${c.camAct}`; $('hAltas').textContent = c.altas; $('hMuertos').textContent = c.muertos; $('hAband').textContent = c.abandonos;
    $('hPers').textContent = `${c.medAct} méd · ${c.enfAct} enf`;
    $('hPts').textContent = sim.puntaje(sim.resumen().cumple);
    const mando = sim.manual; $('mando').hidden = !mando; canvas.classList.toggle('manual', mando);
    if (mando) {
      $('cupo').textContent = Math.floor(sim.cupo);
      document.querySelectorAll('.ord').forEach(b => {
        const hecho = sim.ordenes[b.dataset.o] !== undefined;
        b.disabled = hecho || sim.alertaT === null || sim.terminado || !corriendo;
        b.classList.toggle('hecho', hecho);
        b.title = sim.alertaT === null ? 'Disponible cuando ocurra el suceso' : '';
      });
    }
    $('progreso').style.width = Math.min(100, 100 * sim.t / sim.horizonte) + '%';
    const n = sim.log.length + (sim.log.length ? sim.log[sim.log.length - 1].t : 0);
    if (n !== ultimoLog) {
      ultimoLog = n;
      $('bitacora').innerHTML = sim.log.slice(-14).reverse().map(l =>
        `<li class="${l.tipo}"><time>${S.hora(l.t)}</time><span>${TIPO[l.tipo] || '•'}</span>${l.txt}</li>`).join('');
    }
  }

  /* ---- interacción con el lienzo (modo comandante) ---- */
  let hover = null;
  function pacienteEn(ev) {
    const r = canvas.getBoundingClientRect(), x = (ev.clientX - r.left) * (S.W + S.MARGEN) / r.width - S.MARGEN, y = (ev.clientY - r.top) * S.H / r.height;
    let best = null, bd = 16 * 16;
    for (const p of sim.pac) {
      if (p.estado === 'muerto') continue;
      const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  canvas.onmousemove = (ev) => { hover = pacienteEn(ev); };
  canvas.onmouseleave = () => { hover = null; };
  canvas.onclick = (ev) => { const p = pacienteEn(ev); if (p && corriendo) sim.priorizar(p); };
  document.querySelectorAll('.ord').forEach(b => b.onclick = () => { if (corriendo) sim.ordenar(b.dataset.o); });

  /* ---- bucle ---- */
  function frame(ts) {
    const dt = Math.min(0.1, (ts - ultimo) / 1000); ultimo = ts;
    if (corriendo && !sim.terminado) {
      acc += dt * velocidad; let n = 0;
      while (acc >= S.DT && !sim.terminado && n++ < 400) { sim.step(); acc -= S.DT; }
      if (sim.terminado) terminar();
    }
    if (vista === 'sim') { UrgRender.dibujar(ctx, sim, hover); actualizarHud(); }
    requestAnimationFrame(frame);
  }
  function terminar() {
    corriendo = false; $('btnIniciar').textContent = '▶ Iniciar'; guardarCorrida(); $('fin').hidden = false;
    const pts = sim.puntaje(sim.resumen().cumple), nota = pts >= 90 ? 'A · Excelente' : pts >= 75 ? 'B · Bien' : pts >= 55 ? 'C · Regular' : 'D · Crítico';
    const rs = sim.resumen(), extra = rs.realismo ? ` Errores de triage: ${rs.subtriage + rs.sobretriage} (${rs.retriage} subestimados corregidos por re-triage).` : '';
    $('finTxt').textContent = (sim.manual ? `Simulación terminada. Puntaje ${pts}/100 · Nota ${nota}.` : 'Simulación terminada.') + extra;
  }

  /* ---- botones ---- */
  $('btnIniciar').onclick = () => {
    if (sim.terminado) return;
    corriendo = !corriendo; bloquear(true);
    $('btnIniciar').textContent = corriendo ? '⏸ Pausar' : '▶ Continuar';
  };
  $('btnReiniciar').onclick = reiniciar;
  $('btnSaltar').onclick = () => { bloquear(true); let n = 0; while (!sim.terminado && n++ < 200000) sim.step(); terminar(); irA('res'); };
  $('btnParcial').onclick = () => { corriendo = false; $('btnIniciar').textContent = '▶ Continuar'; guardarCorrida(); irA('res'); };
  $('btnVerRes').onclick = () => irA('res');
  $('btnVerOpt').onclick = () => irA('opt');
  $('btnVerRec').onclick = () => irA('rec');
  document.querySelectorAll('#vel button').forEach(b => b.onclick = () => {
    velocidad = +b.dataset.v; document.querySelectorAll('#vel button').forEach(x => x.classList.toggle('act', x === b));
  });
  const LIM = (i) => ({ min: +$(i).min, max: +$(i).max });
  function fijar(i, v) { const { min, max } = LIM(i); $(i).value = Math.max(min, Math.min(max, Math.round(+v || 0))); }
  ['medicos', 'enfermeras', 'camas', ...VIC].forEach(i => $(i).oninput = porUsuario(() => { fijar(i, $(i).value); etiquetas(); reiniciar(); }));
  document.querySelectorAll('.step button').forEach(b => b.onclick = porUsuario(() => {
    if (b.disabled) return; const i = b.dataset.t; fijar(i, +$(i).value + +b.dataset.d); etiquetas(); reiniciar();
  }));
  $('escenario').onchange = porUsuario(cambioEscenario);
  ['plan', 'apropiativa', 'derivar', 'manual', 'realismo', 'semilla'].forEach(i => $(i).onchange = porUsuario(reiniciar));

  reiniciar(); cambioEscenario(); badge(); irA('sim');
  requestAnimationFrame(frame);
})();
