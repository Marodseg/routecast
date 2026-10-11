import { describe, expect, it } from 'vitest';
import { buildIndex, mergePlaces, norm, searchGazetteer } from './gazetteer';

const rows = [
  ['Granada', '', 'Granada', 37.18, -3.6, 233975],
  ['San Sebastián', 'Donostia|Donostia / San Sebastián', 'Gipuzkoa', 43.32, -1.98, 189866],
  ['San Sebastián de los Reyes', '', 'Madrid', 40.55, -3.62, 96992],
  ['Hendaya', 'Hendaye', 'Francia', 43.36, -1.77, 18102],
  ['A Coruña', 'La Coruña', 'A Coruña', 43.37, -8.4, 251543],
  ['Granadilla de Abona', '', 'Santa Cruz de Tenerife', 28.12, -16.58, 58752],
  ['Graz', '', 'Austria', 47.07, 15.44, 290000, 'AT'],
  ['roto', 'x', 'y', 999, 0, 1],
];
const index = buildIndex(rows);

describe('nomenclátor', () => {
  it('descarta filas mal formadas', () => {
    expect(index).toHaveLength(7);
  });

  it('encuentra exónimos y nombres cooficiales', () => {
    expect(searchGazetteer(index, 'Hendaya')[0]?.name).toBe('Hendaya');
    expect(searchGazetteer(index, 'hendaye')[0]?.name).toBe('Hendaya');
    expect(searchGazetteer(index, 'la coruña')[0]?.name).toBe('A Coruña');
    expect(searchGazetteer(index, 'donostia')[0]?.name).toBe('San Sebastián');
  });

  it('a igual coincidencia gana la más poblada; el nombre exacto gana al prefijo', () => {
    expect(searchGazetteer(index, 'San Sebastián').map((p) => p.name)).toEqual([
      'San Sebastián',
      'San Sebastián de los Reyes',
    ]);
    expect(searchGazetteer(index, 'grana').map((p) => p.name)).toEqual(['Granada', 'Granadilla de Abona']);
  });

  it('a igual coincidencia prima España sobre una ciudad europea más poblada', () => {
    expect(searchGazetteer(index, 'gra')[0]?.name).toBe('Granada');
    expect(searchGazetteer(index, 'graz')[0]?.name).toBe('Graz');
  });

  it('ignora tildes, mayúsculas y signos', () => {
    expect(norm('  Vitoria-Gasteiz ')).toBe('vitoria gasteiz');
    expect(searchGazetteer(index, 'GRANADA')[0]?.detail).toBe('Granada');
  });

  it('une con Photon sin duplicar el mismo sitio', () => {
    const local = searchGazetteer(index, 'Granada');
    const photon = [
      { id: 'p1', name: 'Granada', detail: 'Andalucía', at: { lat: 37.17, lng: -3.6 } },
      { id: 'p2', name: 'Granada', detail: 'Castilla y León', at: { lat: 40.9, lng: -5.9 } },
    ];
    expect(mergePlaces(local, photon, 'Granada').map((p) => p.id)).toEqual([local[0]?.id, 'p2']);
  });

  it('descarta coincidencias difusas de Photon y duplicados cercanos con otro nombre', () => {
    const local = searchGazetteer(index, 'Hendaya');
    const photon = [
      { id: 'h', name: 'Hendaye', detail: 'Nouvelle-Aquitaine', at: { lat: 43.358, lng: -1.774 } },
      { id: 'dz', name: 'الحناية', detail: 'DZ', at: { lat: 35.0, lng: -1.4 } },
      { id: 'st', name: 'Hendaya-alde', detail: 'Gipuzkoa', at: { lat: 43.36, lng: -1.85 } },
    ];
    expect(mergePlaces(local, photon, 'Hendaya').map((p) => p.id)).toEqual([local[0]?.id, 'st']);
  });
});
