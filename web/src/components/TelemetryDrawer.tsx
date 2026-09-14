import { ChevronUp, ChevronDown, Download } from "lucide-react";
import { useState } from "react";
import { downloadRecordsAsCsv } from "../lib/csv";
import { TelemetryTable } from "./TelemetryTable";
import type { TelemetryRecord } from "../types";

export function TelemetryDrawer({
  records,
  onSelectRecord,
}: {
  records: TelemetryRecord[];
  onSelectRecord?: (record: TelemetryRecord) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute right-0 bottom-0 left-0 z-10">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-1.5 border-t border-zinc-300 bg-white/90 py-1.5 text-xs font-medium text-zinc-600 backdrop-blur hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950/90 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        Telemetry feed ({records.length})
      </button>
      {open && (
        <div className="max-h-64 overflow-hidden border-t border-zinc-300 bg-white/95 p-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Click a row to locate it on the map
            </span>
            <button
              onClick={() =>
                downloadRecordsAsCsv(records, `telemetry-${new Date().toISOString().slice(0, 19)}.csv`)
              }
              disabled={records.length === 0}
              className="flex items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <Download size={12} /> Export CSV
            </button>
          </div>
          <TelemetryTable records={records} onSelectRecord={onSelectRecord} />
        </div>
      )}
    </div>
  );
}
