"use client";

import {useCallback, useEffect, useRef, useState} from "react";

export interface Size {
  width: number;
  height: number;
}

/**
 * An element's rendered size, via ResizeObserver.
 *
 * Reports CSS pixels and only sets state when a rounded dimension actually changes, so a
 * sub-pixel reflow during scrolling does not re-render a canvas that is already correct.
 */
export function useMeasure<T extends HTMLElement>(): [(node: T | null) => void, Size] {
  const [size, setSize] = useState<Size>({width: 0, height: 0});
  const observer = useRef<ResizeObserver | null>(null);
  const current = useRef<Size>({width: 0, height: 0});

  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect();
    if (!node) return;

    // Measured once, synchronously, before the observer is attached. ResizeObserver's first
    // callback does not arrive until after a paint, which on a canvas means one frame of
    // empty box on every mount. The element already has a layout box by the time the ref
    // callback runs, so there is no reason to wait for it.
    const initial = node.getBoundingClientRect();
    const first = {width: Math.round(initial.width), height: Math.round(initial.height)};
    if (first.width > 0 && first.height > 0) {
      current.current = first;
      setSize(first);
    }

    observer.current = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const next = {width: Math.round(rect.width), height: Math.round(rect.height)};
      if (next.width === current.current.width && next.height === current.current.height) return;
      current.current = next;
      setSize(next);
    });
    observer.current.observe(node);
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);

  return [ref, size];
}
