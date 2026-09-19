"use client";

import { useEffect, useRef } from "react";
import type { TraceEvent as TraceEventT } from "@/lib/types";
import { TraceEvent } from "./TraceEvent";

export function TracePanel({ events }: { events: TraceEventT[] }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  return (
    <section className="panel trace-panel">
      <h2 className="panel-title">Live trace</h2>
      <div className="trace-list" ref={listRef}>
        {events.length === 0 ? (
          <p className="trace-empty">Run an agent to see its trace here.</p>
        ) : (
          events.map((event) => <TraceEvent key={event.id} event={event} />)
        )}
      </div>
    </section>
  );
}
