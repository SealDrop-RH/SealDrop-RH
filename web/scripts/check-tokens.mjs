#!/usr/bin/env node
/**
 * The two token checks ESLint cannot make.
 *
 * 1. Color literals in files ESLint does not parse: .css, and inline SVG attributes.
 * 2. The Tailwind v4 self-reference trap, checked in the BUILT css rather than the source.
 *    `@theme inline { --radius-sm: var(--radius-sm) }` compiles to a declaration that
 *    refers to itself. It is live in pons-board's shipped CSS today and only survives
 *    there because the authored :root block happens to be unlayered. Nothing in the
 *    source looks wrong, so this has to be checked in the output.
 */
import {readdirSync, readFileSync, statSync, existsSync} from "node:fs";
import {join, relative, extname} from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SOURCE_DIRS = ["app", "components", "lib"];
/** The one sanctioned exception: satori cannot resolve CSS custom properties. */
const ALLOWED = ["app/globals.css", "lib/skins.ts", "lib/og", "app/api/og"];

const HEX = /#[0-9a-fA-F]{3,8}\b/;

/**
 * Matches a colour function only when its first argument is written out, not interpolated.
 *
 * `rgb(255 98 0)` is a literal and is banned. `rgb(${r} ${g} ${b})` is a serialiser for a
 * value that came from somewhere else, which is exactly what lib/strip/palette.ts does with
 * the tokens it resolves off a live element: the canvas needs a string, and building one is
 * not the same as choosing a colour.
 */
const FUNCTIONAL = /\b(?:rgba?|hsla?|oklch|oklab|color-mix)\(\s*(?!\$\{)/;

let failures = 0;
const fail = (message) => {
  console.error(`  ${message}`);
  failures += 1;
};

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/* ---- 1. color literals outside the allowed files ---- */
console.log("check-tokens: scanning for color literals outside globals.css");
for (const dir of SOURCE_DIRS) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const rel = relative(ROOT, file);
    if (ALLOWED.some((a) => rel === a || rel.startsWith(`${a}/`))) continue;
    if (![".css", ".ts", ".tsx", ".svg"].includes(extname(file))) continue;

    // Strip comments so a comment explaining a token is not itself a violation.
    const source = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    source.split("\n").forEach((line, i) => {
      if (HEX.test(line) || FUNCTIONAL.test(line)) {
        fail(`${rel}:${i + 1}  color literal: ${line.trim().slice(0, 90)}`);
      }
    });
  }
}

/* ---- 2. the self-reference trap, in the built output ---- */
const cssDir = join(ROOT, ".next/static/css");
if (!existsSync(cssDir)) {
  console.log("check-tokens: no .next/static/css, skipping the built-CSS check.");
  console.log("             run `pnpm build` first to check for the self-reference trap.");
} else {
  console.log("check-tokens: scanning built CSS for self-referencing custom properties");
  const SELF_REF = /--([a-z0-9-]+)\s*:\s*var\(\s*--\1\s*[,)]/g;
  for (const file of walk(cssDir).filter((f) => f.endsWith(".css"))) {
    const css = readFileSync(file, "utf8");
    for (const match of css.matchAll(SELF_REF)) {
      fail(`${relative(ROOT, file)}  --${match[1]} refers to itself (Tailwind @theme trap)`);
    }
  }
}

if (failures > 0) {
  console.error(`\ncheck-tokens: ${failures} problem${failures === 1 ? "" : "s"}.`);
  process.exit(1);
}
console.log("check-tokens: clean.");
