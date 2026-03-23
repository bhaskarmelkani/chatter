import { useCallback, useEffect, useRef, useState } from "react";
import type { SSEEvent } from "../types";

const SSE_URL = "/api/events";
const RECONNECT_DELAY_MS = 3000;

interface UseSSEResult {
  connected: boolean;
  events: SSEEvent[];
  lastEvent: SSEEvent | null;
}

export function useSSE(maxEvents = 200): UseSSEResult {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource(SSE_URL);
    esRef.current = es;

    const appendEvent = (event: SSEEvent) => {
      setLastEvent(event);
      setEvents((prev) => {
        const next = [event, ...prev];
        return next.length > maxEvents ? next.slice(0, maxEvents) : next;
      });
    };

    const handlePayload = (raw: MessageEvent<string>, explicitType?: string) => {
      try {
        const parsed = JSON.parse(raw.data) as unknown;
        const normalized: SSEEvent =
          parsed && typeof parsed === "object" && "type" in parsed && "timestamp" in parsed
            ? (parsed as SSEEvent)
            : {
                type: explicitType ?? "message",
                data: parsed,
                timestamp: new Date().toISOString(),
              };
        appendEvent(normalized);
      } catch {
        // Ignore unparseable events
      }
    };

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (ev) => {
      handlePayload(ev, "message");
    };

    // The daemon currently emits named events, so we subscribe to the high-level
    // channels we expect and gracefully fall back to polling-driven freshness if
    // no structured event arrives.
    ["session", "session_update", "provider_update", "limit_update", "insight", "dashboard", "ingest", "scheduler"].forEach(
      (eventName) => {
        es.addEventListener(eventName, (event) => {
          handlePayload(event as MessageEvent<string>, eventName);
        });
      },
    );

    es.onerror = () => {
      setConnected(false);
      es.close();
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };
  }, [maxEvents]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };
  }, [connect]);

  return { connected, events, lastEvent };
}
