import type {MetadataRoute} from "next";
import {SKIN} from "@/lib/skins";

/**
 * The web app manifest.
 *
 * Colours come from lib/skins.ts for the same reason layout.tsx takes its themeColor from
 * there: the browser paints the splash and the address bar from these before a line of CSS
 * is parsed, so they have to be literal values, and lib/skins.ts is the one file allowed to
 * hold them. test/tokens.test.ts keeps it equal to globals.css.
 *
 * Icons are the rendered tile rather than the flat mark in the chrome. On a home screen the
 * product is an icon and nothing else, so it gets the full mark on its own accent ground.
 *
 * Only `any` is declared, deliberately. A maskable icon is cropped to a circle 80% of the
 * icon's width, and the mark here sits in a box 72% wide, so the corners of the shackle and
 * the outermost square would clip. Shipping an untested maskable purpose costs a bitten-off
 * logo on Android and nothing gained.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SealDrop",
    short_name: "SealDrop",
    description: "Lock token supply on Robinhood Chain and get a proof anyone can check.",
    start_url: "/",
    display: "standalone",
    background_color: SKIN.bg,
    theme_color: SKIN.bg,
    icons: [
      {src: "/brand/sealdrop-tile-192.png", sizes: "192x192", type: "image/png", purpose: "any"},
      {src: "/brand/sealdrop-tile-512.png", sizes: "512x512", type: "image/png", purpose: "any"},
    ],
  };
}
