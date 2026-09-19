"use client";

import { useEffect, useMemo, useRef } from "react";
import type { LatLng, VehicleLocation } from "@swachhata/core";
import { MAPS } from "@/lib/config";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { MarkerAnimator } from "@/features/map/animator";
import { TRUCK_SVG } from "@/features/map/truck-marker";

interface PreviewMapProps {
  location: VehicleLocation | null;
  route: LatLng[];
  vehicleNumber: string;
}

const WIDTH = 720;
const HEIGHT = 520;
const PADDING = 72;

/** Web Mercator, good enough over a few square kilometres. */
function project(point: LatLng) {
  const x = (point.lng + 180) / 360;
  const sin = Math.sin((point.lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return { x, y };
}

/**
 * Shown when no Maps API key is configured.
 *
 * It is deliberately schematic and labelled as a preview: it renders the same live
 * coordinates with the same animation, so the tracking experience can be reviewed
 * without pretending to be a real map of Hassan.
 */
export function PreviewMap({ location, route, vehicleNumber }: PreviewMapProps) {
  const plateRef = useRef<SVGGElement | null>(null);
  const labelRef = useRef<SVGGElement | null>(null);
  const trailRef = useRef<SVGPolylineElement | null>(null);
  const animatorRef = useRef<MarkerAnimator | null>(null);
  const trail = useRef<string[]>([]);
  const reducedMotion = useReducedMotion();

  const { toScreen, routePath } = useMemo(() => {
    const points = route.length >= 2 ? route : [MAPS.defaultCenter];
    const projected = points.map(project);
    const xs = projected.map((p) => p.x);
    const ys = projected.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX || 0.0008;
    const spanY = maxY - minY || 0.0008;
    const scale = Math.min((WIDTH - PADDING * 2) / spanX, (HEIGHT - PADDING * 2) / spanY);

    const toScreen = (point: LatLng) => {
      const p = project(point);
      return {
        x: PADDING + (p.x - minX) * scale + (WIDTH - PADDING * 2 - spanX * scale) / 2,
        y: PADDING + (p.y - minY) * scale + (HEIGHT - PADDING * 2 - spanY * scale) / 2,
      };
    };

    return {
      toScreen,
      routePath: points.map(toScreen).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
    };
  }, [route]);

  useEffect(() => {
    animatorRef.current?.destroy();
    trail.current = [];

    animatorRef.current = new MarkerAnimator((pose) => {
      const { x, y } = toScreen(pose);
      plateRef.current?.setAttribute(
        "transform",
        `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${pose.heading.toFixed(1)})`,
      );
      // The label rides along but never rotates with the truck.
      labelRef.current?.setAttribute(
        "transform",
        `translate(${x.toFixed(1)} ${(y - 34).toFixed(1)})`,
      );

      const point = `${x.toFixed(1)},${y.toFixed(1)}`;
      if (trail.current[trail.current.length - 1] !== point) {
        trail.current = [...trail.current.slice(-160), point];
        trailRef.current?.setAttribute("points", trail.current.join(" "));
      }
    }, reducedMotion);

    return () => {
      animatorRef.current?.destroy();
      animatorRef.current = null;
    };
  }, [toScreen, reducedMotion]);

  useEffect(() => {
    if (location) animatorRef.current?.push(location);
  }, [location]);

  return (
    <div className="relative h-full w-full bg-[#eef1ee]">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label={`Preview map showing collection vehicle ${vehicleNumber}`}
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#dfe5e1" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={WIDTH} height={HEIGHT} fill="url(#grid)" />
        <polyline points={routePath} fill="none" stroke="#087F5B" strokeOpacity="0.22" strokeWidth="14" strokeLinejoin="round" strokeLinecap="round" />
        <polyline ref={trailRef} points="" fill="none" stroke="#087F5B" strokeOpacity="0.55" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <g ref={plateRef} transform={`translate(${WIDTH / 2} ${HEIGHT / 2})`}>
          <g
            transform="scale(1.35) translate(-17 -17)"
            dangerouslySetInnerHTML={{ __html: TRUCK_SVG }}
          />
        </g>
        <g ref={labelRef} transform={`translate(${WIDTH / 2} ${HEIGHT / 2 - 34})`}>
          <rect x="-34" y="-11" width="68" height="22" rx="11" fill="#10201A" />
          <text
            x="0"
            y="1"
            textAnchor="middle"
            dominantBaseline="central"
            fill="#FFFFFF"
            fontSize="12"
            fontWeight="600"
          >
            {vehicleNumber}
          </text>
        </g>
      </svg>

      <p className="absolute bottom-3 left-3 rounded-lg bg-surface/92 px-2.5 py-1.5 text-[11px] font-medium text-ink-muted shadow-card">
        Preview map · add a Google Maps API key for the live street map
      </p>
    </div>
  );
}
