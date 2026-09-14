import { useEffect, useState } from "react";
import { config } from "../lib/config";
import type { TelemetryRecord } from "../types";

export interface DateRange {
  start: number; // inclusive, unix seconds
  end: number; // inclusive, unix seconds
}

interface TelemetryHistoryState {
  flightId: string | null;
  records: TelemetryRecord[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches telemetry history. With no range, this polls for the live flight's
 * records every `pollIntervalMs`. With a range, it fetches once (no
 * polling) across every flight_id whose records fall in that window -
 * for reviewing one manually-picked test flight independent of which
 * physical flight_id it landed under.
 */
export function useTelemetryHistory(range: DateRange | null, pollIntervalMs = 15000): TelemetryHistoryState {
  const [state, setState] = useState<TelemetryHistoryState>({
    flightId: null,
    records: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
      try {
        const url = range
          ? `${config.apiBaseUrl}/telemetry?start=${range.start}&end=${range.end}&limit=1000`
          : `${config.apiBaseUrl}/telemetry`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const body = await res.json();
        if (!cancelled) {
          setState({
            flightId: body.flight_id,
            records: body.records ?? [],
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load telemetry",
          }));
        }
      }
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchHistory();
    if (range) {
      return () => {
        cancelled = true;
      };
    }
    const interval = setInterval(fetchHistory, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [range, pollIntervalMs]);

  return state;
}
