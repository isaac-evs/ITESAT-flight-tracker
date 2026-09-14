import type { Polygon } from "geojson";

const EARTH_RADIUS_M = 6371000;

/** Approximate geodesic circle polygon, accurate enough for a few-km CEP radius. */
export function circlePolygon(
  center: [number, number],
  radiusMeters: number,
  points = 48,
): Polygon {
  const [lon, lat] = center;
  const latRad = (lat * Math.PI) / 180;
  const coordinates: [number, number][] = [];

  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dLat = ((radiusMeters * Math.cos(angle)) / EARTH_RADIUS_M) * (180 / Math.PI);
    const dLon =
      ((radiusMeters * Math.sin(angle)) / (EARTH_RADIUS_M * Math.cos(latRad))) * (180 / Math.PI);
    coordinates.push([lon + dLon, lat + dLat]);
  }

  return { type: "Polygon", coordinates: [coordinates] };
}
