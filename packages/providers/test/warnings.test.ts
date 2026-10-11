import { readFileSync } from 'node:fs';
import type { Warning } from '@routecast/shared/providers';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { mergeWarnings, parseAemetCap, parseMeteoalarmAtom, untar } from '../src/cap';
import { OrsRouting } from '../src/ors';
import { fetchAemetArea, fetchMeteoalarmSpain } from '../src/warnings';
import { AEMET_ZONES, areasForBBox, zoneByName } from '../src/zones';
import { fixture, server, signal } from './setup';

const raw = (name: string) => new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)));
const text = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');
const decoder = new TextDecoder();

describe('tabla de zonas AEMET', () => {
  it('cubre las 19 comunidades con polígonos válidos', () => {
    expect(new Set(AEMET_ZONES.map((z) => z.area)).size).toBe(19);
    expect(AEMET_ZONES.every((z) => z.polygons.length > 0 && z.polygons.every((p) => p.length >= 3))).toBe(true);
  });

  it('casa nombres sin importar tildes ni mayúsculas', () => {
    expect(zoneByName('valle del almanzora y los velez')?.code).toBe('610401');
  });

  it('la caja de Málaga–Granada solo pide Andalucía', () => {
    expect(areasForBBox([-4.6, 36.6, -3.5, 37.3])).toEqual(['61']);
  });
});

describe('CAP de AEMET (fixture real Baleares)', () => {
  const files = untar(raw('aemet-avisos-64.tar'));

  it('extrae los ficheros del tar', () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.every((f) => f.name.endsWith('.xml'))).toBe(true);
  });

  it('solo devuelve avisos (amarillo/naranja/rojo) en español, con polígono y ventana', () => {
    const ws = files.flatMap((f) => parseAemetCap(decoder.decode(f.data)));
    expect(ws.length).toBeGreaterThan(0);
    const mallorca = ws.find((w) => w.areaName === 'Norte y nordeste de Mallorca');
    expect(mallorca).toMatchObject({ level: 'yellow', kind: 'rain', source: 'AEMET' });
    expect(mallorca?.polygons[0]?.length).toBeGreaterThan(3);
    const [lng, lat] = mallorca?.polygons[0]?.[0] ?? [0, 0];
    expect(lng).toBeGreaterThan(2);
    expect(lat).toBeGreaterThan(39);
    expect(mallorca?.description).toMatch(/20 mm/);
    expect((mallorca?.toMs ?? 0) > (mallorca?.fromMs ?? 0)).toBe(true);
  });

  it('un fichero de Andalucía todo en verde no da avisos', () => {
    const all = untar(raw('aemet-avisos-61.tar')).flatMap((f) => parseAemetCap(decoder.decode(f.data)));
    expect(all).toEqual([]);
  });

  it('un tar truncado lanza RangeError (se convierte en bad_response en el adaptador)', () => {
    expect(() => untar(raw('aemet-avisos-64.tar').subarray(0, 700))).toThrow(RangeError);
  });

  it('ignora polígonos con coordenadas absurdas', () => {
    const xml = `<alert><identifier>x</identifier><info><language>es-ES</language><eventCode><valueName>AEMET-Meteoalerta fenomeno</valueName><value>VI;Vientos</value></eventCode><onset>2026-10-12T00:00:00+02:00</onset><expires>2026-10-12T12:00:00+02:00</expires><parameter><valueName>AEMET-Meteoalerta nivel</valueName><value>naranja</value></parameter><area><areaDesc>Valle del Almanzora y Los Vélez</areaDesc><polygon>999,1 2,3 4,5</polygon></area></info></alert>`;
    const [w] = parseAemetCap(xml);
    expect(w?.kind).toBe('wind');
    expect(w?.level).toBe('orange');
    // Polígono inválido → se usa el de la tabla de zonas por nombre.
    expect(w?.polygons).toEqual(zoneByName('Valle del Almanzora y Los Vélez')?.polygons);
  });
});

describe('Meteoalarm Atom (fixture real)', () => {
  it('normaliza nivel y fenómeno y localiza la zona con la tabla de AEMET', () => {
    const ws = parseMeteoalarmAtom(text('meteoalarm-spain.atom'));
    const m = ws.find((w) => w.areaName === 'Norte y nordeste de Mallorca');
    expect(m).toMatchObject({ level: 'yellow', kind: 'rain', source: 'Meteoalarm' });
    expect(m?.zoneCode).toBe(zoneByName('Norte y nordeste de Mallorca')?.code);
    expect(m?.polygons.length).toBeGreaterThan(0);
  });
});

describe('mergeWarnings', () => {
  const base: Warning = {
    id: 'a',
    level: 'yellow',
    kind: 'rain',
    areaName: 'Menorca',
    zoneCode: '640101',
    polygons: [],
    fromMs: 0,
    toMs: 10,
    source: 'Meteoalarm',
  };

  it('el mismo aviso de AEMET y Meteoalarm aparece una vez (gana AEMET a igual nivel)', () => {
    const m = mergeWarnings([[base], [{ ...base, id: 'b', source: 'AEMET' }]]);
    expect(m).toHaveLength(1);
    expect(m[0]?.source).toBe('AEMET');
  });

  it('a distinto nivel gana el más alto; fenómenos o ventanas distintas no se fusionan', () => {
    expect(mergeWarnings([[base, { ...base, id: 'c', level: 'orange' }]])[0]?.level).toBe('orange');
    expect(mergeWarnings([[base, { ...base, id: 'd', kind: 'wind' }]])).toHaveLength(2);
    expect(mergeWarnings([[base, { ...base, id: 'e', fromMs: 20, toMs: 30 }]])).toHaveLength(2);
  });
});

describe('fetchAemetArea (dos pasos, MSW)', () => {
  const META = 'https://opendata.aemet.es/opendata/api/avisos_cap/ultimoelaborado/area/64';
  const DATA = 'https://opendata.aemet.es/opendata/sh/abc123';

  it('sigue la URL de datos con la clave en cabecera y devuelve avisos', async () => {
    let key: string | null = null;
    server.use(
      http.get(META, ({ request }) => {
        key = request.headers.get('api_key');
        return HttpResponse.json({ descripcion: 'exito', estado: 200, datos: DATA });
      }),
      http.get(
        DATA,
        () => new HttpResponse(raw('aemet-avisos-64.tar'), { headers: { 'Content-Type': 'application/x-gtar' } }),
      ),
    );
    const r = await fetchAemetArea('64', { apiKey: 'k' }, signal());
    expect(key).toBe('k');
    expect(r.ok && r.value.length).toBeGreaterThan(0);
  });

  it('estado 429 en el cuerpo → rate_limited; URL de datos ajena → bad_response', async () => {
    server.use(http.get(META, () => HttpResponse.json({ descripcion: 'límite', estado: 429 })));
    expect(await fetchAemetArea('64', { apiKey: 'k' }, signal())).toEqual({
      ok: false,
      error: { kind: 'rate_limited' },
    });
    server.use(http.get(META, () => HttpResponse.json({ estado: 200, datos: 'https://evil.example/x' })));
    const r = await fetchAemetArea('64', { apiKey: 'k' }, signal());
    expect(r.ok === false && r.error.kind).toBe('bad_response');
  });

  it('AEMET caído → unavailable; área manipulada → bad_response sin red', async () => {
    server.use(http.get(META, () => new HttpResponse(null, { status: 503 })));
    expect(await fetchAemetArea('64', { apiKey: 'k' }, signal())).toEqual({
      ok: false,
      error: { kind: 'unavailable', status: 503 },
    });
    const r = await fetchAemetArea('../x', { apiKey: 'k' }, signal());
    expect(r.ok === false && r.error.kind).toBe('bad_response');
  });
});

describe('fetchMeteoalarmSpain', () => {
  it('lee el Atom y rechaza cuerpos que no son un feed', async () => {
    const URL_ = 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-spain';
    server.use(http.get(URL_, () => new HttpResponse(text('meteoalarm-spain.atom'))));
    const r = await fetchMeteoalarmSpain({}, signal());
    expect(r.ok && r.value.length).toBeGreaterThan(0);
    server.use(http.get(URL_, () => new HttpResponse('<html>mantenimiento</html>')));
    const bad = await fetchMeteoalarmSpain({}, signal());
    expect(bad.ok === false && bad.error.kind).toBe('bad_response');
  });
});

describe('OrsRouting (fixture real)', () => {
  const URL_ = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

  it('tres rutas con tiempos acumulados coherentes y la clave en Authorization', async () => {
    let auth: string | null = null;
    server.use(
      http.post(URL_, ({ request }) => {
        auth = request.headers.get('authorization');
        return HttpResponse.json(fixture('ors-malaga-granada.json'));
      }),
    );
    const r = await new OrsRouting({ apiKey: 'secreto' }).getRoutes(
      { lat: 36.7213, lng: -4.4214 },
      { lat: 37.1773, lng: -3.5986 },
      { alternatives: 2, signal: signal() },
    );
    if (!r.ok) throw new Error(r.error.kind);
    expect(auth).toBe('secreto');
    expect(r.value).toHaveLength(3);
    for (const route of r.value) {
      expect(route.cumDurationS).toHaveLength(route.geometry.length);
      expect(Math.abs((route.cumDurationS.at(-1) ?? 0) - route.durationS)).toBeLessThan(2);
    }
  });

  it('código 2009 (sin ruta) → no_route', async () => {
    server.use(
      http.post(URL_, () =>
        HttpResponse.json({ error: { code: 2009, message: 'Route could not be found' } }, { status: 404 }),
      ),
    );
    const r = await new OrsRouting({ apiKey: 'k' }).getRoutes(
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
      { alternatives: 0, signal: signal() },
    );
    expect(r).toEqual({ ok: false, error: { kind: 'no_route' } });
  });
});
