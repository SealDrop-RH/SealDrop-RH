"use client";

import {useSyncExternalStore} from "react";

/**
 * Whether the viewer has asked for less motion.
 *
 * Includes a dev override so the reduced-motion path can be reviewed without going into
 * macOS System Settings, which is the reason that path usually ships untested.
 */

const QUERY = "(prefers-reduced-motion: reduce)";
const OVERRIDE_KEY = "pons-lock-force-reduced-motion";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  window.addEventListener("pons-lock:reduced-motion-change", onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("pons-lock:reduced-motion-change", onChange);
  };
}

function getSnapshot(): boolean {
  try {
    if (window.sessionStorage.getItem(OVERRIDE_KEY) === "1") return true;
  } catch {
    // Storage refused. The media query alone is still a correct answer.
  }
  return window.matchMedia(QUERY).matches;
}

/** The server cannot know, and guessing "reduce" would ship a static page to everyone. */
function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setReducedMotionOverride(on: boolean): void {
  try {
    if (on) window.sessionStorage.setItem(OVERRIDE_KEY, "1");
    else window.sessionStorage.removeItem(OVERRIDE_KEY);
    window.dispatchEvent(new CustomEvent("pons-lock:reduced-motion-change"));
  } catch {
    // Nothing to do.
  }
}

export function readReducedMotionOverride(): boolean {
  try {
    return window.sessionStorage.getItem(OVERRIDE_KEY) === "1";
  } catch {
    return false;
  }
}
