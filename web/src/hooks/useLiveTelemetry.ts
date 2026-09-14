import mqtt, { type MqttClient } from "mqtt";
import { useEffect, useRef, useState } from "react";
import { config } from "../lib/config";
import { getSignedIotWssUrl } from "../lib/iotSigner";
import type { ConnectionStatus, TelemetryRecord } from "../types";

/**
 * Subscribes directly to AWS IoT Core over MQTT/WSS (guest credentials via
 * Cognito) and invokes `onRecord` for every live-tracking event published
 * by the webhook_parser Lambda.
 */
export function useLiveTelemetry(onRecord: (record: TelemetryRecord) => void): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const onRecordRef = useRef(onRecord);
  onRecordRef.current = onRecord;

  useEffect(() => {
    if (!config.iotEndpoint || !config.cognitoIdentityPoolId) {
      setStatus("offline");
      return;
    }

    let client: MqttClient | null = null;
    let cancelled = false;

    (async () => {
      try {
        const url = await getSignedIotWssUrl();
        if (cancelled) return;

        client = mqtt.connect(url, {
          protocolVersion: 4,
          reconnectPeriod: 4000,
          clientId: `mission-control-${Math.random().toString(16).slice(2)}`,
        });

        client.on("connect", () => {
          setStatus("live");
          client?.subscribe(config.iotTopic, { qos: 0 });
        });

        client.on("reconnect", () => setStatus("connecting"));
        client.on("close", () => setStatus("offline"));
        client.on("error", () => setStatus("offline"));

        client.on("message", (_topic, payload) => {
          try {
            onRecordRef.current(JSON.parse(payload.toString()) as TelemetryRecord);
          } catch {
            // ignore malformed live event
          }
        });
      } catch {
        if (!cancelled) setStatus("offline");
      }
    })();

    return () => {
      cancelled = true;
      client?.end(true);
    };
  }, []);

  return status;
}
