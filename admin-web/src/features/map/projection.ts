import type { LatLng } from "@swachhata/core";

export const VIEW = { width: 960, height: 620, padding: 72 } as const;

/** Web Mercator, good enough over a city. */
function mercator(point: LatLng) {
  const x = (point.lng + 180) / 360;
  const sin = Math.sin((point.lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return { x, y };
}

/** Builds a fit-to-bounds projection for the given coordinates. */
export function makeProjection(points: LatLng[]) {
  const source = points.length > 0 ? points : [{ lat: 13.0068, lng: 76.0996 }];
  const projected = source.map(mercator);
  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 0.0008;
  const spanY = Math.max(...ys) - minY || 0.0008;
  const scale = Math.min(
    (VIEW.width - VIEW.padding * 2) / spanX,
    (VIEW.height - VIEW.padding * 2) / spanY,
  );

  const offsetX = (VIEW.width - spanX * scale) / 2;
  const offsetY = (VIEW.height - spanY * scale) / 2;

  return (point: LatLng) => {
    const p = mercator(point);
    return { x: offsetX + (p.x - minX) * scale, y: offsetY + (p.y - minY) * scale };
  };
}
