"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Listens to the SSE stream; on any change event, refreshes the current
 * route so server components re-render with fresh data. Refreshes are
 * deferred while a dialog/sheet is open so forms are never yanked away
 * mid-entry.
 */
export function Realtime() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;

    const refresh = () => {
      if (document.querySelector('[role="dialog"][data-state="open"]')) {
        timer.current = setTimeout(refresh, 1500);
        return;
      }
      router.refresh();
    };

    const connect = () => {
      es = new EventSource("/api/events");
      es.onmessage = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(refresh, 250);
      };
      es.onerror = () => {
        es?.close();
        if (!closed) setTimeout(connect, 5000);
      };
    };
    connect();

    return () => {
      closed = true;
      es?.close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  return null;
}
