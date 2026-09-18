#!/usr/bin/env node
/**
 * No em-dashes, anywhere in the source.
 *
 * The rule is about user-visible copy, but it is enforced across the whole source rather
 * than only inside JSX text, because deciding which string literal eventually reaches a
 * screen is not something a regex can do. Comments are stripped first, so this is about
 * what ships, and the whole-file rule costs nothing: a hyphen is always available.
 */
import {readdirSync, readFileSync, statSync, existsSync} from "node:fs";
import {join, relative, extname} from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIRS = ["app", "components", "lib"];
const DASHES = /[—–]/;

let failures = 0;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

for (const dir of DIRS) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) continue;
  for (const file of walk(abs)) {
    if (![".ts", ".tsx", ".css", ".md"].includes(extname(file))) continue;
    const source = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    source.split("\n").forEach((line, i) => {
      if (DASHES.test(line)) {
        console.error(`  ${relative(ROOT, file)}:${i + 1}  em-dash or en-dash: ${line.trim().slice(0, 90)}`);
        failures += 1;
      }
    });
  }
}

if (failures > 0) {
  console.error(`\ncheck-copy: ${failures} dash${failures === 1 ? "" : "es"} to replace with a hyphen.`);
  process.exit(1);
}
console.log("check-copy: clean.");
