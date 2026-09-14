import { useCallback, useState } from "react";
import { DateRangeFilter } from "./components/DateRangeFilter";
import { Header } from "./components/Header";
import { MapView, type FocusRequest } from "./components/MapView";
import { TelemetryDrawer } from "./components/TelemetryDrawer";
import { useLiveTelemetry } from "./hooks/useLiveTelemetry";
import { useTelemetryHistory, type DateRange } from "./hooks/useTelemetryHistory";
import { useTheme } from "./hooks/useTheme";
import type { TelemetryRecord } from "./types";

function mergeRecord(records: TelemetryRecord[], record: TelemetryRecord): TelemetryRecord[] {
  const withoutDuplicate = records.filter(
    (r) => !(r.flight_id === record.flight_id && r.momsn === record.momsn),
  );
  return [...withoutDuplicate, record].sort((a, b) => a.timestamp - b.timestamp);
}

export default function App() {
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const history = useTelemetryHistory(dateRange);
  const [liveRecords, setLiveRecords] = useState<TelemetryRecord[]>([]);
  const [theme, toggleTheme] = useTheme();
  const [focus, setFocus] = useState<FocusRequest | null>(null);

  const onRecord = useCallback((record: TelemetryRecord) => {
    setLiveRecords((prev) => mergeRecord(prev, record));
  }, []);
  useLiveTelemetry(onRecord);

  // A selected date range is a historical review of one manually-picked
  // test flight - don't blend in whatever's arriving live right now.
  const records = dateRange ? history.records : liveRecords.reduce(mergeRecord, history.records);

  const selectRecord = useCallback((record: TelemetryRecord) => {
    setFocus((prev) => ({ record, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-white dark:bg-zinc-950">
      <Header theme={theme} onToggleTheme={toggleTheme} />

      <main className="relative flex-1 overflow-hidden">
        <MapView records={records} theme={theme} reviewMode={!!dateRange} focus={focus} />

        <div className="pointer-events-none absolute top-4 left-4 z-10">
          <div className="pointer-events-auto">
            <DateRangeFilter range={dateRange} onChange={setDateRange} />
          </div>
        </div>

        {history.error && (
          <div className="absolute top-4 right-4 left-4 z-10 rounded-lg border border-red-300 bg-red-50/90 px-3 py-2 text-sm text-red-700 backdrop-blur sm:left-auto sm:w-80 dark:border-red-900/50 dark:bg-red-950/80 dark:text-red-300">
            {history.error}
          </div>
        )}

        {dateRange && !history.loading && !history.error && records.length === 0 && (
          <div className="pointer-events-none absolute top-16 left-4 z-10 rounded-lg border border-zinc-300 bg-white/90 px-3 py-1.5 text-xs text-zinc-600 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 dark:text-zinc-400">
            No telemetry found in this date range.
          </div>
        )}

        <TelemetryDrawer records={records} onSelectRecord={selectRecord} />
      </main>
    </div>
  );
}
