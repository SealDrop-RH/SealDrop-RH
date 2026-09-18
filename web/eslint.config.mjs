import {defineConfig, globalIgnores} from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Stock Tailwind palette families. `--color-*: initial` in globals.css already makes these
 * compile to nothing, so this rule is about catching them in review rather than at runtime.
 */
const PALETTE =
  "white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|" +
  "teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const PROPS =
  "bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|shadow|divide|placeholder|caret|accent";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    // lib/skins.ts and the OG renderer are the one sanctioned exception: satori cannot
    // resolve CSS custom properties, so the share card must carry literal hex.
    // test/tokens.test.ts asserts lib/skins.ts never drifts from globals.css.
    ignores: ["lib/skins.ts", "lib/og/**", "app/api/og/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
          message: "Color literal. Use a token from globals.css.",
        },
        {
          selector: "Literal[value=/\\b(rgb|rgba|hsl|hsla|oklch|oklab|color-mix)\\(/]",
          message: "Color literal. Use a token from globals.css.",
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]",
          message: "Color literal in a template. Use a token from globals.css.",
        },
        {
          selector: `Literal[value=/\\b(${PROPS})-\\[#/]`,
          message: "Arbitrary color utility. Use a token from globals.css.",
        },
        {
          selector: `Literal[value=/\\b(${PROPS})-(${PALETTE})\\b/]`,
          message: "Stock Tailwind color. Use a token from globals.css.",
        },
        {
          selector: "CallExpression[callee.object.name='window'][callee.property.name='addEventListener'][arguments.0.value='scroll']",
          message: "No scroll listeners. Use IntersectionObserver or Motion's useScroll.",
        },
      ],
    },
  },
]);
