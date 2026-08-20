"use client";

import { useEffect, useRef } from "react";
import { eventBus, type JarvisEventName, type JarvisEventPayloads } from "@/lib/events/bus";

/** Subscribes a component to one event-bus event for its lifetime. The
 * handler is kept in a ref so callers can pass an inline arrow function
 * without re-subscribing every render. */
export function useEventListener<K extends JarvisEventName>(
  event: K,
  handler: (payload: JarvisEventPayloads[K]) => void
) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    return eventBus.on(event, (payload) => handlerRef.current(payload));
  }, [event]);
}
