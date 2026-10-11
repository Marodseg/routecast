import { FallbackRouting, OpenMeteoWeather, OsrmRouting, PhotonGeocoding, ValhallaRouting } from '@routecast/providers';
import type { GeocodingProvider, RoutingProvider, WeatherProvider } from '@routecast/shared/providers';

/**
 * Único punto donde la web conoce proveedores concretos (ADR-0003). Orden y límites son configuración:
 * Valhalla (alternativas reales) → OSRM FOSSGIS → OSRM demo. El Worker con ORS se añade en la fase 4.
 */
export interface Services {
  routing: RoutingProvider & { status?: () => { id: string; state: string }[] };
  /** Nombre visible del proveedor de una ruta (atribución). */
  providerLabel: (providerId: string) => string;
  /** ¿La ruta viene de un proveedor de respaldo? (la UI lo indica). */
  isFallback: (providerId: string) => boolean;
  weather: WeatherProvider;
  geocoding: GeocodingProvider;
}

const LABELS: Record<string, string> = {
  valhalla: 'Valhalla (FOSSGIS)',
  'osrm-fossgis': 'OSRM (FOSSGIS)',
  'osrm-demo': 'OSRM',
};

export function createServices(): Services {
  return {
    providerLabel: (id) => LABELS[id] ?? id,
    isFallback: (id) => id !== 'valhalla',
    routing: new FallbackRouting([
      { provider: new ValhallaRouting() },
      { provider: new OsrmRouting({ id: 'osrm-fossgis', baseUrl: 'https://routing.openstreetmap.de/routed-car' }) },
      { provider: new OsrmRouting({ id: 'osrm-demo', baseUrl: 'https://router.project-osrm.org' }) },
    ]),
    weather: new OpenMeteoWeather(),
    geocoding: new PhotonGeocoding(),
  };
}
