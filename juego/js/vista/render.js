/* VISTA: dibuja el hospital (planta vista desde arriba) en un canvas 1200x700. */
(function (root) {
  'use strict';
  const S = root.UrgSim;
  const { ZONAS, GEO, COLOR, NOMBRE, W, H } = S;

  const TINTE = {
    amb: '#fdecec', rec: '#fdecec', espera: '#f3f6fa', triaje: '#e6f4f1', medEspera: '#eef2fb',
    boxes: '#eaf1fb', obs: '#f0eefb', mando: '#fbeaea', pasillo: '#fff3e0', salida: '#eaf6ea',
  };

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function fondo(ctx, sim) {
    // edificio: piso de pasillos con baldosas
    ctx.fillStyle = '#e9e4d8'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(120,110,90,.13)'; ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (const k in ZONAS) {
      const z = ZONAS[k];
      ctx.fillStyle = TINTE[k]; rr(ctx, z.x, z.y, z.w, z.h, 10); ctx.fill();
      ctx.strokeStyle = '#9fb0bd'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#5b6b78'; ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(z.nombre.toUpperCase(), z.x + 10, z.y + 16);
    }
    pasillos(ctx); puertas(ctx);
    // calle de ambulancias
    const a = ZONAS.amb;
    ctx.fillStyle = '#c9d2d8'; ctx.fillRect(a.x + 4, a.y + 24, a.w - 8, a.h - 30);
    ctx.strokeStyle = '#fff'; ctx.setLineDash([12, 10]); ctx.lineWidth = 2;
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(a.x + 4, a.y + 24 + k * 42 - 4); ctx.lineTo(a.x + a.w - 4, a.y + 24 + k * 42 - 4); ctx.stroke(); }
    ctx.setLineDash([]);
    // puerta de entrada
    // entrada: marquesina y puertas automáticas de vidrio
    ctx.fillStyle = '#c62828'; rr(ctx, -4, 408, 58, 14, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('URGENCIAS', 25, 418);
    ctx.fillStyle = 'rgba(144,202,249,.55)'; ctx.fillRect(4, 428, 8, 44); ctx.strokeStyle = '#37474f'; ctx.lineWidth = 2; ctx.strokeRect(4, 428, 8, 44);
    ctx.fillStyle = '#2e7d32'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'left'; ctx.fillText('ENTRADA', 18, 488);

    // sillas de la sala de espera
    ctx.fillStyle = '#d3dbe2';
    for (let i = 0; i < GEO.espera.length; i += 1) { const s = GEO.espera[i]; ctx.fillRect(s.x - 8, s.y + 5, 16, 5); }
    ctx.fillStyle = '#d3dbe2';
    for (const s of GEO.medEspera) ctx.fillRect(s.x - 8, s.y + 5, 16, 5);

    // escritorios de triaje
    for (let i = 0; i < S.MAXENF; i++) {
      const d = GEO.desks[i], n = sim.enf[i], off = n.estado === 'ausente';
      ctx.globalAlpha = off ? 0.3 : 1;
      ctx.fillStyle = '#b08968'; rr(ctx, d.cx - 30, d.cy - 6, 60, 16, 4); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // consultorios
    for (let i = 0; i < S.MAXDOC; i++) {
      const g = GEO.boxes[i], d = sim.med[i], off = d.estado === 'ausente';
      ctx.globalAlpha = off ? 0.35 : 1;
      ctx.fillStyle = '#fff'; rr(ctx, g.x, g.y, g.w, g.h, 6); ctx.fill();
      ctx.strokeStyle = '#8aa0b2'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#b08968'; rr(ctx, g.x + 12, g.y + 42, 50, 10, 3); ctx.fill();    // escritorio
      ctx.fillStyle = '#cfe0ee'; rr(ctx, g.x + 14, g.y + 76, 46, 52, 6); ctx.fill();     // camilla
      ctx.fillStyle = d.estado === 'ocupado' ? '#e53935' : (off ? '#9e9e9e' : '#43a047');
      ctx.beginPath(); ctx.arc(g.x + g.w - 9, g.y + 9, 4, 0, 7); ctx.fill();            // luz de ocupado
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#7a8a97'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(off ? 'cerrado' : 'Box ' + (i + 1), g.x + g.w / 2, g.y + g.h - 5);
    }
    // camas
    for (let i = 0; i < S.MAXCAMA; i++) {
      const g = GEO.camas[i], b = sim.camas[i];
      if (b.estado === 'cerrada') {
        if (i < sim.cfg.camas || (i < sim.cfg.camas + sim.nRefCama && sim.planT !== null)) { // cama perdida o por habilitar
          ctx.globalAlpha = 0.25; ctx.fillStyle = '#9e9e9e'; rr(ctx, g.x, g.y, g.w, g.h, 6); ctx.fill(); ctx.globalAlpha = 1;
        }
        continue;
      }
      ctx.fillStyle = b.estado === 'ocupada' ? '#c5cae9' : '#e8eaf6'; rr(ctx, g.x, g.y, g.w, g.h, 6); ctx.fill();
      ctx.strokeStyle = '#7986cb'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#fff'; rr(ctx, g.x + 4, g.y + 4, g.w - 8, 16, 4); ctx.fill();
    }
    // puesto de mando: estado del plan
    const m = ZONAS.mando;
    ctx.textAlign = 'left'; ctx.font = '600 12px system-ui';
    const filas = [
      ['Alerta', sim.alertaT !== null, '#e53935'],
      ['Plan de desastre', sim.planActivo, '#2e7d32'],
      ['Refuerzo médico', sim.med.some(d => d.i >= sim.cfg.medicos && d.estado !== 'ausente'), '#1565c0'],
      ['Camas extra', sim.camas.some(b => b.i >= sim.cfg.camas && b.estado !== 'cerrada'), '#6a1b9a'],
    ];
    filas.forEach((f, k) => {
      const y = m.y + 44 + k * 28;
      ctx.fillStyle = f[1] ? f[2] : '#c4ccd2'; ctx.beginPath(); ctx.arc(m.x + 18, y - 4, 7, 0, 7); ctx.fill();
      ctx.fillStyle = f[1] ? '#222' : '#8b98a3'; ctx.fillText(f[0], m.x + 32, y);
    });
  }


  /* ---------- Entorno ---------- */
  // pasillos del hospital: franjas de circulación, aberturas en muros y puertas
  const PISO = '#e9e4d8', PASILLO = '#dfe6ea';
  function pasillos(ctx) {
    const tiras = [[340, 190, 30, 510, 'v'], [580, 0, 20, 700, 'v'], [1000, 0, 30, 700, 'v'],   // principal, central, de salida
                   [600, 155, 400, 50, 'h'], [600, 348, 400, 24, 'h'], [240, 95, 115, 30, 'h']]; // consultorios, observación, emergencias
    for (const [x, y, w, h] of tiras) {
      ctx.fillStyle = PASILLO; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(90,100,110,.35)'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
    }
    ctx.strokeStyle = 'rgba(255,193,7,.75)'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
    for (const [x, y, w, h, o] of tiras) { ctx.beginPath(); if (o === 'v') { ctx.moveTo(x + w / 2, y + 6); ctx.lineTo(x + w / 2, y + h - 6); } else { ctx.moveTo(x + 6, y + h / 2); ctx.lineTo(x + w - 6, y + h / 2); } ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(70,80,90,.7)'; ctx.font = '600 9px system-ui'; ctx.textAlign = 'center';
    const rot = (t, x, y) => { ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 2); ctx.fillText(t, 0, 3); ctx.restore(); };
    rot('PASILLO PRINCIPAL', 355, 260); rot('PASILLO CENTRAL', 590, 440); rot('PASILLO DE SALIDA', 1015, 470);
    ctx.fillText('PASILLO DE CONSULTORIOS', 800, 183); ctx.fillText('PASILLO DE OBSERVACIÓN', 800, 363); ctx.fillText('EMERGENCIAS', 298, 113);
    // pasillo central de las camas
    ctx.fillStyle = PASILLO; ctx.fillRect(788, 372, 26, 316);
    ctx.fillStyle = '#b71c1c'; ctx.font = '700 8px system-ui'; ctx.textAlign = 'center'; ctx.fillText('RECEPCIÓN AMBULANCIAS', 298, 141);
    // locales anexos (decorativos)
    const locales = [['Farmacia', 250, 12, 90, 76], ['Laboratorio', 362, 12, 100, 76], ['Rayos X', 474, 12, 100, 76],
                     ['Admisión', 380, 132, 70, 54], ['Trabajo social', 458, 132, 116, 54]];
    for (const [n, x, y, w, h] of locales) {
      ctx.fillStyle = '#f4f1ea'; rr(ctx, x, y, w, h, 6); ctx.fill(); ctx.strokeStyle = '#a9b2b9'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#7b8791'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(n, x + w / 2, y + h / 2 + 3);
    }
  }
  function puertas(ctx) {
    const V = [[10, 450, 46], [340, 385, 34], [370, 320, 34], [370, 520, 34], [580, 560, 34], [1030, 300, 34], [1030, 560, 34], [1190, 560, 40], [240, 110, 30], [1000, 180, 40], [1000, 358, 20], [580, 180, 30], [580, 358, 20]];
    const Hz = [[480, 430, 90], [801, 370, 26], [300, 131, 26]];
    for (let i = 0; i < S.MAXDOC; i++) { const p = GEO.boxes[i].puerta; Hz.push([p.x, p.y, 26]); }
    ctx.fillStyle = PASILLO;
    for (const [x, y, h] of V) ctx.fillRect(x - 3, y - h / 2, 6, h);
    for (const [x, y, w] of Hz) ctx.fillRect(x - w / 2, y - 3, w, 6);
    // hojas de puerta
    ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 2;
    for (const [x, y, h] of V) { ctx.beginPath(); ctx.moveTo(x - 3, y - h / 2); ctx.lineTo(x - 3, y - h / 2 + 5); ctx.moveTo(x - 3, y + h / 2); ctx.lineTo(x - 3, y + h / 2 - 5); ctx.stroke(); }
    for (const [x, y, w] of Hz) { ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w / 2 + 4, y); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2 - 4, y); ctx.stroke(); }
    ctx.fillStyle = '#2e7d32'; ctx.font = '700 9px system-ui'; ctx.textAlign = 'left'; ctx.fillText('SALIDA ➜', 1135, 540);
  }

  const COCHES = ['#c62828', '#1565c0', '#f9a825', '#2e7d32', '#6a1b9a', '#eceff1'];
  function calle(ctx, t) {
    const M = S.MARGEN, H = S.H;
    // pasto/vereda y calzada
    ctx.fillStyle = '#4b5660'; ctx.fillRect(0, 0, 38, H);                  // asfalto
    ctx.fillStyle = '#cfd4d8'; ctx.fillRect(38, 0, M - 38, H);              // vereda
    ctx.fillStyle = '#b0b8bd'; ctx.fillRect(36, 0, 3, H);                   // bordillo
    ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 24) { ctx.beginPath(); ctx.moveTo(39, y); ctx.lineTo(M, y); ctx.stroke(); }
    // rampa de ambulancias (cruza la vereda hasta la bahía)
    ctx.fillStyle = '#4b5660'; ctx.fillRect(36, 10, M - 34, 180);
    // líneas de carril
    ctx.strokeStyle = '#f9a825'; ctx.lineWidth = 2; ctx.setLineDash([16, 12]);
    ctx.beginPath(); ctx.moveTo(19, 0); ctx.lineTo(19, H); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(2, H); ctx.moveTo(35, 0); ctx.lineTo(35, H); ctx.stroke();
    // paso peatonal frente a la entrada
    ctx.fillStyle = '#fff';
    for (let y = 410; y < 490; y += 12) ctx.fillRect(4, y, 31, 6);
    // señal de hospital
    ctx.fillStyle = '#1565c0'; ctx.fillRect(58, 352, 8, 8); ctx.fillStyle = '#fff'; ctx.font = '700 7px system-ui'; ctx.textAlign = 'center'; ctx.fillText('H', 62, 359);
    // árboles, farolas y parada de bus
    for (const y of [230, 310, 570, 650]) {
      ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(56, y + 6, 11, 5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#6d4c41'; ctx.fillRect(54, y - 4, 4, 10);
      ctx.fillStyle = '#388e3c'; ctx.beginPath(); ctx.arc(56, y - 10, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#4caf50'; ctx.beginPath(); ctx.arc(53, y - 13, 6, 0, 7); ctx.fill();
    }
    for (const y of [270, 520, 690]) {
      ctx.fillStyle = '#546e7a'; ctx.fillRect(65, y - 12, 2, 16);
      ctx.fillStyle = '#fff59d'; ctx.beginPath(); ctx.arc(66, y - 14, 3, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#90a4ae'; ctx.fillRect(42, 594, 24, 3); ctx.fillRect(42, 594, 2, 18); ctx.fillRect(64, 594, 2, 18);
    ctx.fillStyle = '#1565c0'; ctx.fillRect(46, 598, 16, 8);
    // tráfico decorativo
    for (let k = 0; k < 3; k++) {
      const dir = k % 2 ? 1 : -1, ciclo = H + 120, pos = (((t / 18 + k * 260) % ciclo) + ciclo) % ciclo;
      const y = dir > 0 ? pos - 60 : H + 60 - pos, x = dir > 0 ? 6 : 23;
      ctx.fillStyle = COCHES[k * 2 % COCHES.length]; rr(ctx, x, y - 14, 12, 28, 4); ctx.fill();
      ctx.fillStyle = 'rgba(179,229,252,.9)'; ctx.fillRect(x + 2, dir > 0 ? y + 2 : y - 10, 8, 8);
    }
  }

  const PIEL = ['#f3d2b5', '#e0ac82', '#c68a5e', '#a56c43', '#7a4a2b'];
  const PELO = ['#2b1b12', '#4a3022', '#8a5a2b', '#c9a14a', '#9e9e9e', '#111111'];
  const ROPA = ['#546e7a', '#6d4c41', '#455a64', '#7b1fa2', '#00796b', '#5d4037', '#37474f', '#8d6e63', '#3949ab', '#827717', '#ad1457', '#33691e'];
  const hash = (id, k) => ((id * 2654435761 + k * 40503) >>> 0) % 1000003;

  function movimiento(o) {
    const d = Math.hypot(o.x - (o._lx === undefined ? o.x : o._lx), o.y - (o._ly === undefined ? o.y : o._ly));
    if (d > 0.25) o._hx = o.x - (o._lx === undefined ? o.x : o._lx);
    o._lx = o.x; o._ly = o.y;
    o._mov = d > 0.25 ? Math.min(1, (o._mov || 0) + 0.25) : Math.max(0, (o._mov || 0) - 0.15);
    return o._mov;
  }

  // persona vista desde arriba/adelante, con pasos al caminar
  function persona(ctx, x, y, o) {
    const mov = o.mov || 0, fase = Math.sin(performance.now() / 110 + (o.id || 0)) * 3.2 * mov;
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x, y + 8, 8, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = o.pantalon || '#37474f';
    ctx.fillRect(x - 4.5, y + 3 + (fase > 0 ? -fase * 0.4 : 0), 3.4, 6 + Math.max(0, fase)); ctx.fillRect(x + 1.1, y + 3 + (fase < 0 ? fase * 0.4 : 0), 3.4, 6 + Math.max(0, -fase));
    ctx.fillStyle = o.ropa; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1;
    rr(ctx, x - 6.5, y - 5, 13, 11, 4); ctx.fill(); ctx.stroke();                      // torso
    ctx.fillStyle = o.piel;                                                            // brazos
    ctx.beginPath(); ctx.arc(x - 7.4, y + 1 + fase * 0.3, 2.1, 0, 7); ctx.arc(x + 7.4, y + 1 - fase * 0.3, 2.1, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - 9, 4.6, 0, 7); ctx.fill(); ctx.stroke();            // cabeza
    ctx.fillStyle = o.pelo; ctx.beginPath(); ctx.arc(x, y - 10.2, 4.6, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  }

  // persona acostada (camilla, cama, cadáver)
  function acostado(ctx, x, y, o) {
    ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(x, y + 7, 17, 3.5, 0, 0, 7); ctx.fill();
    if (o.camilla) {
      ctx.fillStyle = '#eceff1'; ctx.strokeStyle = '#78909c'; ctx.lineWidth = 1.2; rr(ctx, x - 20, y - 6, 40, 14, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#37474f'; ctx.beginPath(); ctx.arc(x - 14, y + 9, 2.4, 0, 7); ctx.arc(x + 14, y + 9, 2.4, 0, 7); ctx.fill();
    }
    ctx.fillStyle = o.manta; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; rr(ctx, x - 14, y - 4, 29, 10, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = o.piel; ctx.beginPath(); ctx.arc(x - 17, y + 1, 4.3, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = o.pelo; ctx.beginPath(); ctx.arc(x - 18.2, y + 1, 4.3, Math.PI * 0.55, Math.PI * 1.45); ctx.fill();
  }

  function silla(ctx, x, y) {
    ctx.strokeStyle = '#455a64'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x - 8, y + 5, 6, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 8, y + 5, 6, 0, 7); ctx.stroke();
    ctx.fillStyle = '#607d8b'; ctx.fillRect(x - 8, y + 1, 16, 4);
  }

  function dibujarPaciente(ctx, p) {
    const id = p.id, piel = PIEL[hash(id, 1) % PIEL.length], pelo = PELO[hash(id, 2) % PELO.length], ropa = ROPA[hash(id, 3) % ROPA.length];
    const col = p.known ? COLOR[p.nivel] : '#b0bec5';
    if (p.estado === 'muerto') {
      acostado(ctx, p.x, p.y, { piel: '#cfd8dc', pelo: '#9e9e9e', manta: '#fafafa' });
      ctx.strokeStyle = '#d50000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - 6, p.y - 8); ctx.lineTo(p.x + 6, p.y + 4); ctx.moveTo(p.x + 6, p.y - 8); ctx.lineTo(p.x - 6, p.y + 4); ctx.stroke();
      return;
    }
    const mov = movimiento(p), tendido = p.estado === 'consulta' || p.estado === 'cama';
    // gravedad visible: nivel I siempre en camilla; nivel II en camilla o silla de ruedas; nivel III en silla si es frágil o está muy deteriorado
    const camilla = !tendido && (p.lvl === 1 || (p.lvl === 2 && hash(id, 6) % 3 !== 0) || (p.lvl === 3 && p.salud < 40));
    const sillaR = !tendido && !camilla && (p.lvl === 2 || (p.lvl === 3 && hash(id, 4) % 3 === 0));
    if (tendido || camilla) {
      acostado(ctx, p.x, p.y, { piel, pelo, manta: p.known ? col : '#cfd8dc', camilla });
    } else {
      if (sillaR) silla(ctx, p.x, p.y);
      persona(ctx, p.x, p.y + (sillaR ? -3 : 0), { ropa, piel, pelo, mov: sillaR ? 0 : mov, id });
    }
    // quien empuja la camilla o la silla de ruedas
    if (!tendido && (camilla || sillaR) && mov > 0.1) {
      const dir = (p._hx || 1) >= 0 ? 1 : -1, enAmb = p.amb && p.x < 350 && p.y < 200;
      const px = p.x - dir * (camilla ? 27 : 17), uni = enAmb ? '#ef6c00' : '#5e35b1';
      persona(ctx, px, p.y, { ropa: uni, piel: PIEL[(id + 2) % 5], pelo: PELO[(id + 1) % 6], pantalon: '#263238', mov, id: id + 200 });
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(px - 6, p.y - 1, 12, 2);   // franja reflectante
      if (enAmb && camilla) persona(ctx, p.x + dir * 27, p.y, { ropa: '#ef6c00', piel: PIEL[(id + 3) % 5], pelo: PELO[(id + 4) % 6], pantalon: '#263238', mov, id: id + 300 });
    }
    // heridas visibles según gravedad real
    if (!tendido) {
      if (p.lvl <= 2) { ctx.fillStyle = 'rgba(183,28,28,.85)'; ctx.beginPath(); ctx.ellipse(p.x + 1, p.y - 1, 3.2, 2.4, 0.4, 0, 7); ctx.fill(); }
      else if (p.lvl === 3) { ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 4.5, p.y - 12, 9, 3); ctx.fillStyle = '#e53935'; ctx.fillRect(p.x - 0.7, p.y - 12.2, 1.4, 3.4); }
      else if (p.lvl === 4 && hash(id, 5) % 2) { ctx.fillStyle = '#ffe0b2'; ctx.fillRect(p.x + 3, p.y - 3, 4, 2.5); }
    }
    // pulsera/ficha de triage
    const ty = tendido || camilla ? p.y - 11 : p.y - 19;
    ctx.fillStyle = col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, ty, 3.6, 0, 7); ctx.fill(); ctx.stroke();
    if (!p.known) { ctx.fillStyle = '#37474f'; ctx.font = 'bold 6px system-ui'; ctx.textAlign = 'center'; ctx.fillText('?', p.x, ty + 2.2); }
    if (p.salud < 92 && p.estado !== 'consulta' && p.estado !== 'cama') {
      const w = 18, f = Math.max(0, p.salud / 100);
      ctx.fillStyle = '#263238'; ctx.fillRect(p.x - w / 2, ty - 7, w, 3);
      ctx.fillStyle = f > 0.5 ? '#43a047' : f > 0.25 ? '#fb8c00' : '#e53935'; ctx.fillRect(p.x - w / 2, ty - 7, w * f, 3);
    }
    if (p.estado === 'consulta') {
      ctx.fillStyle = '#2e7d32'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('+', p.x + 14, p.y - 8);
    }
  }

  function ambulancia(ctx, a) {
    const y = 22 + a.lane * 42 + 4;
    ctx.save(); ctx.translate(a.x, y);
    ctx.fillStyle = '#fff'; rr(ctx, 0, 4, 70, 28, 5); ctx.fill();
    ctx.strokeStyle = '#90a4ae'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#e53935'; ctx.fillRect(10, 17, 20, 5); ctx.fillRect(17.5, 9.5, 5, 20);
    ctx.fillStyle = '#b3e5fc'; ctx.fillRect(48, 8, 18, 10);
    const on = Math.floor(performance.now() / 250) % 2 === 0;
    ctx.fillStyle = on ? '#ff1744' : '#2979ff'; ctx.fillRect(40, 1, 10, 4);
    ctx.restore();
  }

  function ficha(ctx, p, sim) {
    const lineas = [p.known ? 'Clasificado: ' + S.NOMBRE[p.nivel] : 'Sin clasificar (triage pendiente)',
      'Salud: ' + Math.max(0, Math.round(p.salud)) + ' %', 'Esperando: ' + Math.round(sim.t - (p.tCola || p.tArr)) + ' min'];
    if (sim.manual && (sim.colaT.includes(p) || sim.colaD.includes(p)) && !p.vip) lineas.push(sim.cupo >= 1 ? 'Clic: atender primero' : 'Sin prioridades disponibles');
    if (p.vip) lineas.push('★ Prioridad del comandante');
    const w = 190, h = 10 + lineas.length * 17;
    const x = Math.min(W - w - 6, Math.max(6, p.x + 14)), y = Math.min(H - h - 6, Math.max(6, p.y - h - 6));
    ctx.fillStyle = 'rgba(15,42,61,.93)'; rr(ctx, x, y, w, h, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '12px system-ui'; ctx.textAlign = 'left';
    lineas.forEach((t, i) => ctx.fillText(t, x + 9, y + 18 + i * 17));
  }

  function dibujar(ctx, sim, hover) {
    calle(ctx, performance.now());
    ctx.save(); ctx.translate(S.MARGEN, 0);
    fondo(ctx, sim);
    for (const a of sim.ambs) ambulancia(ctx, a);

    const gente = [];
    for (const p of sim.pac) gente.push({ y: p.y, f: () => dibujarPaciente(ctx, p) });
    for (const d of sim.med) if (d.estado !== 'ausente') gente.push({ y: d.y, f: () => {
      persona(ctx, d.x, d.y, { ropa: '#ffffff', piel: PIEL[(d.i * 2 + 1) % 5], pelo: PELO[(d.i * 3) % 6], pantalon: '#1e3a5f', mov: movimiento(d), id: d.i + 50 });
      ctx.strokeStyle = '#1565c0'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(d.x, d.y - 3, 4, 0.2, Math.PI - 0.2); ctx.stroke();   // estetoscopio
      ctx.fillStyle = '#1565c0'; ctx.fillRect(d.x - 1.2, d.y - 1, 2.4, 6);
      if (sim.cfg.realismo && (d.fat || 0) > 0.05) {   // barra de fatiga
        ctx.fillStyle = '#263238'; ctx.fillRect(d.x - 10, d.y - 20, 20, 3);
        ctx.fillStyle = d.fat < 0.5 ? '#fbc02d' : '#e53935'; ctx.fillRect(d.x - 10, d.y - 20, 20 * d.fat, 3);
      }
    } });
    for (const n of sim.enf) if (n.estado !== 'ausente') gente.push({ y: n.y, f: () => {
      persona(ctx, n.x, n.y, { ropa: '#26a69a', piel: PIEL[(n.i * 2 + 2) % 5], pelo: PELO[(n.i * 5 + 1) % 6], pantalon: '#00695c', mov: movimiento(n), id: n.i + 80 });
      ctx.fillStyle = '#fff'; ctx.fillRect(n.x - 4, n.y - 15, 8, 3); ctx.fillStyle = '#e53935'; ctx.fillRect(n.x - 0.7, n.y - 15.2, 1.4, 3.4);   // cofia
    } });
    gente.sort((a, b) => a.y - b.y).forEach(g => g.f());
    for (const p of sim.pac) if (p.vip && p.estado !== 'muerto') {
      ctx.strokeStyle = '#ffb300'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, p.y - 2, 13, 0, 7); ctx.stroke();
      ctx.fillStyle = '#ffb300'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('★', p.x, p.y - 17);
    }
    if (hover && sim.pac.includes(hover) && hover.estado !== 'muerto') {
      ctx.strokeStyle = '#1565c0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hover.x, hover.y - 2, 12, 0, 7); ctx.stroke();
    }

    // etiqueta de conteo sobre zonas de espera
    ctx.textAlign = 'right'; ctx.font = '600 12px system-ui'; ctx.fillStyle = '#37474f';
    ctx.fillText(sim.colaT.length + ' en cola de triaje', ZONAS.espera.x + ZONAS.espera.w - 10, ZONAS.espera.y + 16);
    ctx.fillText(sim.colaD.length + ' en cola', ZONAS.medEspera.x + ZONAS.medEspera.w - 10, ZONAS.medEspera.y + 16);
    ctx.fillText(sim.colaC.length + ' en cola', ZONAS.pasillo.x + ZONAS.pasillo.w - 10, ZONAS.pasillo.y + 16);

    // reloj
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(15,42,61,.88)'; rr(ctx, 255, 10, 96, 34, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 20px ui-monospace, Consolas, monospace'; ctx.fillText(S.hora(sim.t), 272, 34);

    // alerta de catástrofe
    if (sim.alertaT !== null && sim.t - sim.alertaT < 25) {
      const k = (Math.sin(performance.now() / 120) + 1) / 2;
      ctx.strokeStyle = `rgba(229,57,53,${0.35 + 0.5 * k})`; ctx.lineWidth = 10; ctx.strokeRect(5, 5, W - 10, H - 10);
      ctx.fillStyle = 'rgba(183,28,28,.93)'; rr(ctx, W / 2 - 250, 14, 500, 44, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 20px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('⚠ ALERTA: ' + sim.esc.alerta, W / 2, 43);
    } else if (sim.planActivo) {
      ctx.fillStyle = 'rgba(46,125,50,.92)'; rr(ctx, W / 2 - 130, 14, 260, 30, 15); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 14px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('PLAN DE DESASTRE ACTIVO', W / 2, 34);
    }
    if (hover && sim.pac.includes(hover) && hover.estado !== 'muerto') ficha(ctx, hover, sim);
    if (sim.terminado) {
      ctx.fillStyle = 'rgba(15,42,61,.85)'; rr(ctx, W / 2 - 200, H / 2 - 40, 400, 80, 12); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 22px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('Simulación terminada', W / 2, H / 2 - 6);
      ctx.font = '14px system-ui'; ctx.fillText('Revisa las pestañas Resultados y Recomendaciones', W / 2, H / 2 + 20);
    }
    ctx.restore();
  }

  root.UrgRender = { dibujar };
})(window);
