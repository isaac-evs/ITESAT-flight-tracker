import type { TelemetryRecord } from "../types";

const HEADERS = [
  "flight_id",
  "momsn",
  "transmit_time",
  "timestamp",
  "latitude",
  "longitude",
  "cep",
  "session_status",
  "temperature_c",
  "humidity_pct",
  "pressure_hpa",
  "decoded_text",
] as const;

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function recordsToCsv(records: TelemetryRecord[]): string {
  const rows = records.map((r) => HEADERS.map((h) => csvCell(r[h])).join(","));
  return [HEADERS.join(","), ...rows].join("\n");
}

export function downloadRecordsAsCsv(records: TelemetryRecord[], filename: string): void {
  const blob = new Blob([recordsToCsv(records)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
