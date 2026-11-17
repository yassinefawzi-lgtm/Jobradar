import type { GeoPoint } from "./distance";

export interface GeocodeCache {
  get(key: string): Promise<{ point: GeoPoint | null } | undefined>;
  set(key: string, point: GeoPoint | null, label: string | null): Promise<void>;
}

const ENDPOINT = "https://data.geopf.fr/geocodage/search";

export function geocodeKey(city: string | null, postalCode: string | null): string | null {
  const c = (city ?? "").trim().toLowerCase();
  const p = (postalCode ?? "").trim();
  if (!c && !p) return null;
  return `${p}|${c}`;
}

/**
 * Géocode une commune via la Géoplateforme IGN (gratuit, sans clé), avec cache persistant.
 * Retourne null si la commune est introuvable ; ne lève jamais d'erreur bloquante.
 */
export async function geocodeCity(
  city: string | null,
  postalCode: string | null,
  cache: GeocodeCache,
  fetchImpl: typeof fetch = fetch,
): Promise<GeoPoint | null> {
  const key = geocodeKey(city, postalCode);
  if (!key) return null;
  const cached = await cache.get(key);
  if (cached) return cached.point;
  const dept = postalCode && /^(\d{2,3}|2A|2B)$/.test(postalCode) ? postalCode : null;
  // Le géocodeur ignore les requêtes de moins de 3 caractères : le département complète la recherche.
  const q = dept && city ? `${city} ${dept}` : (city ?? postalCode ?? "");
  const params = new URLSearchParams({ q: q.trim(), index: "address", type: "municipality", limit: dept ? "20" : "1" });
  if (postalCode && /^\d{5}$/.test(postalCode)) params.set("postcode", postalCode);
  try {
    const res = await fetchImpl(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null; // erreur temporaire : pas de mise en cache
    const data = (await res.json()) as {
      features?: { geometry?: { coordinates?: [number, number] }; properties?: { label?: string; postcode?: string; citycode?: string } }[];
    };
    // Avec un département connu (e-mails d'alerte : « Eu (76) »), on garde la commune de ce département.
    const feature = dept ? data.features?.find((f) => (f.properties?.postcode ?? f.properties?.citycode ?? "").startsWith(dept)) : data.features?.[0];
    const coords = feature?.geometry?.coordinates;
    const point = coords ? { lon: coords[0], lat: coords[1] } : null;
    await cache.set(key, point, feature?.properties?.label ?? null);
    return point;
  } catch {
    return null;
  }
}
