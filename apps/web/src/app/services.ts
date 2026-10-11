import { FallbackRouting, OpenMeteoWeather, OsrmRouting, PhotonGeocoding, ValhallaRouting } from '@routecast/providers';
import type { GeocodingProvider, RoutingProvider, WeatherProvider } from '@routecast/shared/providers';

/**
 * Único punto donde la web conoce proveedores concretos (ADR-0003). Orden y límites son configuración:
 * Valhalla (alternativas reales) → OSRM FOSSGIS → OSRM demo. El Worker con ORS se añade en la fase 4.
 */
export interface Services {
  routing: RoutingProvider & { status?: () => { id: string; state: string }[] };
  weather: WeatherProvider;
  geocoding: GeocodingProvider;
}

export function createServices(): Services {
  return {
    routing: new FallbackRouting([
      { provider: new ValhallaRouting() },
      { provider: new OsrmRouting({ id: 'osrm-fossgis', baseUrl: 'https://routing.openstreetmap.de/routed-car' }) },
      { provider: new OsrmRouting({ id: 'osrm-demo', baseUrl: 'https://router.project-osrm.org' }) },
    ]),
    weather: new OpenMeteoWeather(),
    geocoding: new PhotonGeocoding(),
  };
}
