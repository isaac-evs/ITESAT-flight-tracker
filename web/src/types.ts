export interface TelemetryRecord {
  flight_id: string;
  timestamp: number;
  momsn?: number;
  transmit_time?: string;
  latitude?: number;
  longitude?: number;
  cep?: number;
  session_status?: number;
  data_hex?: string;
  decoded_text?: string;
  temperature_c?: number;
  humidity_pct?: number;
  pressure_hpa?: number;
}

export type ConnectionStatus = "connecting" | "live" | "offline";
