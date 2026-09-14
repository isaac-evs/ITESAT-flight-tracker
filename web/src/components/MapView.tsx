import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Feature } from "geojson";
import { ChevronLeft, ChevronRight, Layers, Pause, Play, Satellite, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { circlePolygon } from "../lib/geo";
import { config } from "../lib/config";
import { escapeHtml } from "../lib/html";
import type { Theme } from "../hooks/useTheme";
import type { TelemetryRecord } from "../types";

const UNCERTAINTY_SOURCE_ID = "uncertainty-circles";
const UNCERTAINTY_FILL_LAYER_ID = "uncertainty-circles-fill";
const UNCERTAINTY_LINE_LAYER_ID = "uncertainty-circles-line";
const POINTS_SOURCE_ID = "position-points";
const POINTS_LAYER_ID = "position-points-circle";

const DEFAULT_UNCERTAINTY_M = 500;
type Basemap = "flat" | "satellite";
const STYLE_URL: Record<Theme, string> = {
  dark: "mapbox://styles/mapbox/dark-v11",
  light: "mapbox://styles/mapbox/light-v11",
};
const SATELLITE_STYLE_URL = "mapbox://styles/mapbox/satellite-streets-v12";

function resolveStyle(theme: Theme, basemap: Basemap): string {
  return basemap === "satellite" ? SATELLITE_STYLE_URL : STYLE_URL[theme];
}

interface FixSummary {
  momsn?: number;
  transmit_time?: string;
  latitude: number;
  longitude: number;
  cep?: number;
  session_status?: number;
  decoded_text?: string;
}

interface PointProperties {
  isLatest: boolean;
  sequenceStart: number;
  sequenceEnd: number;
  fixesJson: string;
}

const LATEST_COLOR = "#1d4ed8";
const FOCUS_COLOR = "#c026d3";

export interface FocusRequest {
  record: TelemetryRecord;
  /** Bump this on every click, even re-clicking the same record, so the
   * fly-to effect re-fires (object/record identity alone wouldn't change). */
  nonce: number;
}

// The Iridium SBD network occasionally redelivers the exact same message
// (would share one MOMSN in real live data), so consecutive fixes can land
// on the literal same coordinate a few seconds apart. Rather than nudging
// them apart visually (which would misleadingly suggest the balloon moved
// when it didn't), group consecutive same-position fixes into one dot and
// list every recording for that spot in its popup.
function groupByPosition(positioned: TelemetryRecord[]): TelemetryRecord[][] {
  const groups: TelemetryRecord[][] = [];
  for (const r of positioned) {
    const current = groups[groups.length - 1];
    if (current && current[0].latitude === r.latitude && current[0].longitude === r.longitude) {
      current.push(r);
    } else {
      groups.push([r]);
    }
  }
  return groups;
}

function toFeatures(positioned: TelemetryRecord[]): { circles: Feature[]; points: Feature[] } {
  const groups = groupByPosition(positioned);
  const circles: Feature[] = [];
  const points: Feature[] = [];
  let seen = 0;

  groups.forEach((group, gi) => {
    const sequenceStart = seen + 1;
    seen += group.length;
    const sequenceEnd = seen;
    const isLatestGroup = gi === groups.length - 1;
    const first = group[0];
    const center: [number, number] = [first.longitude as number, first.latitude as number];
    const radiusMeters = (first.cep ? first.cep * 1000 : DEFAULT_UNCERTAINTY_M) || DEFAULT_UNCERTAINTY_M;

    circles.push({
      type: "Feature",
      geometry: circlePolygon(center, radiusMeters),
      properties: { isLatest: isLatestGroup },
    });

    const fixes: FixSummary[] = group.map((r) => ({
      momsn: r.momsn,
      transmit_time: r.transmit_time,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      cep: r.cep,
      session_status: r.session_status,
      decoded_text: r.decoded_text,
    }));
    const properties: PointProperties = {
      isLatest: isLatestGroup,
      sequenceStart,
      sequenceEnd,
      fixesJson: JSON.stringify(fixes),
    };
    points.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: center },
      properties,
    });
  });

  return { circles, points };
}

function fixHtml(f: FixSummary, showMomsn: boolean): string {
  return `
    <div class="space-y-0.5 opacity-80">
      ${showMomsn ? `<div class="mb-0.5 font-medium opacity-100">MOMSN ${escapeHtml(f.momsn)}</div>` : ""}
      <div>Transmit: ${escapeHtml(f.transmit_time)}</div>
      <div>Lat/Lon: ${f.latitude.toFixed(4)}, ${f.longitude.toFixed(4)}</div>
      <div>CEP: ${f.cep !== undefined ? `${f.cep} km` : "—"}</div>
      <div>Session status: ${escapeHtml(f.session_status)}</div>
    </div>
    ${f.decoded_text ? `<div class="mt-1 font-mono opacity-70">${escapeHtml(f.decoded_text)}</div>` : ""}`;
}

function popupHtml(p: PointProperties, total: number): string {
  const fixes: FixSummary[] = JSON.parse(p.fixesJson);
  const count = fixes.length;
  const rangeLabel =
    count > 1 ? `Fixes ${p.sequenceStart}–${p.sequenceEnd} of ${total}` : `Fix ${p.sequenceStart} of ${total}`;
  const header = count > 1 ? `${count} recordings at this position` : `MOMSN ${escapeHtml(fixes[0].momsn)}`;

  return `
    <div class="min-w-[210px] max-w-[260px] text-xs">
      <div class="mb-1 font-semibold text-sm">${header}</div>
      <div class="mb-1.5 opacity-60">${rangeLabel}${p.isLatest ? " (latest)" : ""}</div>
      <div class="max-h-48 space-y-2 overflow-y-auto pr-1">
        ${fixes
          .map(
            (f, i) =>
              `<div${i > 0 ? ' class="border-t pt-1.5" style="border-color: rgba(128,128,128,0.35)"' : ""}>${fixHtml(f, count > 1)}</div>`,
          )
          .join("")}
      </div>
    </div>`;
}

/**
 * Every fix is drawn as an independent point with a translucent uncertainty
 * circle around it (Iridium's own CEP is typically a couple of kilometers);
 * click a point to see its full telemetry.
 */
export function MapView({
  records,
  theme,
  reviewMode = false,
  focus = null,
}: {
  records: TelemetryRecord[];
  theme: Theme;
  /** True when reviewing a manually-picked date range: fits the map to the
   * whole range instead of the always-on "follow the live position"
   * behavior, and hides the pulsing live marker. */
  reviewMode?: boolean;
  /** Set to fly to and highlight a specific record, e.g. from clicking a row
   * in the telemetry feed table. */
  focus?: FocusRequest | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const playMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const focusMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const positionedRef = useRef<TelemetryRecord[]>([]);
  const currentStyleRef = useRef<string | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [playIndex, setPlayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Memoized so this only produces a new array when the underlying records
  // actually change - otherwise every parent re-render (e.g. a live
  // connection-status tick) would create a fresh array reference and reset
  // playback / re-run every effect keyed on it for no reason.
  const positioned = useMemo(
    () => records.filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number"),
    [records],
  );
  positionedRef.current = positioned;
  const latest = positioned[positioned.length - 1];

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!config.mapboxToken) return;

    mapboxgl.accessToken = config.mapboxToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: resolveStyle(theme, basemap),
      center: [0, 0],
      zoom: 2,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;
    currentStyleRef.current = resolveStyle(theme, basemap);

    const syncLayers = () => {
      if (!map.getSource(UNCERTAINTY_SOURCE_ID)) {
        map.addSource(UNCERTAINTY_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: UNCERTAINTY_FILL_LAYER_ID,
          type: "fill",
          source: UNCERTAINTY_SOURCE_ID,
          paint: {
            "fill-color": "#3987e5",
            "fill-opacity": ["case", ["get", "isLatest"], 0.16, 0.06],
          },
        });
        map.addLayer({
          id: UNCERTAINTY_LINE_LAYER_ID,
          type: "line",
          source: UNCERTAINTY_SOURCE_ID,
          paint: {
            "line-color": "#3987e5",
            "line-width": ["case", ["get", "isLatest"], 1.5, 0.75],
            "line-opacity": ["case", ["get", "isLatest"], 0.7, 0.3],
          },
        });
      }

      if (!map.getSource(POINTS_SOURCE_ID)) {
        map.addSource(POINTS_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: POINTS_LAYER_ID,
          type: "circle",
          source: POINTS_SOURCE_ID,
          paint: {
            "circle-radius": ["case", ["get", "isLatest"], 6, 4],
            "circle-color": ["case", ["get", "isLatest"], LATEST_COLOR, "#ffffff"],
            "circle-opacity": 1,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff",
          },
        });
      }

      const { circles, points } = toFeatures(positionedRef.current);
      (map.getSource(UNCERTAINTY_SOURCE_ID) as mapboxgl.GeoJSONSource)?.setData({
        type: "FeatureCollection",
        features: circles,
      });
      (map.getSource(POINTS_SOURCE_ID) as mapboxgl.GeoJSONSource)?.setData({
        type: "FeatureCollection",
        features: points,
      });
    };

    // "style.load" fires as soon as the new style JSON is applied - do NOT
    // gate this on isStyleLoaded() (tiles/sources may still be loading, so
    // it's often still false here), or the re-add silently gets skipped and
    // the points vanish on every theme/basemap switch.
    map.on("load", syncLayers);
    map.on("style.load", syncLayers);

    const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true, offset: 10 });
    map.on("click", POINTS_LAYER_ID, (e) => {
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const coords = feature.geometry.coordinates.slice() as [number, number];
      const total = positionedRef.current.length;
      popup.setLngLat(coords).setHTML(popupHtml(feature.properties as PointProperties, total)).addTo(map);
    });
    map.on("mouseenter", POINTS_LAYER_ID, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", POINTS_LAYER_ID, () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme/basemap switch: swap the base style; syncLayers() re-adds data via style.load.
  // Only call setStyle() when the resolved style actually differs from what
  // this map instance currently has - comparing against a "did we already
  // run once" flag instead breaks under React StrictMode's dev-mode double
  // mount (the map gets destroyed and recreated, but a plain useRef flag
  // survives that remount), which would call setStyle on a brand-new map
  // before its initial "load" fires and silently wipe the layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const nextStyle = resolveStyle(theme, basemap);
    if (currentStyleRef.current === nextStyle) return;
    currentStyleRef.current = nextStyle;
    map.setStyle(nextStyle);
  }, [theme, basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyUpdate = () => {
      const { circles, points } = toFeatures(positioned);
      const circleSource = map.getSource(UNCERTAINTY_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      circleSource?.setData({ type: "FeatureCollection", features: circles });
      const pointSource = map.getSource(POINTS_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      pointSource?.setData({ type: "FeatureCollection", features: points });
    };
    // Always run this, even when positioned is empty (e.g. a date range
    // with no matching records) - otherwise the sources never get told to
    // clear, and whatever was drawn before (like the default live flight's
    // dots) stays stuck on the map looking like the filter did nothing.
    if (map.getSource(POINTS_SOURCE_ID)) applyUpdate();

    if (positioned.length === 0) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (reviewMode) {
      // Reviewing a picked date range, not "where is it right now" - no
      // pulsing live marker, and frame the whole selection.
      markerRef.current?.remove();
      markerRef.current = null;
      const bounds = positioned.reduce(
        (b, r) => b.extend([r.longitude as number, r.latitude as number]),
        new mapboxgl.LngLatBounds(
          [positioned[0].longitude as number, positioned[0].latitude as number],
          [positioned[0].longitude as number, positioned[0].latitude as number],
        ),
      );
      map.fitBounds(bounds, { padding: 60, duration: 800 });
      return;
    }

    const lngLat: [number, number] = [latest.longitude as number, latest.latitude as number];
    if (!markerRef.current) {
      const el = document.createElement("div");
      el.className = "h-3 w-3 rounded-full bg-blue-400 ring-2 ring-blue-400/60 animate-pulse";
      markerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
      map.jumpTo({ center: lngLat, zoom: 11 });
    } else {
      markerRef.current.setLngLat(lngLat);
      map.easeTo({ center: lngLat, duration: 800 });
    }
  }, [positioned, latest, reviewMode]);

  // Reset step-through playback whenever a new range is applied or review
  // mode is toggled off.
  useEffect(() => {
    setPlayIndex(0);
    setIsPlaying(false);
  }, [reviewMode, positioned]);

  // Auto-advance while playing; stops itself at the last fix.
  useEffect(() => {
    if (!isPlaying) return;
    if (playIndex >= positioned.length - 1) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(() => setPlayIndex((i) => i + 1), 900);
    return () => clearTimeout(timer);
  }, [isPlaying, playIndex, positioned.length]);

  // Moves the amber "current step" marker and pans to it as playback advances.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !reviewMode || positioned.length === 0) {
      playMarkerRef.current?.remove();
      playMarkerRef.current = null;
      return;
    }
    const point = positioned[Math.min(playIndex, positioned.length - 1)];
    const lngLat: [number, number] = [point.longitude as number, point.latitude as number];
    if (!playMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "h-4 w-4 rounded-full bg-amber-400 ring-2 ring-white shadow-md";
      playMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
    } else {
      playMarkerRef.current.setLngLat(lngLat);
    }
    map.easeTo({ center: lngLat, duration: 500 });
  }, [playIndex, reviewMode, positioned]);

  // Flies to and highlights a record selected from outside the map (e.g. a
  // click in the telemetry feed table).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    const { latitude, longitude } = focus.record;
    if (typeof latitude !== "number" || typeof longitude !== "number") return;
    const lngLat: [number, number] = [longitude, latitude];
    if (!focusMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "h-4 w-4 rounded-full ring-2 ring-white shadow-md";
      el.style.backgroundColor = FOCUS_COLOR;
      focusMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
    } else {
      focusMarkerRef.current.setLngLat(lngLat);
    }
    map.easeTo({ center: lngLat, zoom: Math.max(map.getZoom(), 13), duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  if (!config.mapboxToken) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-900">
        Set VITE_MAPBOX_TOKEN to enable the live map.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {reviewMode && positioned.length > 1 && (
        <div className="absolute bottom-11 left-1/2 z-10 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-lg border border-zinc-300 bg-white/90 px-2 py-1.5 text-[11px] text-zinc-700 shadow-sm backdrop-blur sm:bottom-14 sm:gap-2 sm:px-3 sm:py-2 sm:text-xs dark:border-zinc-800 dark:bg-zinc-950/90 dark:text-zinc-300 dark:shadow-none">
          <button
            onClick={() => {
              setIsPlaying(false);
              setPlayIndex(0);
            }}
            aria-label="Jump to first fix"
            className="hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <SkipBack size={14} />
          </button>
          <button
            onClick={() => {
              setIsPlaying(false);
              setPlayIndex((i) => Math.max(0, i - 1));
            }}
            aria-label="Previous fix"
            className="hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => {
              if (!isPlaying && playIndex >= positioned.length - 1) setPlayIndex(0);
              setIsPlaying((p) => !p);
            }}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="rounded bg-zinc-900 p-1 text-white dark:bg-white dark:text-zinc-900"
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={() => {
              setIsPlaying(false);
              setPlayIndex((i) => Math.min(positioned.length - 1, i + 1));
            }}
            aria-label="Next fix"
            className="hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <ChevronRight size={14} />
          </button>
          <button
            onClick={() => {
              setIsPlaying(false);
              setPlayIndex(positioned.length - 1);
            }}
            aria-label="Jump to last fix"
            className="hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <SkipForward size={14} />
          </button>
          <input
            type="range"
            min={0}
            max={positioned.length - 1}
            value={playIndex}
            onChange={(e) => {
              setIsPlaying(false);
              setPlayIndex(Number(e.target.value));
            }}
            className="w-14 accent-amber-400 sm:w-28"
            aria-label="Scrub through fixes"
          />
          <span className="tabular-nums whitespace-nowrap opacity-70">
            {playIndex + 1}/{positioned.length}
          </span>
          <span className="hidden whitespace-nowrap opacity-70 sm:inline">
            {positioned[playIndex]?.transmit_time ?? "—"}
          </span>
        </div>
      )}
      <button
        onClick={() => setBasemap((m) => (m === "satellite" ? "flat" : "satellite"))}
        className="absolute right-4 bottom-16 z-10 flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white/90 px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950/90 dark:text-zinc-300 dark:shadow-none dark:hover:text-zinc-100"
      >
        {basemap === "satellite" ? (
          <>
            <Layers size={14} /> Map
          </>
        ) : (
          <>
            <Satellite size={14} /> Satellite
          </>
        )}
      </button>
    </div>
  );
}
