/* UI: gráficas SVG sin dependencias para la pestaña Recomendaciones.
 * Reglas: un solo eje por gráfica, barras finas con extremo redondeado anclado a la base, líneas de 2 px,
 * leyenda solo con 2+ series, texto en tinta (nunca del color de la serie), tooltip al pasar el cursor (<title>).
 * Colores validados (azul / naranja: ΔE CVD 24,7, contraste ≥ 3:1 sobre blanco). */
(function (root) {
  'use strict';
  const C1 = '#2a78d6', C2 = '#eb6834', TINTA = '#1d2a35', SUAVE = '#6b7a86', REJILLA = '#e3e8ec';
  const W = 600;
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v, d) => (+v).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });

  const DIV = 5;   // divisiones del eje y: con topes 1/2/5/10 × 10^k las marcas quedan redondas
  /** Escala "bonita" para el eje y. */
  function tope(max) {
    if (max <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(max))), n = max / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  function ejes(m, ph, ymax, unidad, ancho) {
    let s = '';
    for (let k = 0; k <= DIV; k++) {
      const v = ymax * k / DIV, y = m.t + ph * (1 - k / DIV), paso = ymax / DIV;
      s += `<line x1="${m.l}" x2="${ancho - m.r}" y1="${y}" y2="${y}" stroke="${REJILLA}"/>` +
        `<text x="${m.l - 6}" y="${y + 4}" text-anchor="end" fill="${SUAVE}" font-size="11">${num(v, paso < 1 ? (paso < 0.1 ? 2 : 1) : 0)}${unidad}</text>`;
    }
    return s;
  }

  /** Barra vertical con extremo superior redondeado (4 px) anclada a la base. */
  function barra(x, y, w, h, color) {
    if (h <= 0) return `<rect x="${x}" y="${y - 1}" width="${w}" height="1" fill="${color}"/>`;
    const r = Math.min(4, w / 2, h);
    return `<path d="M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z" fill="${color}"/>`;
  }

  /**
   * Barras de una sola serie.
   * datos: [{ etq, v, tip, etiqueta? }]  (etiqueta: true para escribir el valor sobre la barra)
   * op: { unidad, alto, ref: { v, txt } (línea de referencia), decimales }
   */
  function barras(datos, op) {
    op = op || {};
    const H = op.alto || 220, m = { l: 44, r: 10, t: 16, b: 46 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const ymax = tope(Math.max(op.ref ? op.ref.v : 0, ...datos.map(d => d.v)) * 1.08), u = op.unidad || '', dec = op.decimales ?? 1;
    const paso = pw / datos.length, bw = Math.min(42, paso * 0.6);
    let s = ejes(m, ph, ymax, u, W);
    datos.forEach((d, i) => {
      const x = m.l + paso * i + (paso - bw) / 2, h = ph * d.v / ymax, y = m.t + ph - h;
      s += `<g class="marca"><title>${esc(d.tip || d.etq + ': ' + num(d.v, dec) + u)}</title>` +
        `<rect x="${m.l + paso * i}" y="${m.t}" width="${paso}" height="${ph}" fill="transparent"/>${barra(x, y, bw, h, op.color || C1)}</g>`;
      if (d.etiqueta) s += `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" fill="${TINTA}" font-size="11" font-weight="600">${num(d.v, dec)}${u}</text>`;
      s += etiquetaX(m.l + paso * (i + 0.5), m.t + ph + 15, d.etq, paso);
    });
    if (op.ref) {
      const y = m.t + ph * (1 - op.ref.v / ymax);
      s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="${TINTA}" stroke-dasharray="5 4"/>` +
        `<text x="${W - m.r}" y="${y - 5}" text-anchor="end" fill="${TINTA}" font-size="11">${esc(op.ref.txt)}</text>`;
    }
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ph}" y2="${m.t + ph}" stroke="${SUAVE}"/>`;
    return svg(H, s, op.titulo);
  }

  /** Línea de una sola serie con marcadores; op.ref dibuja una línea de meta. */
  function linea(datos, op) {
    op = op || {};
    const H = op.alto || 220, m = { l: 44, r: 10, t: 16, b: 46 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const ymax = op.max || tope(Math.max(op.ref ? op.ref.v : 0, ...datos.map(d => d.v)) * 1.08), u = op.unidad || '', dec = op.decimales ?? 0;
    const ins = 24;   // margen interior para que el primer y el último punto (y sus etiquetas) no se corten
    const paso = datos.length > 1 ? (pw - 2 * ins) / (datos.length - 1) : 0;
    const X = (i) => m.l + ins + (datos.length > 1 ? paso * i : (pw - 2 * ins) / 2), Y = (v) => m.t + ph * (1 - v / ymax);
    let s = ejes(m, ph, ymax, u, W);
    if (op.ref) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(op.ref.v)}" y2="${Y(op.ref.v)}" stroke="${TINTA}" stroke-dasharray="5 4"/>` +
      `<text x="${m.l + 4}" y="${Y(op.ref.v) - 5}" text-anchor="start" fill="${TINTA}" font-size="11">${esc(op.ref.txt)}</text>`;
    s += `<polyline points="${datos.map((d, i) => `${X(i)},${Y(d.v)}`).join(' ')}" fill="none" stroke="${op.color || C1}" stroke-width="2" stroke-linejoin="round"/>`;
    datos.forEach((d, i) => {
      s += `<g class="marca"><title>${esc(d.tip || d.etq + ': ' + num(d.v, dec) + u)}</title><circle cx="${X(i)}" cy="${Y(d.v)}" r="12" fill="transparent"/>` +
        `<circle cx="${X(i)}" cy="${Y(d.v)}" r="4.5" fill="${op.color || C1}" stroke="#fff" stroke-width="2"/></g>`;
      if (d.etiqueta) s += `<text x="${X(i)}" y="${Y(d.v) - 10}" text-anchor="middle" fill="${TINTA}" font-size="11" font-weight="600">${num(d.v, dec)}${u}</text>`;
      s += etiquetaX(X(i), m.t + ph + 15, d.etq, paso || pw);
    });
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ph}" y2="${m.t + ph}" stroke="${SUAVE}"/>`;
    return svg(H, s, op.titulo);
  }

  /**
   * Barras agrupadas de 2 series (p. ej. antes / después) con leyenda.
   * cats: [nombre]; series: [{ nombre, valores: [] }]
   */
  function agrupadas(cats, series, op) {
    op = op || {};
    const H = op.alto || 240, m = { l: 44, r: 10, t: 16, b: 46 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const colores = [C1, C2], u = op.unidad || '';
    const ymax = tope(Math.max(1, ...series.flatMap(s => s.valores)) * 1.12);
    const paso = pw / cats.length, bw = Math.min(30, paso * 0.32), gap = 2;
    let s = ejes(m, ph, ymax, u, W);
    cats.forEach((c, i) => {
      const x0 = m.l + paso * i + (paso - (bw * series.length + gap * (series.length - 1))) / 2;
      series.forEach((se, k) => {
        const v = se.valores[i], h = ph * v / ymax, x = x0 + k * (bw + gap), y = m.t + ph - h;
        s += `<g class="marca"><title>${esc(`${c} · ${se.nombre}: ${num(v, 0)}${u}`)}</title>` +
          `<rect x="${x - 2}" y="${m.t}" width="${bw + 4}" height="${ph}" fill="transparent"/>${barra(x, y, bw, h, colores[k])}</g>` +
          `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" fill="${TINTA}" font-size="11">${num(v, 0)}</text>`;
      });
      s += etiquetaX(m.l + paso * (i + 0.5), m.t + ph + 15, c, paso);
    });
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ph}" y2="${m.t + ph}" stroke="${SUAVE}"/>`;
    const leyenda = `<div class="leyenda cuadros">${series.map((se, k) => `<span><i style="background:${colores[k]}"></i>${esc(se.nombre)}</span>`).join('')}</div>`;
    return leyenda + svg(H, s, op.titulo);
  }

  /** Etiqueta del eje x partida en dos líneas si no cabe. */
  function etiquetaX(x, y, txt, ancho) {
    const max = Math.max(6, Math.floor(ancho / 6.2));
    const t = String(txt);
    if (t.length <= max) return `<text x="${x}" y="${y}" text-anchor="middle" fill="${SUAVE}" font-size="11">${esc(t)}</text>`;
    const corte = t.lastIndexOf(' ', max) > 0 ? t.lastIndexOf(' ', max) : max;
    const a = t.slice(0, corte), b = t.slice(corte).trim();
    return `<text x="${x}" y="${y}" text-anchor="middle" fill="${SUAVE}" font-size="11">${esc(a)}<tspan x="${x}" dy="13">${esc(b.length > max ? b.slice(0, max - 1) + '…' : b)}</tspan></text>`;
  }

  function svg(H, cuerpo, titulo) {
    return `<svg class="viz" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titulo || 'Gráfica')}" preserveAspectRatio="xMidYMid meet" font-family="system-ui, 'Segoe UI', sans-serif">${cuerpo}</svg>`;
  }

  root.UrgGraficas = { barras, linea, agrupadas };
})(typeof window !== 'undefined' ? window : globalThis);
