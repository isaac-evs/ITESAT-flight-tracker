import { CalendarRange, X } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "../hooks/useTelemetryHistory";

function dateInputToStartOfDayUtc(value: string): number {
  return Math.floor(new Date(`${value}T00:00:00Z`).getTime() / 1000);
}

function dateInputToEndOfDayUtc(value: string): number {
  return Math.floor(new Date(`${value}T23:59:59Z`).getTime() / 1000);
}

export function DateRangeFilter({
  range,
  onChange,
}: {
  range: DateRange | null;
  onChange: (range: DateRange | null) => void;
}) {
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");

  const canApply = startInput !== "" && endInput !== "" && startInput <= endInput;

  return (
    <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1 rounded-lg border border-zinc-300 bg-white/90 px-2 py-1.5 text-[11px] text-zinc-700 shadow-sm backdrop-blur sm:max-w-none sm:flex-nowrap sm:gap-1.5 sm:px-2.5 sm:text-xs dark:border-zinc-800 dark:bg-zinc-950/90 dark:text-zinc-300 dark:shadow-none">
      <CalendarRange size={14} className="shrink-0 opacity-70" />
      <input
        type="date"
        value={startInput}
        onChange={(e) => setStartInput(e.target.value)}
        className="w-[9.5em] min-w-0 bg-transparent [color-scheme:light] dark:[color-scheme:dark]"
        aria-label="Range start date"
      />
      <span className="opacity-50">–</span>
      <input
        type="date"
        value={endInput}
        onChange={(e) => setEndInput(e.target.value)}
        className="w-[9.5em] min-w-0 bg-transparent [color-scheme:light] dark:[color-scheme:dark]"
        aria-label="Range end date"
      />
      <button
        onClick={() =>
          onChange({
            start: dateInputToStartOfDayUtc(startInput),
            end: dateInputToEndOfDayUtc(endInput),
          })
        }
        disabled={!canApply}
        className="rounded bg-zinc-900 px-2 py-1 font-medium text-white disabled:opacity-30 sm:ml-1 dark:bg-white dark:text-zinc-900"
      >
        Apply
      </button>
      {range && (
        <button
          onClick={() => {
            setStartInput("");
            setEndInput("");
            onChange(null);
          }}
          aria-label="Clear date range filter"
          className="rounded p-1 opacity-70 hover:opacity-100"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
