/* Prototipos de dirección visual (fase 1). Datos FICTICIOS de ejemplo, sin red.
   Script clásico (no módulo) para poder abrir los HTML con file://. */
(() => {
  const B = { west: -4.78, east: -3.32, north: 37.34, south: 36.56 };
  const KX = Math.cos((37 * Math.PI) / 180);
  const S = 1000;
  const W = (B.east - B.west) * KX * S;
  const H = (B.north - B.south) * S;
  const project = ([lat, lng]) => [(lng - B.west) * KX * S, (B.north - lat) * S];

  const places = [
    { name: 'Málaga', at: [36.721, -4.421], rank: 1, dx: -10, dy: 26, anchor: 'end' },
    { name: 'Granada', at: [37.177, -3.599], rank: 1, dx: 12, dy: -12, anchor: 'start' },
    { name: 'Antequera', at: [37.019, -4.561], rank: 2, dx: -12, dy: 4, anchor: 'end' },
    { name: 'Loja', at: [37.168, -4.151], rank: 2, dx: 0, dy: -14, anchor: 'middle' },
    { name: 'Motril', at: [36.746, -3.518], rank: 2, dx: 12, dy: 18, anchor: 'start' },
    { name: 'Nerja', at: [36.758, -3.875], rank: 3, dx: 0, dy: 22, anchor: 'middle' },
    { name: 'Alhama de Granada', at: [37.006, -3.989], rank: 3, dx: -12, dy: -8, anchor: 'end' },
    { name: 'Vélez-Málaga', at: [36.781, -4.101], rank: 3, dx: -10, dy: -10, anchor: 'end' },
    { name: 'Archidona', at: [37.093, -4.388], rank: 3, dx: 8, dy: -10, anchor: 'start' },
  ];

  const coast = [
    [36.47, -4.78], [36.54, -4.62], [36.62, -4.5], [36.708, -4.42], [36.715, -4.28], [36.74, -4.09],
    [36.745, -3.875], [36.73, -3.69], [36.74, -3.585], [36.72, -3.52], [36.72, -3.36], [36.71, -3.32],
  ];

  // Sierras (centros aproximados) para dibujar curvas de nivel decorativas.
  const ranges = [
    { at: [36.9, -3.95], r: 70, rings: 5 },
    { at: [37.05, -3.38], r: 110, rings: 6 },
    { at: [37.08, -4.12], r: 45, rings: 3 },
    { at: [36.93, -4.62], r: 55, rings: 4 },
    { at: [37.25, -3.85], r: 40, rings: 3 },
  ];

  const LEVELS = [
    { id: 0, es: 'Sin riesgo', short: 'Bajo' },
    { id: 1, es: 'Precaución', short: 'Precaución' },
    { id: 2, es: 'Alto', short: 'Alto' },
    { id: 3, es: 'Severo', short: 'Severo' },
  ];

  const FACTORS = {
    crosswind: {
      es: 'Viento cruzado',
      text: (l) => `Racha cruzada de ${[18, 35, 50, 62][l]} km/h (racha ${[24, 46, 66, 82][l]})`,
    },
    rain: { es: 'Lluvia', text: (l) => `Lluvia de ${[0.3, 3.4, 9.1, 22][l].toLocaleString('es-ES')} mm/h` },
    fog: { es: 'Visibilidad', text: (l) => `Visibilidad de ${[9000, 900, 350, 90][l].toLocaleString('es-ES')} m` },
  };

  const routes = [
    {
      id: 'A',
      roads: 'A-45 · A-92',
      via: 'por Antequera',
      km: 128,
      durMin: 84,
      factor: 'crosswind',
      where: 'A-92 km 141 · cerca de Antequera',
      worstAtMin: 24,
      wind: { heading: 52, from: 281 },
      path: [
        [36.721, -4.421], [36.8, -4.47], [36.92, -4.52], [37.0, -4.53], [37.05, -4.45], [37.093, -4.388],
        [37.14, -4.26], [37.165, -4.15], [37.19, -3.95], [37.19, -3.78], [37.177, -3.599],
      ],
      shape: [0, 1, 2, 3, 3, 3, 2, 1, 1, 0, 0],
      hourly: [0, 1, 1, 2, 3, 3, 2, 1, 1, 0, 0, 0],
    },
    {
      id: 'B',
      roads: 'A-7 · A-44',
      via: 'por Motril',
      km: 171,
      durMin: 106,
      factor: 'rain',
      where: 'A-44 km 172 · Vélez de Benaudalla',
      worstAtMin: 70,
      wind: { heading: 355, from: 250 },
      path: [
        [36.721, -4.421], [36.73, -4.25], [36.745, -4.09], [36.765, -3.875], [36.745, -3.69], [36.765, -3.53],
        [36.84, -3.52], [36.95, -3.55], [37.05, -3.6], [37.177, -3.599],
      ],
      shape: [0, 0, 1, 1, 2, 3, 3, 2, 1, 0],
      hourly: [1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 0, 0],
    },
    {
      id: 'C',
      roads: 'A-356 · A-402',
      via: 'por Alhama',
      km: 112,
      durMin: 111,
      factor: 'fog',
      where: 'A-402 km 26 · Alhama de Granada',
      worstAtMin: 48,
      wind: { heading: 20, from: 200 },
      path: [
        [36.721, -4.421], [36.781, -4.101], [36.88, -4.03], [37.006, -3.989], [37.08, -3.85], [37.13, -3.72],
        [37.177, -3.599],
      ],
      shape: [0, 1, 3, 3, 2, 1, 0],
      hourly: [1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 0, 0],
    },
  ];

  const PICKER = { min: 15 * 60 + 40, max: 23 * 60 + 50, step: 10, now: 15 * 60 + 40, initial: 17 * 60 };

  const hourIndex = (min) => Math.max(0, Math.min(11, Math.floor(min / 60) - 12));
  const worstAt = (route, min) => route.hourly[hourIndex(min)];
  const levelAt = (route, v, min) => Math.min(route.shape[v], worstAt(route, min));

  function summary(route, min) {
    const worst = worstAt(route, min);
    const n = route.path.length;
    let high = 0;
    for (let v = 0; v < n; v++) if (levelAt(route, v, min) >= 2) high++;
    const kmHigh = Math.round((high / n) * route.km);
    return {
      worst,
      kmHigh,
      worstTime: fmtTime(min + route.worstAtMin),
      worstText: FACTORS[route.factor].text(worst),
      arrival: fmtTime(min + route.durMin),
    };
  }

  /** Orden del comparador (SPEC §6.4): peor nivel, km en riesgo alto, duración. */
  const ranked = (min) =>
    routes
      .map((r) => ({ r, s: summary(r, min) }))
      .sort((a, b) => a.s.worst - b.s.worst || a.s.kmHigh - b.s.kmHigh || a.r.durMin - b.r.durMin);

  const pad = (n) => String(n).padStart(2, '0');
  function fmtTime(min) {
    const m = ((min % 1440) + 1440) % 1440;
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  }
  const fmtDur = (min) => `${Math.floor(min / 60)} h ${pad(min % 60)}`;

  // Polilínea proyectada, longitud acumulada y punto/rumbo a una fracción.
  function geom(route) {
    const pts = route.path.map(project);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const total = cum[cum.length - 1];
    function at(f) {
      const d = f * total;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, angle: Math.atan2(y1 - y0, x1 - x0) };
    }
    return { pts, cum, total, at };
  }

  // Curvas de nivel deterministas (ruido senoidal), sin aleatoriedad.
  function contour(cx, cy, r, seed) {
    const n = 48;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + 0.18 * Math.sin(a * 3 + seed) + 0.09 * Math.sin(a * 5 + seed * 2.1) + 0.05 * Math.cos(a * 7 + seed);
      const x = cx + Math.cos(a) * r * k * 1.35;
      const y = cy + Math.sin(a) * r * k;
      d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return `${d}Z`;
  }

  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  }

  /**
   * Pinta el mapa falso. El estilo lo pone el CSS de cada dirección mediante clases:
   * .land .sea .coast .contour .grat .grat-label .place .place-dot .route .route-casing .seg .seg-pattern .tick
   * .tick-label .route-badge. Tamaños en CSS como calc(var(--u) * Npx): --u = unidades de mapa por píxel de pantalla,
   * así texto y trazos no cambian con el encuadre.
   */
  function renderMap(svg, { gratStep = 0.1, labelEvery = 2, ticks = true, chevrons = false, pad = () => [24, 24, 24, 24] } = {}) {
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const defs = svg.querySelector('defs') || el('defs', {}, svg);
    // Patrones de riesgo (nivel 1: puntos, 2: rayado, 3: rayado cruzado); se escalan con --u en fit().
    const p1 = el('pattern', { id: 'pat-1', width: 6, height: 6, patternUnits: 'userSpaceOnUse' }, defs);
    el('circle', { cx: 3, cy: 3, r: 1.1, class: 'pat-ink' }, p1);
    const p2 = el('pattern', { id: 'pat-2', width: 6, height: 6, patternUnits: 'userSpaceOnUse' }, defs);
    el('rect', { x: 0, y: 0, width: 2, height: 6, class: 'pat-ink' }, p2);
    const p3 = el('pattern', { id: 'pat-3', width: 6, height: 6, patternUnits: 'userSpaceOnUse' }, defs);
    el('rect', { x: 0, y: 0, width: 2, height: 6, class: 'pat-ink' }, p3);
    el('rect', { x: 0, y: 0, width: 6, height: 2, class: 'pat-ink' }, p3);
    const pats = [[p1, ''], [p2, 'rotate(45)'], [p3, 'rotate(45)']];

    const M = 3000; // margen para que mar, retícula y relieve cubran cualquier encuadre
    const base = el('g', { class: 'base' }, svg);
    el('rect', { class: 'land', x: -M, y: -M, width: W + 2 * M, height: H + 2 * M }, base);
    const coastP = coast.map(project);
    const seaPts = [[-M, coastP[0][1]], ...coastP, [W + M, coastP[coastP.length - 1][1]], [W + M, H + M], [-M, H + M]];
    const seaD = `M${seaPts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join('L')}Z`;
    el('path', { class: 'sea', d: seaD }, base);
    el('path', { class: 'sea-hatch', d: seaD }, base);
    el('path', { class: 'coast', d: `M${coastP.map((p) => p.map((n) => n.toFixed(1)).join(',')).join('L')}` }, base);
    ranges.forEach((rg, i) => {
      const [cx, cy] = project(rg.at);
      for (let k = rg.rings; k >= 1; k--) {
        el('path', { class: `contour${k === 1 ? ' contour-top' : ''}`, d: contour(cx, cy, (rg.r * k) / rg.rings, i * 1.7 + k * 0.4) }, base);
      }
    });

    const grat = el('g', { class: 'grat-g' }, svg);
    const gratLabels = [];
    for (let lng = Math.ceil((B.west - 2) / gratStep) * gratStep; lng < B.east + 2; lng += gratStep) {
      const [x] = project([0, lng]);
      const major = Math.round(lng / gratStep) % labelEvery === 0;
      el('line', { class: major ? 'grat grat-major' : 'grat', x1: x, x2: x, y1: -M, y2: H + M }, grat);
      if (major) gratLabels.push({ axis: 'x', v: x, text: `${Math.abs(lng).toFixed(1)}°O` });
    }
    for (let lat = Math.ceil((B.south - 2) / gratStep) * gratStep; lat < B.north + 2; lat += gratStep) {
      const [, y] = project([lat, 0]);
      const major = Math.round(lat / gratStep) % labelEvery === 0;
      el('line', { class: major ? 'grat grat-major' : 'grat', x1: -M, x2: W + M, y1: y, y2: y }, grat);
      if (major) gratLabels.push({ axis: 'y', v: y, text: `${lat.toFixed(1)}°N` });
    }
    const gratLabelG = el('g', { class: 'grat-labels' }, svg);

    const routesG = el('g', { class: 'routes' }, svg);
    const placesG = el('g', { class: 'places' }, svg);
    const badgesG = el('g', { class: 'badges' }, svg);

    const handles = routes.map((route) => {
      const g = geom(route);
      const d = `M${g.pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join('L')}`;
      // Máscara que "dibuja" la ruta siguiendo el camino al llegar los resultados.
      const mask = el('mask', { id: `reveal-${route.id}`, maskUnits: 'userSpaceOnUse', x: -M, y: -M, width: W + 2 * M, height: H + 2 * M }, defs);
      el('path', { class: 'route-reveal', d, pathLength: 1 }, mask);
      const grp = el('g', { class: 'route', 'data-route': route.id, mask: `url(#reveal-${route.id})` }, routesG);
      el('path', { class: 'route-casing', d }, grp);
      const segs = [];
      for (let i = 1; i < g.pts.length; i++) {
        const sd = `M${g.pts[i - 1].join(',')}L${g.pts[i].join(',')}`;
        segs.push([el('path', { class: 'seg', d: sd }, grp), el('path', { class: 'seg-pattern', d: sd }, grp)]);
      }
      const tickG = el('g', { class: 'ticks' }, grp);
      const chevG = el('g', { class: 'chevrons' }, grp);
      const badge = el('g', { class: 'route-badge', 'data-route': route.id }, badgesG);
      el('rect', { class: 'route-badge-box', x: -10, y: -10, width: 20, height: 20 }, badge);
      el('text', { class: 'route-badge-text', 'text-anchor': 'middle', 'dominant-baseline': 'central', y: 0.5 }, badge).textContent = route.id;
      return { route, g, grp, segs, tickG, chevG, badge };
    });
    const badgeAt = { A: 0.36, B: 0.42, C: 0.5 };

    let u = 1;
    let last = null;
    function fit() {
      const cw = svg.clientWidth || 1;
      const ch = svg.clientHeight || 1;
      const [pt, pr, pb, pl] = pad(cw, ch);
      const all = [...handles.flatMap((h) => h.g.pts), ...places.filter((p) => p.rank <= 2).map((p) => project(p.at))];
      const xs = all.map((p) => p[0]);
      const ys = all.map((p) => p[1]);
      const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
      const aw = Math.max(40, cw - pl - pr), ah = Math.max(40, ch - pt - pb);
      u = Math.max((bx1 - bx0) / aw, (by1 - by0) / ah);
      const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
      const vx = cx - (pl + aw / 2) * u, vy = cy - (pt + ah / 2) * u;
      svg.setAttribute('viewBox', `${vx.toFixed(1)} ${vy.toFixed(1)} ${(cw * u).toFixed(1)} ${(ch * u).toFixed(1)}`);
      svg.style.setProperty('--u', u.toFixed(4));
      pats.forEach(([p, rot]) => p.setAttribute('patternTransform', `${rot} scale(${u.toFixed(4)})`));
      gratLabelG.replaceChildren();
      for (const gl of gratLabels) {
        const t = gl.axis === 'x'
          ? el('text', { class: 'grat-label', x: gl.v + 4 * u, y: vy + ch * u - 8 * u }, gratLabelG)
          : el('text', { class: 'grat-label', x: vx + cw * u - 8 * u, y: gl.v - 4 * u, 'text-anchor': 'end' }, gratLabelG);
        t.textContent = gl.text;
      }
      placesG.replaceChildren();
      for (const p of places) {
        const [x, y] = project(p.at);
        el('circle', { class: `place-dot rank-${p.rank}`, cx: x, cy: y, r: (p.rank === 1 ? 5 : 3) * u }, placesG);
        el('text', { class: `place rank-${p.rank}`, x: x + p.dx * u, y: y + p.dy * u, 'text-anchor': p.anchor }, placesG).textContent = p.name;
      }
      for (const h of handles) {
        const { x, y } = h.g.at(badgeAt[h.route.id]);
        h.badge.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${u.toFixed(4)})`);
        h.chevG.replaceChildren();
        if (chevrons) {
          for (let f = 0.06; f < 0.97; f += 0.07) {
            const a = h.g.at(f);
            el('path', { class: 'chevron', d: 'M-3,-3.5L1.5,0L-3,3.5', transform: `translate(${a.x},${a.y}) rotate(${(a.angle * 180) / Math.PI}) scale(${u})` }, h.chevG);
          }
        }
      }
      if (last) update(...last);
    }

    function update(min, selectedId) {
      last = [min, selectedId];
      for (const h of handles) {
        const sel = h.route.id === selectedId;
        h.grp.classList.toggle('is-selected', sel);
        h.badge.classList.toggle('is-selected', sel);
        h.segs.forEach(([s, sp], i) => {
          const lv = Math.max(levelAt(h.route, i, min), levelAt(h.route, i + 1, min));
          s.setAttribute('class', `seg r${lv}`);
          sp.setAttribute('class', `seg-pattern p${lv}`);
          sp.setAttribute('stroke', lv ? `url(#pat-${lv})` : 'none');
        });
        h.tickG.replaceChildren();
        if (ticks && sel) {
          const stepMin = 20;
          for (let t = stepMin; t < h.route.durMin - 8; t += stepMin) {
            const { x, y, angle } = h.g.at(t / h.route.durMin);
            const a = (angle * 180) / Math.PI;
            el('line', { class: 'tick', x1: 0, x2: 0, y1: -11, y2: 11, transform: `translate(${x},${y}) rotate(${a}) scale(${u})` }, h.tickG);
            const lbl = el('text', { class: 'tick-label', x: x + 22 * u * Math.sin(angle), y: y - 22 * u * Math.cos(angle) + 4 * u, 'text-anchor': 'middle' }, h.tickG);
            lbl.textContent = fmtTime(min + t);
          }
        }
      }
      const selH = handles.find((h) => h.route.id === selectedId);
      if (selH) routesG.appendChild(selH.grp);
    }

    new ResizeObserver(() => fit()).observe(svg);
    fit();
    return { update, fit, handles };
  }

  /** Gestión común de teclado para un control role=slider. */
  function sliderKeys(e, value, set) {
    const map = { ArrowRight: 10, ArrowUp: 10, ArrowLeft: -10, ArrowDown: -10, PageUp: 60, PageDown: -60 };
    if (e.key in map) {
      e.preventDefault();
      set(value + map[e.key]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      set(PICKER.now);
    } else if (e.key === 'End') {
      e.preventDefault();
      set(PICKER.max);
    }
  }

  const clampStep = (v) => Math.max(PICKER.min, Math.min(PICKER.max, Math.round(v / PICKER.step) * PICKER.step));

  /** Iconos de factor y nivel: trazo 1.5, rejilla 20. */
  const ICONS = {
    crosswind:
      '<path d="M10 2v16" stroke-dasharray="2 2.5"/><path d="M2 7h11a2.5 2.5 0 1 0-2.5-2.5"/><path d="M2 12h14a2.5 2.5 0 1 1-2.5 2.5"/>',
    rain: '<path d="M5 3l-2 5M10 3l-2 5M15 3l-2 5M7 11l-2 5M12 11l-2 5M17 11l-2 5"/>',
    fog: '<path d="M2 6h16M4 10h12M2 14h16M6 18h8"/>',
    l0: '<circle cx="10" cy="10" r="3"/>',
    l1: '<path d="M10 4l7 12H3z"/>',
    l2: '<path d="M10 3l7 14H3z"/><path d="M10 8v4M10 14.5v.5"/>',
    l3: '<path d="M6.5 2.5h7l4 4v7l-4 4h-7l-4-4v-7z"/><path d="M10 6.5v4.5M10 13.5v.5"/>',
  };
  const icon = (name, cls = 'ico') =>
    `<svg class="${cls}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  /** RoadWind: rumbo de la carretera + vector de viento, con la componente cruzada resaltada. */
  function roadWindSVG(route, level) {
    const { heading, from } = route.wind;
    const gust = [24, 46, 66, 82][level];
    const theta = ((from - heading) * Math.PI) / 180;
    const cross = Math.round(gust * Math.abs(Math.sin(theta)));
    const head = Math.round(gust * Math.cos(theta));
    const R = 46;
    const toXY = (deg, r) => [60 + r * Math.sin((deg * Math.PI) / 180), 60 - r * Math.cos((deg * Math.PI) / 180)];
    const [rx1, ry1] = toXY(heading + 180, R);
    const [rx2, ry2] = toXY(heading, R);
    // El viento sopla HACIA from+180: flecha que entra desde "from".
    const len = 14 + (gust / 82) * 30;
    const [wx1, wy1] = toXY(from, len);
    const [wx2, wy2] = toXY(from + 180, len * 0.35);
    // Componente cruzada: perpendicular a la carretera, en el lado hacia el que empuja
    const side = Math.sin(theta) > 0 ? -90 : 90;
    const crossLen = (cross / 82) * 40;
    const [cx2, cy2] = toXY(heading + side, crossLen);
    let ticks = '';
    for (let d = 0; d < 360; d += 15) {
      const [a1, b1] = toXY(d, 54);
      const [a2, b2] = toXY(d, d % 90 === 0 ? 48 : 51);
      ticks += `<line x1="${a1.toFixed(1)}" y1="${b1.toFixed(1)}" x2="${a2.toFixed(1)}" y2="${b2.toFixed(1)}" class="rw-tick"/>`;
    }
    return {
      cross,
      head,
      gust,
      svg: `<svg viewBox="0 0 120 120" class="roadwind" role="img" aria-label="Carretera hacia ${heading}°, viento del ${from}°: componente cruzada ${cross} km/h">
        <circle cx="60" cy="60" r="54" class="rw-ring"/>${ticks}
        <text x="60" y="13" class="rw-n" text-anchor="middle">N</text>
        <line x1="${rx1.toFixed(1)}" y1="${ry1.toFixed(1)}" x2="${rx2.toFixed(1)}" y2="${ry2.toFixed(1)}" class="rw-road"/>
        <line x1="${rx1.toFixed(1)}" y1="${ry1.toFixed(1)}" x2="${rx2.toFixed(1)}" y2="${ry2.toFixed(1)}" class="rw-road-center"/>
        <line x1="60" y1="60" x2="${cx2.toFixed(1)}" y2="${cy2.toFixed(1)}" class="rw-cross"/>
        <circle cx="${cx2.toFixed(1)}" cy="${cy2.toFixed(1)}" r="3" class="rw-cross-end"/>
        <line x1="${wx1.toFixed(1)}" y1="${wy1.toFixed(1)}" x2="${wx2.toFixed(1)}" y2="${wy2.toFixed(1)}" class="rw-wind" marker-end="url(#rw-arrow)"/>
        <defs><marker id="rw-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="rw-arrowhead"/></marker></defs>
      </svg>`,
    };
  }

  /** Prototipo: duplica los tokens oscuros del media query bajo :root[data-theme='dark'] y cablea el botón. */
  function themeToggle(button) {
    const walk = (rules, parent) => {
      for (const r of rules) {
        if (r.conditionText?.includes('prefers-color-scheme: dark')) {
          const inner = [...r.cssRules].find((x) => x.selectorText);
          if (inner) parent.insertRule(`:root[data-theme='dark'] { ${inner.style.cssText} }`, parent.cssRules.length);
        } else if (r.cssRules) walk([...r.cssRules], r);
      }
    };
    for (const sh of document.styleSheets) walk([...sh.cssRules], sh);
    button.addEventListener('click', () => {
      const root = document.documentElement;
      const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
    });
  }

  window.RC = {
    themeToggle,
    routes, LEVELS, FACTORS, PICKER, summary, ranked, worstAt, levelAt, fmtTime, fmtDur, renderMap,
    sliderKeys, clampStep, icon, roadWindSVG, hourIndex,
    reduced: () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
})();
