import {
  FallbackRouting,
  OpenMeteoWeather,
  OsrmRouting,
  PhotonGeocoding,
  ValhallaRouting,
  WorkerRouting,
  WorkerWarnings,
} from '@routecast/providers';
import type {
  GeocodingProvider,
  RoutingProvider,
  WarningsProvider,
  WeatherProvider,
} from '@routecast/shared/providers';

/**
 * Único punto donde la web conoce proveedores concretos (ADR-0003). Orden y límites son configuración:
 * Valhalla (alternativas reales) → OSRM FOSSGIS → OSRM demo → ORS a través del Worker (clave secreta).
 */
export interface Services {
  routing: RoutingProvider & { status?: () => { id: string; state: string }[] };
  /** Nombre visible del proveedor de una ruta (atribución). */
  providerLabel: (providerId: string) => string;
  /** ¿La ruta viene de un proveedor de respaldo? (la UI lo indica). */
  isFallback: (providerId: string) => boolean;
  weather: WeatherProvider;
  geocoding: GeocodingProvider;
  /** null si no hay Worker configurado (la UI dice que no hay avisos disponibles, no que no haya avisos). */
  warnings: WarningsProvider | null;
}

const LABELS: Record<string, string> = {
  valhalla: 'Valhalla (FOSSGIS)',
  'osrm-fossgis': 'OSRM (FOSSGIS)',
  'osrm-demo': 'OSRM',
  ors: 'openrouteservice',
};

/** URL del Worker: `VITE_API_BASE` en build; en desarrollo, `wrangler dev` en :8787. */
export function apiBase(): string | null {
  const fromEnv = import.meta.env.VITE_API_BASE as string | undefined;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return import.meta.env.DEV ? 'http://localhost:8787' : null;
}

export function createServices(base: string | null = apiBase()): Services {
  const chain = [
    { provider: new ValhallaRouting() },
    { provider: new OsrmRouting({ id: 'osrm-fossgis', baseUrl: 'https://routing.openstreetmap.de/routed-car' }) },
    { provider: new OsrmRouting({ id: 'osrm-demo', baseUrl: 'https://router.project-osrm.org' }) },
    ...(base ? [{ provider: new WorkerRouting({ baseUrl: base }) }] : []),
  ];
  return {
    providerLabel: (id) => LABELS[id] ?? id,
    isFallback: (id) => id !== 'valhalla',
    routing: new FallbackRouting(chain),
    weather: new OpenMeteoWeather(),
    geocoding: new PhotonGeocoding(),
    warnings: base ? new WorkerWarnings({ baseUrl: base }) : null,
  };
}
