#!/usr/bin/env node
/**
 * Downloads the TTFs the share image needs into public/fonts.
 *
 * next/font self-hosts woff2, and satori cannot read woff2: it takes ttf, otf or woff. So
 * the share image needs its own copies, which is why public/fonts exists alongside the
 * next/font setup rather than instead of it.
 *
 * The files are committed once fetched, so a build never depends on a network round trip.
 * Run with --force to refresh them.
 *
 * Source is Vercel's own geist-font repository. Google Fonts can also serve TrueType, but
 * only to a user agent old enough to be offered it: the modern endpoint returns woff2 and
 * the legacy one returns EOT, neither of which satori can parse. Relying on that would be
 * relying on a browser-sniffing quirk staying put.
 */
import {mkdirSync, writeFileSync, existsSync} from "node:fs";

const BASE = "https://raw.githubusercontent.com/vercel/geist-font/main/packages/next/dist/fonts";
const outDir = new URL("../public/fonts/", import.meta.url).pathname;
mkdirSync(outDir, {recursive: true});

const WANTED = [
  {file: "Geist-Regular.ttf", from: `${BASE}/geist-sans/Geist-Regular.ttf`},
  {file: "Geist-Medium.ttf", from: `${BASE}/geist-sans/Geist-Medium.ttf`},
  {file: "Geist-SemiBold.ttf", from: `${BASE}/geist-sans/Geist-SemiBold.ttf`},
  {file: "GeistMono-Regular.ttf", from: `${BASE}/geist-mono/GeistMono-Regular.ttf`},
  {file: "GeistMono-Medium.ttf", from: `${BASE}/geist-mono/GeistMono-Medium.ttf`},
];

const force = process.argv.includes("--force");

for (const {file, from} of WANTED) {
  const target = `${outDir}${file}`;
  if (existsSync(target) && !force) {
    console.log(`${file} already present`);
    continue;
  }

  const response = await fetch(from);
  if (!response.ok) throw new Error(`${file}: ${response.status} from ${from}`);
  const bytes = Buffer.from(await response.arrayBuffer());

  // A TTF starts with 0x00010000 and an OTF with "OTTO". Anything else means the endpoint
  // handed back a format satori cannot parse, and failing here beats failing at render time
  // with an unreadable error about font tables.
  const magic = bytes.readUInt32BE(0);
  if (magic !== 0x00010000 && magic !== 0x4f54544f) {
    throw new Error(`${file} is not a TTF or OTF (magic 0x${magic.toString(16)})`);
  }

  writeFileSync(target, bytes);
  console.log(`${file}  ${(bytes.length / 1024).toFixed(0)} KB`);
}
