import { useEffect, useRef, useCallback } from "react";
import { getWsUrl } from "@/lib/api";

/**
 * Establishes a WebSocket connection with auto-reconnect.
 * Returns a `send` function usable to relay client-side events to peers.
 */
export default function useWebSocket(onEvent) {
  const wsRef = useRef(null);
  const handlerRef = useRef(onEvent);
  const reconnectRef = useRef(null);
  const readyRef = useRef(false);

  useEffect(() => { handlerRef.current = onEvent; }, [onEvent]);

  useEffect(() => {
    let closed = false;

    const connect = () => {
      const url = getWsUrl();
      if (!url) return;
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onopen = () => { readyRef.current = true; };
        ws.onmessage = (ev) => {
          try {
            handlerRef.current?.(JSON.parse(ev.data));
          } catch (e) { /* ignore */ }
        };
        ws.onclose = () => {
          readyRef.current = false;
          if (!closed) reconnectRef.current = setTimeout(connect, 2000);
        };
        ws.onerror = () => { try { ws.close(); } catch (e) {} };
      } catch (e) {
        reconnectRef.current = setTimeout(connect, 2000);
      }
    };
    connect();

    return () => {
      closed = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) { try { wsRef.current.close(); } catch (e) {} }
    };
  }, []);

  const send = useCallback((payload) => {
    if (!readyRef.current || !wsRef.current) return;
    try {
      wsRef.current.send(JSON.stringify(payload));
    } catch (e) { /* ignore */ }
  }, []);

  return { send };
}
