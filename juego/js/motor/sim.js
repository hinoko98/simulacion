/* MOTOR DE SIMULACIÓN (sin DOM): sala de urgencias bajo catástrofe.
 * Mismo modelo que urgencias/modelo.py: llegada -> triaje -> consulta -> observación -> salida,
 * triaje Manchester (1 rojo … 5 azul), cola por prioridad, atención apropiativa opcional.
 * Unidad de tiempo: minutos. t=0 equivale a las 08:00.
 */
(function (root) {
  'use strict';

  const NIVELES = [1, 2, 3, 4, 5];
  const NOMBRE = { 1: 'Rojo', 2: 'Naranja', 3: 'Amarillo', 4: 'Verde', 5: 'Azul' };
  const COLOR = { 1: '#e53935', 2: '#fb8c00', 3: '#fdd835', 4: '#43a047', 5: '#1e88e5' };
  // Triage colombiano (Res. 5596/2015): I Atención inmediata, II Muy urgente, III Urgente, IV Leve, V No urgente
  const ROMANO = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };
  const DESC = { 1: 'Atención inmediata', 2: 'Muy urgente', 3: 'Urgente', 4: 'Leve / sin riesgo vital evidente', 5: 'No urgente' };
  // Minutos máximos hasta la atención médica (tras el triaje). I y II vienen de la norma (inmediata y <=30 min);
  // III usa el tope de la franja 1-2 h; IV y V son SUPUESTOS editables.
  const LIMITE = { 1: 2, 2: 30, 3: 120, 4: 240, 5: 360 };
  const PERFIL = [0.4, 0.3, 0.3, 0.25, 0.25, 0.3, 0.5, 0.7, 0.9, 1.1, 1.4, 1.5,
                  1.4, 1.2, 1.1, 1.1, 1.2, 1.4, 1.5, 1.4, 1.2, 0.9, 0.7, 0.5];
  const TASA_BASE = 7;
  const PROB_BASE = [0.03, 0.12, 0.35, 0.40, 0.10];
  const CONS_MEDIA = [45, 40, 28, 16, 10];
  const PROB_OBS = [0.9, 0.6, 0.25, 0.05, 0];
  // salud perdida por minuto mientras el paciente espera sin atención médica
  const DECAY = { 1: 100 / 45, 2: 100 / 180, 3: 100 / 720, 4: 0, 5: 0 };

  const W = 1200, H = 700, DT = 0.1, VEL = 120, MARGEN = 70;
  const MAXDOC = 10, MAXENF = 6, MAXCAMA = 24;
  const R_MED = 3, R_ENF = 2, R_CAMA = 6;
  const DEMORA_REF = { enfermeras: 20, medicos: 30, camas: 40 };   // min desde la llamada hasta que llegan

  const ESCENARIOS = {
    normal: { nombre: 'Día normal (sin catástrofe)', evento: false, horizonte: 720,
      desc: 'Flujo habitual de urgencias. Sirve como línea base.' },
    accidente: { nombre: 'Accidente con múltiples víctimas', evento: true, n: 40, dur: 25, amb: 0.6,
      prob: [0.12, 0.25, 0.33, 0.25, 0.05], perdMed: 0, perdCamas: 0, horizonte: 720,
      alerta: 'ACCIDENTE CON MÚLTIPLES VÍCTIMAS',
      desc: 'Elige cuántas víctimas llegan de cada nivel de triage y observa qué pasa cuando se llenan camas, médicos y enfermeras.' },
    sismo: { nombre: 'Sismo de gran magnitud', evento: true, n: 70, dur: 45, amb: 0.35,
      prob: [0.12, 0.25, 0.33, 0.25, 0.05], perdMed: 1, perdCamas: 4, horizonte: 720,
      alerta: 'SISMO DE GRAN MAGNITUD',
      desc: '70 heridos en 45 min y daño en la infraestructura: se pierden 1 médico y 4 camas.' },
    bus: { nombre: 'Accidente de bus', evento: true, n: 30, dur: 20, amb: 0.8,
      prob: [0.10, 0.25, 0.35, 0.25, 0.05], perdMed: 0, perdCamas: 0, horizonte: 720,
      alerta: 'ACCIDENTE MASIVO DE TRÁNSITO',
      desc: '30 heridos, casi todos en ambulancia, durante 20 min.' },
    incendio: { nombre: 'Incendio / explosión industrial', evento: true, n: 45, dur: 30, amb: 0.6,
      prob: [0.20, 0.30, 0.30, 0.15, 0.05], perdMed: 0, perdCamas: 0, horizonte: 720,
      alerta: 'INCENDIO / EXPLOSIÓN INDUSTRIAL',
      desc: '45 quemados e intoxicados con gravedad alta en 30 min.' },
    intox: { nombre: 'Intoxicación / brote masivo', evento: true, n: 90, dur: 240, amb: 0.1,
      prob: [0.03, 0.15, 0.40, 0.32, 0.10], perdMed: 0, perdCamas: 0, horizonte: 900,
      alerta: 'BROTE / INTOXICACIÓN MASIVA',
      desc: '90 afectados durante 4 h, mayoría de gravedad media y leve.' },
  };

  /* ---------- Geometría (compartida con el render) ---------- */
  const ZONAS = {
    amb:       { x: 10,   y: 10,  w: 230, h: 180, nombre: 'Bahía de ambulancias' },
    rec:       { x: 250,  y: 132, w: 95,  h: 54,  nombre: '' },   // recepción de ambulancias / casos críticos
    espera:    { x: 10,   y: 210, w: 330, h: 480, nombre: 'Sala de espera' },
    triaje:    { x: 370,  y: 210, w: 210, h: 210, nombre: 'Triaje' },
    medEspera: { x: 370,  y: 440, w: 210, h: 250, nombre: 'Espera médica' },
    boxes:     { x: 600,  y: 10,  w: 400, h: 340, nombre: 'Consultorios' },
    obs:       { x: 600,  y: 370, w: 400, h: 320, nombre: 'Observación / camas' },
    mando:     { x: 1030, y: 10,  w: 160, h: 170, nombre: 'Puesto de mando' },
    pasillo:   { x: 1030, y: 200, w: 160, h: 200, nombre: 'Camillas' },
    salida:    { x: 1030, y: 420, w: 160, h: 270, nombre: 'Salida / altas' },
  };
  const ENTRADA = { x: -24, y: 450 };

  // Reparte n víctimas entre los 5 niveles según la probabilidad del escenario (método del mayor resto)
  function distribucionBase(clave) {
    const e = ESCENARIOS[clave];
    if (!e || !e.evento) return [0, 0, 0, 0, 0];
    const raw = e.prob.map(p => p * e.n), out = raw.map(Math.floor);
    let falta = e.n - out.reduce((a, b) => a + b, 0);
    raw.map((v, i) => [v - out[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (falta-- > 0) out[i]++; });
    return out;
  }

  function grid(x0, y0, x1, y1, sx, sy) {
    const a = [];
    for (let y = y0; y <= y1; y += sy) for (let x = x0; x <= x1; x += sx) a.push({ x, y });
    return a;
  }
  const GEO = {
    // dos filas de consultorios separadas por un pasillo (y 155-205); cada una abre hacia él
    boxes: Array.from({ length: MAXDOC }, (_, i) => {
      const x = 605 + (i % 5) * 79, fila = Math.floor(i / 5), y = fila ? 205 : 15;
      return { x, y, w: 74, h: 140, fila, puerta: { x: x + 37, y: fila ? 205 : 155 },
        doc: { x: x + 37, y: y + 30 }, pat: { x: x + 37, y: y + 96 } };
    }),
    desks: Array.from({ length: MAXENF }, (_, i) => {
      const cx = 420 + (i % 2) * 100, cy = 252 + Math.floor(i / 2) * 58;
      return { cx, cy, enf: { x: cx, y: cy - 14 }, pat: { x: cx, y: cy + 22 } };
    }),
    camas: Array.from({ length: MAXCAMA }, (_, i) => {
      const c = i % 6, x = c < 3 ? 608 + 60 * c : 814 + 60 * (c - 3), y = 392 + Math.floor(i / 6) * 74;   // pasillo central x 788-814
      return { x, y, w: 50, h: 60, pat: { x: x + 25, y: y + 32 } };
    }),
    espera: grid(30, 240, 320, 670, 29, 27)
      .sort((a, b) => Math.hypot(a.x, a.y - 450) - Math.hypot(b.x, b.y - 450)),
    medEspera: grid(388, 470, 560, 675, 30, 27),
    rec: [{ x: 272, y: 150 }, { x: 322, y: 150 }, { x: 272, y: 172 }, { x: 322, y: 172 }],
    pasillo: grid(1050, 232, 1170, 380, 30, 30),
  };

  /* ---------- Utilidades ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randn(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
  function lognormal(r, media, cv) {
    const s2 = Math.log(1 + cv * cv);
    return Math.exp(Math.log(media) - s2 / 2 + Math.sqrt(s2) * randn(r));
  }
  /* ---------- Red de pasillos: nadie atraviesa paredes ---------- */
  const NODOS = { OUT: { x: -24, y: 450 },
    ENT: { x: 8, y: 450 }, ESP_E: { x: 338, y: 385 }, TRI_W: { x: 372, y: 320 }, TM: { x: 480, y: 430 }, MED_W: { x: 372, y: 520 },
    MED_E: { x: 582, y: 560 }, AMB: { x: 238, y: 110 }, OBS: { x: 801, y: 372 }, PAS: { x: 1032, y: 300 }, SAL: { x: 1032, y: 560 }, SALX: { x: 1188, y: 560 },
    K1_110: { x: 355, y: 110 }, C_E: { x: 300, y: 110 }, REC: { x: 300, y: 130 }, K1_320: { x: 355, y: 320 }, K1_385: { x: 355, y: 385 }, K1_520: { x: 355, y: 520 },
    K2_180: { x: 590, y: 180 }, K2_358: { x: 590, y: 358 }, K2_560: { x: 590, y: 560 },
    K3_180: { x: 1015, y: 180 }, K3_300: { x: 1015, y: 300 }, K3_358: { x: 1015, y: 358 }, K3_560: { x: 1015, y: 560 }, H1: { x: 801, y: 358 } };
  const ARISTAS = [['ENT', 'ESP_E'], ['ESP_E', 'K1_385'], ['K1_110', 'K1_320'], ['K1_320', 'K1_385'], ['K1_385', 'K1_520'],
    ['TRI_W', 'K1_320'], ['MED_W', 'K1_520'], ['TRI_W', 'TM'], ['MED_W', 'TM'], ['TM', 'MED_E'], ['MED_W', 'MED_E'], ['AMB', 'C_E'], ['C_E', 'K1_110'], ['REC', 'C_E'],
    ['MED_E', 'K2_560'], ['K2_180', 'K2_358'], ['K2_358', 'K2_560'], ['K2_358', 'H1'], ['H1', 'K3_358'], ['OBS', 'H1'],
    ['K3_180', 'K3_300'], ['K3_300', 'K3_358'], ['K3_358', 'K3_560'], ['PAS', 'K3_300'], ['SAL', 'K3_560'], ['SAL', 'SALX']];
  let ADJ = null;
  function red() {
    if (ADJ) return ADJ;
    for (let c = 0; c < 5; c++) NODOS['H2_' + c] = { x: GEO.boxes[c].puerta.x, y: 180 };
    for (let i = 0; i < MAXDOC; i++) { NODOS['B' + i] = GEO.boxes[i].puerta; ARISTAS.push(['B' + i, 'H2_' + (i % 5)]); }
    ARISTAS.push(['K2_180', 'H2_0'], ['H2_0', 'H2_1'], ['H2_1', 'H2_2'], ['H2_2', 'H2_3'], ['H2_3', 'H2_4'], ['H2_4', 'K3_180']);
    ADJ = {}; for (const k in NODOS) ADJ[k] = [];
    for (const [a, b] of ARISTAS) { const d = Math.hypot(NODOS[a].x - NODOS[b].x, NODOS[a].y - NODOS[b].y) * (a === 'TRI_W' && b === 'TM' ? 4 : 1);   /* el triaje no es lugar de paso */ ADJ[a].push([b, d]); ADJ[b].push([a, d]); }
    return ADJ;
  }
  function region(x, y) {
    if (x < 0) return { k: 'OUT', d: ['ENT'] };
    if (x > 1200) return { k: 'EXIT', d: ['SALX'] };
    for (let i = 0; i < MAXDOC; i++) { const g = GEO.boxes[i]; if (x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h) return { k: 'BOX' + i, d: ['B' + i] }; }
    const dentro = (z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
    if (dentro(ZONAS.amb)) return { k: 'AMB', d: ['AMB'] };
    if (dentro(ZONAS.rec)) return { k: 'REC', d: ['REC'] };
    if (dentro(ZONAS.espera)) return { k: 'ESP', d: ['ENT', 'ESP_E'] };
    if (dentro(ZONAS.triaje)) return { k: 'TRI', d: ['TRI_W', 'TM'] };
    if (dentro(ZONAS.medEspera)) return { k: 'MED', d: ['MED_W', 'TM', 'MED_E'] };
    if (dentro(ZONAS.obs)) return { k: 'OBS', d: ['OBS'] };
    if (dentro(ZONAS.pasillo)) return { k: 'PAS', d: ['PAS'] };
    if (dentro(ZONAS.salida)) return { k: 'SAL', d: ['SAL', 'SALX'] };
    const cerca = Object.keys(NODOS).filter(n => n !== 'OUT').sort((a, b) => Math.hypot(NODOS[a].x - x, NODOS[a].y - y) - Math.hypot(NODOS[b].x - x, NODOS[b].y - y));
    return { k: 'COR', d: cerca.slice(0, 3) };
  }
  // camina por el pasillo entre filas de camas hasta la cama (y de vuelta al pasillo central)
  function camaEn(x, y) {
    for (const g of GEO.camas) if (x >= g.x - 2 && x <= g.x + g.w + 2 && y >= g.y - 2 && y <= g.y + g.h + 2) return g;
    return null;
  }
  function ruta(x0, y0, x1, y1) {
    const A = red(), a = region(x0, y0), b = region(x1, y1), fin = { x: x1, y: y1 };
    if (a.k === b.k && a.k !== 'COR' && a.k !== 'OUT' && a.k !== 'EXIT') return [fin];
    // coste inicial hacia cada puerta de salida de la zona de origen
    const dist = {}, prev = {}, pre = {};
    const cama0 = a.k === 'OBS' ? camaEn(x0, y0) : null;
    for (const n of a.d) {
      let pts = [], px = x0, py = y0, c = 0;
      if (cama0) pts = [{ x: cama0.x + cama0.w / 2, y: cama0.y - 7 }, { x: 801, y: cama0.y - 7 }];
      if (a.k === 'AMB') pts = [{ x: 226, y: y0 }];
      pts.push(NODOS[n]);
      for (const q of pts) { c += Math.hypot(q.x - px, q.y - py); px = q.x; py = q.y; }
      dist[n] = c; pre[n] = pts.slice(0, -1);
    }
    const cola = Object.keys(dist);
    const hecho = {};
    while (cola.length) {
      cola.sort((p, q) => dist[p] - dist[q]);
      const u = cola.shift(); if (hecho[u]) continue; hecho[u] = true;
      for (const [v, w] of A[u]) if (dist[v] === undefined || dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; if (!hecho[v]) cola.push(v); }
    }
    const cama1 = b.k === 'OBS' ? camaEn(x1, y1) : null;
    let mejor = null, mc = Infinity;
    for (const n of b.d) {
      if (dist[n] === undefined) continue;
      const c = dist[n] + Math.hypot(NODOS[n].x - x1, NODOS[n].y - y1);
      if (c < mc) { mc = c; mejor = n; }
    }
    if (!mejor) return [fin];
    const nodos = []; for (let n = mejor; n; n = prev[n]) nodos.unshift(n);
    const pts = [...(pre[nodos[0]] || []), ...nodos.map(n => NODOS[n])];
    if (cama1) pts.push({ x: 801, y: cama1.y - 7 }, { x: cama1.x + cama1.w / 2, y: cama1.y - 7 });
    pts.push(fin);
    return pts;
  }
  function mover(o, dist) {
    const clave = o.tx + ',' + o.ty;
    if (o._rk !== clave || !o._rt) { o._rk = clave; o._rt = ruta(o.x, o.y, o.tx, o.ty); }
    let resto = dist;
    while (resto > 0 && o._rt.length) {
      const w = o._rt[0], dx = w.x - o.x, dy = w.y - o.y, d = Math.hypot(dx, dy);
      if (d <= resto) { o.x = w.x; o.y = w.y; resto -= d; o._rt.shift(); }
      else { o.x += dx / d * resto; o.y += dy / d * resto; resto = 0; }
    }
    return o._rt.length === 0;
  }
  function quitar(arr, x) { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); }
  function nl(v) { const o = {}; for (const n of NIVELES) o[n] = typeof v === 'function' ? v() : v; return o; }
  function suma(o) { return Object.values(o).reduce((a, b) => a + b, 0); }
  function pct(arr, q) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.max(0, Math.ceil(q * s.length) - 1)];
  }
  function media(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
  function hora(t) {
    const m = Math.floor(8 * 60 + t), h = Math.floor(m / 60) % 24, mm = m % 60;
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  class Pool {
    constructor(spots, zona) { this.s = spots; this.u = new Array(spots.length).fill(false); this.z = zona; }
    tomar() {
      const i = this.u.indexOf(false);
      if (i >= 0) { this.u[i] = true; return { i, x: this.s[i].x, y: this.s[i].y }; }
      const z = this.z; // desbordado: de pie en cualquier parte de la zona
      return { i: -1, x: z.x + 15 + Math.random() * (z.w - 30), y: z.y + 25 + Math.random() * (z.h - 40) };
    }
  }

  /* ---------- Simulación ---------- */
  class Sim {
    constructor(cfg) {
      this.cfg = Object.assign({ escenario: 'sismo', medicos: 4, enfermeras: 2, camas: 10,
        plan: true, apropiativa: true, derivar: true, manual: false, realismo: false, victimasNivel: null, semilla: 42 }, cfg);
      this.init();
    }

    init() {
      const c = this.cfg, esc = ESCENARIOS[c.escenario];
      this.esc = esc; this.t = 0; this.terminado = false; this.horizonte = esc.horizonte;
      this.eventoT = esc.evento ? 60 : null;
      this.manual = !!(esc.evento && c.manual);
      this.planT = esc.evento && c.plan && !this.manual ? this.eventoT + (c.llamada ?? 10) : null;
      this.cupo = 3; this.ordenes = {};
      this.rng = mulberry32((c.semilla * 7919) >>> 0); this.nSegunda = 0;
      this.planActivo = false; this.alertaT = null; this.ambSpawned = 0;
      this.log = []; this.pac = []; this.colaT = []; this.colaD = []; this.colaC = [];
      this.ambs = []; this.nextId = 1;
      this.poolEspera = new Pool(GEO.espera, ZONAS.espera);
      this.poolMed = new Pool(GEO.medEspera, ZONAS.medEspera);
      this.poolPas = new Pool(GEO.pasillo, ZONAS.pasillo);
      this.poolRec = new Pool(GEO.rec, ZONAS.rec);

      const reps = (n, base, lim) => Math.max(0, Math.min(n, lim - base));
      // refuerzos que se convocan con el plan (decisión optimizable); por defecto 3 médicos, 2 enfermeras, 6 camas
      const rf = c.refuerzos || {};
      this.nRefMed = reps(rf.medicos ?? R_MED, c.medicos, MAXDOC);
      this.nRefEnf = reps(rf.enfermeras ?? R_ENF, c.enfermeras, MAXENF);
      this.nRefCama = reps(rf.camas ?? R_CAMA, c.camas, MAXCAMA);

      this.med = Array.from({ length: MAXDOC }, (_, i) => ({
        i, estado: i < c.medicos ? 'libre' : 'ausente', pat: null, retirar: false,
        x: GEO.boxes[i].doc.x, y: GEO.boxes[i].doc.y, tx: GEO.boxes[i].doc.x, ty: GEO.boxes[i].doc.y }));
      this.enf = Array.from({ length: MAXENF }, (_, i) => ({
        i, estado: i < c.enfermeras ? 'libre' : 'ausente', pat: null, retirar: false,
        x: GEO.desks[i].enf.x, y: GEO.desks[i].enf.y, tx: GEO.desks[i].enf.x, ty: GEO.desks[i].enf.y }));
      this.camas = Array.from({ length: MAXCAMA }, (_, i) => ({
        i, estado: i < c.camas ? 'libre' : 'cerrada', pat: null, retirar: false }));

      this.sched = this.generar(); this.si = 0;
      this.ambTimes = this.sched.filter(p => p.amb).map(p => p.tArr - 1.6); this.ai = 0;

      this.acciones = [];
      if (esc.evento) {
        this.acciones.push({ t: this.eventoT, fn: () => this.evento() });
        if (c.realismo && this.nSegunda) this.acciones.push({ t: this.eventoT + esc.dur * 1.6, fn: () => this.addLog(`Segunda oleada: llegan ${this.nSegunda} heridos más (réplica, propagación o rezagados).`, 'alerta') });
        if (this.planT !== null) {
          this.acciones.push({ t: this.planT, fn: () => this.activarPlan() });
          this.acciones.push({ t: this.planT + DEMORA_REF.enfermeras, fn: () => this.llamarEnfermeras() });
          this.acciones.push({ t: this.planT + DEMORA_REF.medicos, fn: () => this.llamarMedicos() });
          this.acciones.push({ t: this.planT + DEMORA_REF.camas, fn: () => this.abrirCamas() });
        }
      }
      this.st = {
        llegados: nl(0), atendidos: nl(0), waits: nl(() => []), totalWaits: nl(() => []),
        muertos: nl(0), abandonos: nl(0), derivados: nl(0), altas: 0, estancias: [], interrup: 0, triadosAntesDeMorir: nl(0),
        muertosEnTriaje: nl(0), muertosEnColaMed: nl(0), ingresoDirecto: 0, subtriage: 0, sobretriage: 0, retriage: 0, fatigaMax: 0,
        picoColaD: 0, picoColaT: 0, uDoc: 0, cDoc: 0, uEnf: 0, cEnf: 0, uCama: 0, cCama: 0, serie: [],
        tColaTMax: 0,
      };
      this.proxMuestra = 0;
      this.addLog(`Turno iniciado. ${esc.nombre}.`, 'info');
    }

    addLog(txt, tipo) {
      this.log.push({ t: this.t, txt, tipo: tipo || 'info' });
      if (this.log.length > 400) this.log.shift();
    }

    generar() {
      const r = mulberry32(this.cfg.semilla), esc = this.esc, lista = [];
      const nivel = (prob) => { const u = r(); let a = 0; for (let k = 0; k < 5; k++) { a += prob[k]; if (u < a) return k + 1; } return 5; };
      const mk = (t, prob, pAmb, forzado) => {
        const lvl = forzado || nivel(prob);
        const amb = lvl <= 2 ? r() < pAmb : r() < pAmb * 0.3;
        const obs = r() < PROB_OBS[lvl - 1];
        let pac = Infinity;
        if (lvl === 4) pac = 150 + r() * 150; else if (lvl === 5) pac = 120 + r() * 120;
        return { tArr: t, lvl, amb, triT: lognormal(r, 6, 0.4), consT: lognormal(r, CONS_MEDIA[lvl - 1], 0.6),
          obs, obsT: lognormal(r, 150, 0.7), paciencia: pac };
      };
      const lamMax = TASA_BASE * 1.5;
      let tt = 0;
      for (;;) {
        tt += -Math.log(1 - r()) / (lamMax / 60);
        if (tt > this.horizonte) break;
        if (r() < PERFIL[(8 + Math.floor(tt / 60)) % 24] * TASA_BASE / lamMax) lista.push(mk(tt, PROB_BASE, 0.4));
      }
      if (esc.evento) {
        const cuentas = this.cfg.victimasNivel || distribucionBase(this.cfg.escenario);
        const niveles = [];
        cuentas.forEach((c, k) => { for (let i = 0; i < c; i++) niveles.push(k + 1); });
        for (const lv of niveles) {
          // realismo: los leves llegan solos y primero; los graves llegan después, cuando los rescatistas los extraen
          const u = !this.cfg.realismo ? Math.pow(r(), 1.4) : lv >= 4 ? Math.pow(r(), 2.2) : lv <= 2 ? 0.15 + 0.85 * Math.pow(r(), 0.8) : Math.pow(r(), 1.4);
          lista.push(mk(this.eventoT + 6 + esc.dur * u, esc.prob, esc.amb, lv));
        }
        if (this.cfg.realismo) {   // segunda oleada (réplica, propagación, familiares): ~20 % más de pacientes
          const extra = niveles.filter((_, i) => i % 5 === 0);
          this.nSegunda = extra.length;
          for (const lv of extra) lista.push(mk(this.eventoT + esc.dur * (1.6 + 0.8 * r()), esc.prob, esc.amb, lv));
        }
      }
      lista.sort((a, b) => a.tArr - b.tArr);
      return lista;
    }

    /* --- eventos temporizados --- */
    evento() {
      this.alertaT = this.t;
      this.addLog(`¡ALERTA! ${this.esc.alerta}. Llegan heridos masivamente.`, 'alerta');
      const c = this.cfg, e = this.esc;
      const pm = Math.min(e.perdMed, c.medicos - 1);
      for (let k = 0; k < pm; k++) {
        const d = this.med[c.medicos - 1 - k];
        if (d.estado === 'libre') d.estado = 'ausente'; else d.retirar = true;
        this.addLog('Un médico queda fuera de servicio por el suceso.', 'alerta');
      }
      const pc = Math.min(e.perdCamas, c.camas - 2);
      for (let k = 0; k < pc; k++) {
        const b = this.camas[c.camas - 1 - k];
        if (b.estado === 'libre') b.estado = 'cerrada'; else b.retirar = true;
      }
      if (pc > 0) this.addLog(`${pc} camas de observación inhabilitadas por daños.`, 'alerta');
    }
    activarPlan() {
      this.planActivo = true;
      this.addLog('PLAN DE DESASTRE ACTIVADO: triaje rápido (START), ingreso directo de rojos/naranjas en ambulancia, se convoca personal.', 'plan');
    }
    llamarEnfermeras() {
      for (let k = 0; k < this.nRefEnf; k++) {
        const n = this.enf[this.cfg.enfermeras + k];
        if (n.estado === 'ausente') { n.estado = 'llegando'; n.x = ENTRADA.x; n.y = ENTRADA.y; n.tx = GEO.desks[n.i].enf.x; n.ty = GEO.desks[n.i].enf.y; }
      }
      if (this.nRefEnf) this.addLog(`Refuerzo: llegan ${this.nRefEnf} enfermeras.`, 'plan');
    }
    llamarMedicos() {
      for (let k = 0; k < this.nRefMed; k++) {
        const d = this.med[this.cfg.medicos + k];
        if (d.estado === 'ausente') { d.estado = 'llegando'; d.x = ENTRADA.x; d.y = ENTRADA.y; d.tx = GEO.boxes[d.i].doc.x; d.ty = GEO.boxes[d.i].doc.y; }
      }
      if (this.nRefMed) this.addLog(`Refuerzo: llegan ${this.nRefMed} médicos.`, 'plan');
    }
    abrirCamas() {
      for (let k = 0; k < this.nRefCama; k++) {
        const b = this.camas[this.cfg.camas + k];
        if (b.estado === 'cerrada') b.estado = 'libre';
      }
      if (this.nRefCama) this.addLog(`Capacidad de sobrecarga: se habilitan ${this.nRefCama} camas extra.`, 'plan');
    }

    /* --- modo comandante: órdenes manuales --- */
    ordenar(tipo) {
      if (!this.manual || this.alertaT === null || this.terminado || this.ordenes[tipo] !== undefined) return false;
      const demora = { plan: 0, enfermeras: 20, medicos: 30, camas: 40 };
      if (!(tipo in demora)) return false;
      this.ordenes[tipo] = this.t;
      const lat = Math.round(this.t - this.alertaT);
      if (tipo === 'plan') {
        this.planT = this.t; this.activarPlan();
        this.addLog(`El comandante activó el plan ${lat} min después de la alerta.`, 'plan');
        return true;
      }
      const fn = { enfermeras: () => this.llamarEnfermeras(), medicos: () => this.llamarMedicos(), camas: () => this.abrirCamas() }[tipo];
      this.addLog(`Orden del comandante: ${{ enfermeras: 'convocar enfermeras', medicos: 'convocar médicos', camas: 'abrir camas extra' }[tipo]} (efecto en ~${demora[tipo]} min).`, 'plan');
      this.acciones.push({ t: this.t + demora[tipo], fn });
      return true;
    }
    // "Atender ya": el paciente pasa al frente de su cola, por encima del nivel de triage
    priorizar(p) {
      if (!this.manual || this.terminado || this.cupo < 1 || p.vip) return false;
      if (!(this.colaT.includes(p) || this.colaD.includes(p))) return false;
      p.vip = true; this.cupo -= 1;
      this.addLog(`Orden del comandante: ${p.known ? 'paciente ' + NOMBRE[p.lvl].toLowerCase() : 'paciente sin clasificar'} pasa al frente de la cola.`, 'plan');
      return true;
    }
    // 0-100: 70 % vidas (ponderadas por gravedad) + 30 % tiempos cumplidos
    puntaje(cumple) {
      const W = [5, 4, 3, 1, 1], s = this.st;
      let pm = 0, pl = 0;
      NIVELES.forEach((n, k) => { pm += W[k] * s.muertos[n]; pl += W[k] * s.llegados[n]; });
      return Math.max(0, Math.round(0.7 * (pl ? 100 * (1 - pm / pl) : 100) + 0.3 * cumple));
    }

    /* --- pacientes --- */
    // Clasifica al paciente; con realismo hay error humano (más probable con saturación y triaje rápido START)
    clasificar(p) {
      p.known = true; p.tClasif = this.t;
      if (!this.cfg.realismo) return;
      const u = this.rng();
      const sub = 0.06 + (this.saturado() ? 0.08 : 0) + (this.planActivo ? 0.04 : 0), sobre = 0.08;
      if (u < sub && p.lvl <= 4) {
        p.nivel = p.lvl + 1; this.st.subtriage++;
        if (this.st.subtriage <= 3) this.addLog(`Error de triage: un paciente ${NOMBRE[p.lvl].toLowerCase()} fue clasificado como ${NOMBRE[p.nivel].toLowerCase()} (subestimado).`, 'alerta');
      } else if (u > 1 - sobre && p.lvl >= 2) {
        p.nivel = p.lvl - 1; this.st.sobretriage++;
      }
    }

    tomarSpot(p, pool) {
      this.liberarSpot(p);
      const r = pool.tomar();
      p.pool = pool; p.si = r.i;
      p.tx = r.x + (Math.random() - 0.5) * 6; p.ty = r.y + (Math.random() - 0.5) * 6;
    }
    liberarSpot(p) { if (p.pool && p.si >= 0) p.pool.u[p.si] = false; p.pool = null; p.si = -1; }

    spawn(a) {
      const p = Object.assign({
        id: this.nextId++, nivel: a.lvl, tClasif: 0, salud: 100, known: false, consRem: a.consT, triRem: a.triT, obsRem: a.obsT,
        espera1: null, tCola: 0, pool: null, si: -1, doc: null, enf: null, cama: null, fin: false,
        estado: 'entrando', x: ENTRADA.x, y: ENTRADA.y, tx: ENTRADA.x, ty: ENTRADA.y,
      }, a);
      this.st.llegados[p.lvl]++;
      if (p.amb) {
        const lane = this.ambSpawned++;
        p.x = 150; p.y = 22 + (lane % 4) * 42 + 36; p.tx = p.x; p.ty = p.y;
      }
      this.pac.push(p);
      if (this.cfg.derivar && this.planActivo && this.debeDerivar(p)) { this.derivar(p); return; }
      if (p.amb && this.planActivo && p.lvl <= 2) {
        this.clasificar(p); p.tCola = this.t; this.colaD.push(p); p.estado = 'haciaEsperaM';
        this.st.ingresoDirecto++;
        this.tomarSpot(p, this.poolMed);
        this.addLog(`Ambulancia: paciente ${NOMBRE[p.lvl].toLowerCase()} ingresa directo (triaje de campo).`, 'plan');
      } else {
        const rec = this.cfg.realismo && (p.amb || p.lvl <= 2);   // ambulancia o gravedad visible: no esperan en la sala común
        if (rec) p.prio = true;
        this.tomarSpot(p, rec && this.poolRec.u.includes(false) ? this.poolRec : this.poolEspera);   // 4 puestos de camilla; el resto espera en la sala común
        if (p.amb && p.lvl <= 2) this.addLog(`Llega en ambulancia un paciente grave (${NOMBRE[p.lvl].toLowerCase()}) sin triaje previo.`, 'info');
      }
    }

    // Desborde: cola médica mucho mayor que la capacidad de atender -> los leves se derivan a otros hospitales
    saturado() {
      const docs = this.med.filter(d => d.estado === 'libre' || d.estado === 'ocupado').length || 1;
      return this.colaD.length + this.colaT.length >= 3 * docs;
    }
    debeDerivar(p) {
      if (p.lvl <= 2) return false;
      if (p.lvl >= 4) return this.saturado();
      const docs = this.med.filter(d => d.estado === 'libre' || d.estado === 'ocupado').length || 1;
      return this.colaD.length + this.colaT.length >= 7 * docs; // amarillos solo en colapso total
    }
    derivar(p) {
      this.liberarSpot(p);
      p.estado = 'abandona'; p.derivado = true; p.known = true; p.tx = ENTRADA.x; p.ty = ENTRADA.y;
      if (p.amb) { p.x = 150; }
      this.st.derivados[p.lvl]++;
      const d = suma(this.st.derivados);
      if (d <= 3 || d % 10 === 0) this.addLog(`Hospital saturado: paciente ${NOMBRE[p.lvl].toLowerCase()} derivado a otro centro (${d} derivados).`, 'plan');
    }

    morir(p) {
      const enTriaje = p.estado === 'esperaT' || p.estado === 'haciaEnf' || p.estado === 'triaje' || p.estado === 'entrando';
      this.quitarDeColas(p);
      this.liberarSpot(p);
      if (p.enf) { const n = p.enf; n.pat = null; n.estado = n.retirar ? 'ausente' : 'libre'; p.enf = null; }
      p.estado = 'muerto'; p.tMuerte = this.t;
      this.st.muertos[p.lvl]++;
      if (enTriaje) this.st.muertosEnTriaje[p.lvl]++; else this.st.muertosEnColaMed[p.lvl]++;
      this.addLog(`Fallece un paciente ${NOMBRE[p.lvl].toLowerCase()} ${enTriaje ? 'antes de ser clasificado' : 'esperando al médico'} (${Math.round(this.t - p.tArr)} min en el hospital).`, 'muerte');
    }
    abandonar(p) {
      this.quitarDeColas(p);
      this.liberarSpot(p);
      p.estado = 'abandona'; p.tx = ENTRADA.x; p.ty = ENTRADA.y;
      this.st.abandonos[p.lvl]++;
      if (this.st.abandonos[p.lvl] <= 3 || this.st.abandonos[p.lvl] % 10 === 0)
        this.addLog(`Un paciente ${NOMBRE[p.lvl].toLowerCase()} se cansa de esperar y se va sin ser atendido.`, 'abandono');
    }
    quitarDeColas(p) { quitar(this.colaT, p); quitar(this.colaD, p); quitar(this.colaC, p); }

    salir(p) {
      this.liberarSpot(p);
      p.estado = 'saliendo'; p.tx = 1215; p.ty = 535 + Math.random() * 50;
      this.st.altas++; this.st.estancias.push(this.t - p.tArr);
    }

    finConsulta(d, p) {
      d.pat = null; p.doc = null;
      d.estado = d.retirar ? 'ausente' : 'libre';
      if (p.obs) {
        p.estado = 'haciaPasillo'; p.tCola2 = this.t; this.colaC.push(p);
        this.tomarSpot(p, this.poolPas);
      } else this.salir(p);
    }

    asignarMedico(d, p) {
      quitar(this.colaD, p); this.liberarSpot(p);
      d.estado = 'ocupado'; d.pat = p; p.doc = d; p.estado = 'haciaBox'; p.nivel = p.lvl;
      p.tx = GEO.boxes[d.i].pat.x; p.ty = GEO.boxes[d.i].pat.y;
      if (p.espera1 === null) {
        p.espera1 = this.t - p.tCola;
        this.st.atendidos[p.lvl]++;
        this.st.waits[p.lvl].push(p.espera1);
        this.st.totalWaits[p.lvl].push(this.t - p.tArr);
      }
    }

    mejor(cola, campo) {
      let b = null;
      for (const p of cola) if (!b || (!!p.vip > !!b.vip) || (!!p.vip === !!b.vip && (p.nivel < b.nivel || (p.nivel === b.nivel && p[campo] < b[campo])))) b = p;
      return b;
    }

    asignar() {
      for (const n of this.enf) {
        if (n.estado !== 'libre' || !this.colaT.length) continue;
        const p = this.colaT.find(q => q.vip) || (this.cfg.realismo ? this.colaT.find(q => q.prio) : null) || this.colaT[0];
        quitar(this.colaT, p);
        this.liberarSpot(p);
        n.estado = 'ocupada'; n.pat = p; p.enf = n; p.estado = 'haciaEnf';
        p.tx = GEO.desks[n.i].pat.x; p.ty = GEO.desks[n.i].pat.y;
      }
      for (const d of this.med) {
        if (d.estado !== 'libre' || !this.colaD.length) continue;
        this.asignarMedico(d, this.mejor(this.colaD, 'tCola'));
      }
      if (this.cfg.apropiativa) this.preemptar();
      for (const b of this.camas) {
        if (b.estado !== 'libre' || !this.colaC.length) continue;
        const p = this.mejor(this.colaC, 'tCola2');
        quitar(this.colaC, p); this.liberarSpot(p);
        b.estado = 'ocupada'; b.pat = p; p.cama = b; p.estado = 'haciaCama';
        p.tx = GEO.camas[b.i].pat.x; p.ty = GEO.camas[b.i].pat.y;
      }
    }

    preemptar() {
      for (;;) {
        let cand = null;
        for (const p of this.colaD) if (p.nivel <= 2 && (!cand || p.nivel < cand.nivel || (p.nivel === cand.nivel && p.tCola < cand.tCola))) cand = p;
        if (!cand) return;
        let vic = null;
        for (const d of this.med) {
          const q = d.pat;
          if (d.estado !== 'ocupado' || !q || q.estado !== 'consulta' || q.nivel < 3 || q.nivel <= cand.nivel) continue;
          if (!vic || q.nivel > vic.pat.nivel || (q.nivel === vic.pat.nivel && q.consRem > vic.pat.consRem)) vic = d;
        }
        if (!vic) return;
        const v = vic.pat;
        this.st.interrup++;
        v.doc = null; vic.pat = null; vic.estado = 'libre';
        v.estado = 'haciaEsperaM'; this.colaD.push(v); this.tomarSpot(v, this.poolMed);
        if (this.st.interrup <= 5 || this.st.interrup % 10 === 0)
          this.addLog(`Se interrumpe una consulta ${NOMBRE[v.lvl].toLowerCase()} para atender a un paciente ${NOMBRE[cand.lvl].toLowerCase()}.`, 'plan');
        this.asignarMedico(vic, cand);
      }
    }

    /* --- paso de simulación --- */
    step() {
      const dt = DT;
      this.t += dt;
      if (this.cupo < 3) this.cupo = Math.min(3, this.cupo + dt / 60);
      for (const a of this.acciones) if (!a.hecho && this.t >= a.t) { a.hecho = true; a.fn(); }
      while (this.ai < this.ambTimes.length && this.ambTimes[this.ai] <= this.t) {
        this.ambs.push({ lane: this.ai % 4, x: -70, estado: 'llega', espera: 0 }); this.ai++;
      }
      while (this.si < this.sched.length && this.sched[this.si].tArr <= this.t) this.spawn(this.sched[this.si++]);

      for (const a of this.ambs) {
        if (a.estado === 'llega') { a.x += 110 * dt; if (a.x >= 120) { a.x = 120; a.estado = 'para'; a.espera = 3.2; } }
        else if (a.estado === 'para') { a.espera -= dt; if (a.espera <= 0) a.estado = 'sale'; }
        else a.x -= 130 * dt;
      }
      this.ambs = this.ambs.filter(a => !(a.estado === 'sale' && a.x < -80));

      for (const p of this.pac) {
        switch (p.estado) {
          case 'entrando':
            if (this.decae(p, dt) && mover(p, VEL * dt)) { p.estado = 'esperaT'; this.colaT.push(p); } break;
          case 'esperaT': case 'haciaEnf': case 'triaje': case 'haciaEsperaM': case 'esperaM': case 'haciaPasillo': case 'esperaCama':
            this.actualizarPaciente(p, dt); break;
          case 'haciaBox': if (mover(p, VEL * dt)) p.estado = 'consulta'; break;
          case 'haciaCama': if (mover(p, VEL * dt)) p.estado = 'cama'; break;
          case 'saliendo': case 'abandona': if (mover(p, VEL * dt)) p.fin = true; break;
          case 'muerto': if (this.t - p.tMuerte > 40) p.fin = true; break;
        }
      }
      this.pac = this.pac.filter(p => !p.fin);

      for (const n of this.enf) {
        if (n.estado === 'llegando') { if (mover(n, VEL * dt)) n.estado = 'libre'; }
        else if (n.estado === 'ocupada' && n.pat && n.pat.estado === 'triaje') {
          const p = n.pat; p.triRem -= dt * (this.planActivo ? 2.5 : 1);
          if (p.triRem <= 0) {
            this.clasificar(p); p.enf = null; n.pat = null;
            n.estado = n.retirar ? 'ausente' : 'libre';
            p.tCola = this.t; p.estado = 'haciaEsperaM'; this.colaD.push(p); this.tomarSpot(p, this.poolMed);
          }
        }
      }
      for (const d of this.med) {
        if (d.estado === 'llegando') { if (mover(d, VEL * dt)) d.estado = 'libre'; }
        else if (d.estado === 'ocupado' && d.pat && d.pat.estado === 'consulta') {
          d.pat.consRem -= dt * (this.cfg.realismo ? 1 - 0.25 * Math.min(1, d.fat || 0) : 1);
          if (d.pat.consRem <= 0) this.finConsulta(d, d.pat);
        }
      }
      for (const b of this.camas) {
        if (b.estado === 'ocupada' && b.pat && b.pat.estado === 'cama') {
          const p = b.pat; p.obsRem -= dt;
          if (p.obsRem <= 0) { b.pat = null; p.cama = null; b.estado = b.retirar ? 'cerrada' : 'libre'; this.salir(p); }
        }
      }

      if (this.cfg.realismo) this.reclasificar();
      this.asignar();
      this.acumular(dt);
      if (this.t >= this.horizonte) { this.terminado = true; this.addLog('Fin del periodo simulado.', 'info'); }
    }

    // Re-triage: quien espera mal clasificado es detectado al cabo de un rato o si se deteriora
    reclasificar() {
      for (const p of this.colaD) {
        if (p.nivel > p.lvl && (this.t - p.tClasif > 25 || p.salud < 70)) {
          p.nivel = p.lvl; this.st.retriage++;
          if (this.st.retriage <= 3) this.addLog(`Re-triage: se detecta que un paciente ${NOMBRE[p.lvl].toLowerCase()} estaba subestimado y sube de prioridad.`, 'plan');
        }
      }
    }

    // true si el paciente sigue vivo y en el hospital; aplica deterioro y abandono
    decae(p, dt) {
      const r = DECAY[p.lvl];
      if (r > 0) { p.salud -= r * dt; if (p.salud <= 0) { this.morir(p); return false; } }
      if (p.paciencia < Infinity && p.espera1 === null && this.t - p.tArr > p.paciencia && p.estado !== 'triaje' && p.estado !== 'haciaEnf') {
        this.abandonar(p); return false;
      }
      return true;
    }
    actualizarPaciente(p, dt) {
      if (!this.decae(p, dt)) return;
      if (p.estado === 'haciaEnf') { if (mover(p, VEL * dt)) p.estado = 'triaje'; }
      else if (p.estado === 'haciaEsperaM') { if (mover(p, VEL * dt)) p.estado = 'esperaM'; }
      else if (p.estado === 'haciaPasillo') { if (mover(p, VEL * dt)) p.estado = 'esperaCama'; }
    }

    acumular(dt) {
      const s = this.st;
      let od = 0, cd = 0, oe = 0, ce = 0, oc = 0, cc = 0;
      for (const d of this.med) if (d.estado === 'libre' || d.estado === 'ocupado') { cd++; if (d.estado === 'ocupado') od++; }
      for (const n of this.enf) if (n.estado === 'libre' || n.estado === 'ocupada') { ce++; if (n.estado === 'ocupada') oe++; }
      for (const b of this.camas) if (b.estado !== 'cerrada') { cc++; if (b.estado === 'ocupada') oc++; }
      if (this.cfg.realismo) for (const d of this.med) {
        if (d.estado === 'ocupado') d.fat = Math.min(1, (d.fat || 0) + dt / 300); else if (d.estado === 'libre') d.fat = Math.max(0, (d.fat || 0) - dt / 150);
        s.fatigaMax = Math.max(s.fatigaMax, d.fat || 0);
      }
      s.uDoc += od * dt; s.cDoc += cd * dt; s.uEnf += oe * dt; s.cEnf += ce * dt; s.uCama += oc * dt; s.cCama += cc * dt;
      s.picoColaD = Math.max(s.picoColaD, this.colaD.length); s.picoColaT = Math.max(s.picoColaT, this.colaT.length);
      if (this.t >= this.proxMuestra) {
        this.proxMuestra += 5;
        s.serie.push({ t: this.t, colaT: this.colaT.length, colaD: this.colaD.length, consulta: od, camas: oc,
          colaC: this.colaC.length, muertos: suma(s.muertos), altas: s.altas, abandonos: suma(s.abandonos), llegados: suma(s.llegados) });
      }
    }

    contadores() {
      let consulta = 0, camas = 0;
      for (const d of this.med) if (d.estado === 'ocupado') consulta++;
      for (const b of this.camas) if (b.estado === 'ocupada') camas++;
      return { colaT: this.colaT.length, colaD: this.colaD.length, consulta, camas, colaC: this.colaC.length,
        muertos: suma(this.st.muertos), abandonos: suma(this.st.abandonos), altas: this.st.altas, llegados: suma(this.st.llegados), derivados: suma(this.st.derivados),
        medAct: this.med.filter(d => d.estado === 'libre' || d.estado === 'ocupado').length,
        enfAct: this.enf.filter(d => d.estado === 'libre' || d.estado === 'ocupada').length,
        camAct: this.camas.filter(b => b.estado !== 'cerrada').length };
    }

    resumen() {
      const s = this.st, pn = {};
      const tot = { llegados: 0, atendidos: 0, muertos: 0, abandonos: 0, derivados: 0, ok: 0, base: 0 };
      let esperas = [];
      for (const n of NIVELES) {
        const w = s.waits[n], lim = LIMITE[n];
        const ok = w.filter(x => x <= lim).length;
        // pendientes que ya superaron el límite también cuentan como incumplimiento
        const pendFail = this.colaD.filter(p => p.lvl === n && this.t - p.tCola > lim).length;
        const base = w.length + s.muertos[n] + s.abandonos[n] + pendFail;
        pn[n] = { llegados: s.llegados[n], atendidos: s.atendidos[n], espMedia: media(w), espP90: pct(w, 0.9), limite: lim,
          cumple: base ? 100 * ok / base : 100, muertos: s.muertos[n], abandonos: s.abandonos[n], derivados: s.derivados[n],
          muertosTriaje: s.muertosEnTriaje[n], muertosCola: s.muertosEnColaMed[n],
          esperaTotal: media(s.totalWaits[n]) };
        tot.llegados += s.llegados[n]; tot.atendidos += s.atendidos[n]; tot.muertos += s.muertos[n];
        tot.abandonos += s.abandonos[n]; tot.derivados += s.derivados[n]; tot.ok += ok; tot.base += base; esperas = esperas.concat(w);
      }
      const u = (a, b) => b ? 100 * a / b : 0;
      return {
        t: this.t, horizonte: this.horizonte, terminado: this.terminado,
        llegados: tot.llegados, atendidos: tot.atendidos, muertos: tot.muertos, abandonos: tot.abandonos,
        altas: s.altas, derivados: tot.derivados, enSistema: tot.llegados - tot.muertos - tot.abandonos - tot.derivados - s.altas,
        espMedia: media(esperas), espP90: pct(esperas, 0.9), cumple: tot.base ? 100 * tot.ok / tot.base : 100,
        estancia: media(s.estancias), interrup: s.interrup, ingresoDirecto: s.ingresoDirecto,
        picoColaD: s.picoColaD, picoColaT: s.picoColaT,
        util: { medicos: u(s.uDoc, s.cDoc), enfermeras: u(s.uEnf, s.cEnf), camas: u(s.uCama, s.cCama) },
        porNivel: pn, serie: s.serie.slice(), eventoT: this.eventoT, planT: this.planT,
        subtriage: s.subtriage, sobretriage: s.sobretriage, retriage: s.retriage, fatigaMax: s.fatigaMax, realismo: !!this.cfg.realismo,
        puntaje: this.puntaje(tot.base ? 100 * tot.ok / tot.base : 100), manual: this.manual,
      };
    }
  }

  const API = { Sim, distribucionBase, R_MED, R_ENF, R_CAMA, DEMORA_REF, ROMANO, DESC, ESCENARIOS, NIVELES, NOMBRE, COLOR, LIMITE, ZONAS, GEO, ENTRADA, W, H, MARGEN, DT, MAXDOC, MAXENF, MAXCAMA, hora };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.UrgSim = API;
})(typeof window !== 'undefined' ? window : globalThis);
