import { sliceLine } from '@routecast/core';
import type { LatLng, RiskLevelOrUnknown } from '@routecast/shared';
import { toHex, toLinearSrgb } from '@routecast/shared/design';
import type { Feature, FeatureCollection } from 'geojson';
import type { GeoJSONSource, Map as MlMap, StyleSpecification } from 'maplibre-gl';
import { createEffect, createSignal, on, onCleanup, onMount, Show } from 'solid-js';
import { reducedMotion } from '../lib/motion';
import { BASE_STYLE_URL, patternImage, recolor, themeColors } from './mapStyle';
import s from './RouteMap.module.css';

export interface MapRoute {
  letter: string;
  geometry: LatLng[];
  cumM: number[];
  segments: { fromKm: number; toKm: number; level: RiskLevelOrUnknown }[];
  ticks: { at: LatLng; label: string }[];
}

export interface RouteMapProps {
  routes: MapRoute[];
  selected: string | null;
  onSelect: (letter: string) => void;
  worst?: LatLng | null;
  dark: boolean;
  /** Huecos ocupados por paneles flotantes, para encuadrar las rutas en la zona visible. */
  padding: () => { top: number; right: number; bottom: number; left: number };
  label: string;
}

const SPAIN: [[number, number], [number, number]] = [
  [-9.6, 35.9],
  [3.5, 43.9],
];

const levelNum = (l: RiskLevelOrUnknown) => (l === 'unknown' ? -1 : l);

/** Validación mínima del estilo externo (CLAUDE.md regla 4): lo justo para que MapLibre no falle a ciegas. */
function isStyle(v: unknown): v is StyleSpecification {
  const s = v as Partial<StyleSpecification> | null;
  return !!s && s.version === 8 && typeof s.sources === 'object' && s.sources !== null && Array.isArray(s.layers);
}

type Fc = FeatureCollection;
const fc = (features: Feature[]): Fc => ({ type: 'FeatureCollection', features });
const line = (pts: LatLng[], props: Record<string, unknown>): Feature => ({
  type: 'Feature',
  properties: props,
  geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lng, p.lat]) },
});
const point = (p: LatLng, props: Record<string, unknown>): Feature => ({
  type: 'Feature',
  properties: props,
  geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
});

function riskColorExpr(dark: boolean) {
  const c = themeColors(dark);
  return [
    'match',
    ['get', 'level'],
    0,
    toHex(c.risk0),
    1,
    toHex(c.risk1),
    2,
    toHex(c.risk2),
    3,
    toHex(c.risk3),
    toHex(c.surfaceSunken),
  ];
}

/**
 * Mapa con MapLibre + OpenFreeMap recoloreado (DESIGN §8). La librería se carga de forma diferida: el resto de la
 * interfaz es utilizable antes. La ruta seleccionada es una cinta: borde de tinta, color de riesgo y patrón.
 */
export function RouteMap(props: RouteMapProps) {
  let container!: HTMLElement;
  let map: MlMap | undefined;
  let base: StyleSpecification | undefined;
  const [ready, setReady] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  let onStyleLoad: (() => void) | undefined;

  const data = () => {
    const segs: Feature[] = [];
    const badges: Feature[] = [];
    for (const r of props.routes) {
      const sel = r.letter === props.selected;
      for (const sg of r.segments) {
        const pts = sliceLine(r.geometry, r.cumM, sg.fromKm * 1000, sg.toKm * 1000);
        if (pts.length >= 2) segs.push(line(pts, { route: r.letter, level: levelNum(sg.level), sel }));
      }
      const total = r.cumM.at(-1) ?? 0;
      const mid = sliceLine(r.geometry, r.cumM, total * 0.42, total * 0.42)[0];
      if (mid) badges.push(point(mid, { letter: r.letter, sel }));
    }
    const sel = props.routes.find((r) => r.letter === props.selected);
    return {
      segments: fc(segs),
      badges: fc(badges),
      ticks: fc((sel?.ticks ?? []).map((tk) => point(tk.at, { label: tk.label }))),
      worst: fc(props.worst ? [point(props.worst, {})] : []),
    };
  };

  const setSource = (id: string, d: Fc) => (map?.getSource(id) as GeoJSONSource | undefined)?.setData(d);

  function addRouteLayers(m: MlMap) {
    if (m.getLayer('route-fill')) return;
    const c = themeColors(props.dark);
    const rgba = (v: typeof c.riskPattern): [number, number, number, number] => {
      const [r, g, b] = toLinearSrgb(v).map((x) =>
        Math.round((x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055) * 255),
      );
      return [r ?? 0, g ?? 0, b ?? 0, Math.round((v.alpha ?? 1) * 255)];
    };
    for (const lvl of [1, 2, 3] as const) {
      if (m.hasImage(`risk-pat-${lvl}`)) m.removeImage(`risk-pat-${lvl}`);
      m.addImage(`risk-pat-${lvl}`, patternImage(lvl, rgba(c.riskPattern)));
    }
    const d = data();
    for (const [id, v] of Object.entries(d)) if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data: v });

    m.addLayer({
      id: 'route-alt',
      type: 'line',
      source: 'segments',
      filter: ['==', ['get', 'sel'], false],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': toHex(c.inkMuted), 'line-width': 4, 'line-dasharray': [1, 1.5], 'line-opacity': 0.85 },
    });
    m.addLayer({
      id: 'route-casing',
      type: 'line',
      source: 'segments',
      filter: ['==', ['get', 'sel'], true],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': toHex(c.routeCasing), 'line-width': 12 },
    });
    m.addLayer({
      id: 'route-fill',
      type: 'line',
      source: 'segments',
      filter: ['==', ['get', 'sel'], true],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: { 'line-color': riskColorExpr(props.dark) as never, 'line-width': 7 },
    });
    for (const lvl of [1, 2, 3] as const) {
      m.addLayer({
        id: `route-pattern-${lvl}`,
        type: 'line',
        source: 'segments',
        filter: ['all', ['==', ['get', 'sel'], true], ['==', ['get', 'level'], lvl]],
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: { 'line-pattern': `risk-pat-${lvl}`, 'line-width': 7 },
      });
    }
    m.addLayer({
      id: 'route-hit',
      type: 'line',
      source: 'segments',
      paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 22 },
    });
    m.addLayer({
      id: 'ticks',
      type: 'symbol',
      source: 'ticks',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-offset': [0, -1.3],
        'text-font': ['Noto Sans Bold'],
      },
      paint: { 'text-color': toHex(c.ink), 'text-halo-color': toHex(c.land), 'text-halo-width': 2 },
    });
    m.addLayer({
      id: 'tick-dots',
      type: 'circle',
      source: 'ticks',
      paint: {
        'circle-radius': 3,
        'circle-color': toHex(c.surface),
        'circle-stroke-color': toHex(c.ink),
        'circle-stroke-width': 1.5,
      },
    });
    m.addLayer({
      id: 'worst',
      type: 'circle',
      source: 'worst',
      paint: {
        'circle-radius': 7,
        'circle-color': toHex(c.surface),
        'circle-stroke-color': toHex(c.ink),
        'circle-stroke-width': 3,
      },
    });
    m.addLayer({
      id: 'badges',
      type: 'circle',
      source: 'badges',
      paint: {
        'circle-radius': 11,
        'circle-color': ['case', ['get', 'sel'], toHex(c.accent), toHex(c.surface)],
        'circle-stroke-color': toHex(c.ink),
        'circle-stroke-width': 1.5,
      },
    });
    m.addLayer({
      id: 'badge-text',
      type: 'symbol',
      source: 'badges',
      layout: {
        'text-field': ['get', 'letter'],
        'text-size': 12,
        'text-font': ['Noto Sans Bold'],
        'text-allow-overlap': true,
      },
      paint: { 'text-color': ['case', ['get', 'sel'], toHex(c.onAccent), toHex(c.ink)] },
    });
  }

  function fit(letter: string | null) {
    if (!map) return;
    const pts = (letter ? props.routes.filter((r) => r.letter === letter) : props.routes).flatMap((r) => r.geometry);
    const all = pts.length ? pts : props.routes.flatMap((r) => r.geometry);
    if (all.length < 2) return;
    let [w, sth, e, n] = [180, 90, -180, -90];
    for (const p of all) {
      if (p.lng < w) w = p.lng;
      if (p.lng > e) e = p.lng;
      if (p.lat < sth) sth = p.lat;
      if (p.lat > n) n = p.lat;
    }
    map.fitBounds(
      [
        [w, sth],
        [e, n],
      ],
      { padding: props.padding(), duration: reducedMotion() ? 0 : 700, maxZoom: 11 },
    );
  }

  onMount(async () => {
    const ctrl = new AbortController();
    onCleanup(() => ctrl.abort());
    try {
      const [{ Map: MapCtor, AttributionControl, setWorkerUrl }, styleRes, , workerUrl] = await Promise.all([
        import('maplibre-gl'),
        fetch(BASE_STYLE_URL, { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(10_000)]) }),
        import('maplibre-gl/dist/maplibre-gl.css'),
        // El worker de MapLibre 6 es un fichero aparte: Vite lo emite como recurso y aquí se le indica la URL.
        import('maplibre-gl/dist/maplibre-gl-worker.mjs?url').then((m: { default: string }) => m.default),
      ]);
      setWorkerUrl(workerUrl);
      if (!styleRes.ok) throw new Error(`style ${styleRes.status}`);
      const raw: unknown = await styleRes.json();
      if (!isStyle(raw)) throw new Error('estilo no válido');
      base = raw;
      if (ctrl.signal.aborted) return;
      map = new MapCtor({
        container,
        style: recolor(base, props.dark),
        bounds: SPAIN,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
      map.touchZoomRotate.disableRotation();
      // Errores de teselas sueltas no rompen nada; si el estilo no llega a cargar, se muestra el aviso.
      map.on('error', () => {
        if (!ready()) setFailed(true);
      });
      map.on('load', () => {
        if (!map) return;
        addRouteLayers(map);
        map.on('click', 'route-hit', (e) => {
          const letter = e.features?.[0]?.properties?.route;
          if (typeof letter === 'string') props.onSelect(letter);
        });
        map.on('mouseenter', 'route-hit', () => {
          if (map) map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'route-hit', () => {
          if (map) map.getCanvas().style.cursor = '';
        });
        setReady(true);
        fit(null);
      });
    } catch {
      if (!ctrl.signal.aborted) setFailed(true);
    }
  });
  onCleanup(() => map?.remove());

  // Datos → fuentes (sin recargar el estilo).
  createEffect(() => {
    const d = data();
    if (!ready()) return;
    setSource('segments', d.segments);
    setSource('badges', d.badges);
    setSource('ticks', d.ticks);
    setSource('worst', d.worst);
  });

  // Nuevas rutas → encuadre general; nueva selección → encuadre suave de esa ruta.
  createEffect(
    on([() => props.routes.map((r) => r.letter + r.geometry.length).join(), ready], () => ready() && fit(null), {
      defer: true,
    }),
  );
  createEffect(
    on(
      () => props.selected,
      (sel) => ready() && sel && fit(sel),
      { defer: true },
    ),
  );

  // Tema → estilo recoloreado + capas propias.
  createEffect(
    on(
      () => props.dark,
      (dark) => {
        if (!map || !base || !ready()) return;
        const m = map;
        if (onStyleLoad) m.off('style.load', onStyleLoad);
        onStyleLoad = () => {
          onStyleLoad = undefined;
          addRouteLayers(m);
        };
        m.once('style.load', onStyleLoad);
        m.setStyle(recolor(base, dark), { diff: false });
      },
      { defer: true },
    ),
  );

  return (
    <div class={s.wrap}>
      <section ref={container} class={s.map} aria-label={props.label} />
      <Show when={failed()}>
        <p class={s.fallback}>{props.label}</p>
      </Show>
    </div>
  );
}
