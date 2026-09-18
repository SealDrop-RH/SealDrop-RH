import {readFile} from "node:fs/promises";
import {join} from "node:path";

/**
 * The share image's fonts.
 *
 * Memoised, because the route can be hit repeatedly and reading half a megabyte of TTF per
 * request would dominate the render. The promise itself is cached rather than the result,
 * so concurrent requests share one read instead of racing.
 */

export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 600;
  style: "normal";
}

const FILES: Array<{file: string; name: string; weight: 400 | 500 | 600}> = [
  {file: "Geist-Regular.ttf", name: "Geist", weight: 400},
  {file: "Geist-Medium.ttf", name: "Geist", weight: 500},
  {file: "Geist-SemiBold.ttf", name: "Geist", weight: 600},
  {file: "GeistMono-Regular.ttf", name: "Geist Mono", weight: 400},
  {file: "GeistMono-Medium.ttf", name: "Geist Mono", weight: 500},
];

let cached: Promise<OgFont[]> | null = null;

async function load(): Promise<OgFont[]> {
  const dir = join(process.cwd(), "public", "fonts");
  const fonts: OgFont[] = [];

  for (const {file, name, weight} of FILES) {
    try {
      const buffer = await readFile(join(dir, file));
      fonts.push({
        name,
        // The slice is not decoration. readFile returns a Buffer, which is a view into a
        // larger pooled ArrayBuffer, so handing satori `buffer.buffer` gives it the whole
        // pool and it misreads the font tables. This hands over exactly these bytes.
        data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
        weight,
        style: "normal",
      });
    } catch {
      // A missing weight degrades the card to the weights that did load. A share link that
      // renders in the wrong weight is a much smaller problem than one that 500s.
    }
  }

  return fonts;
}

export function ogFonts(): Promise<OgFont[]> {
  cached ??= load();
  return cached;
}
