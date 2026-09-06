/**
 * Tailwind configuration.
 *
 * Design tokens come from PRD §19.1 and are cross-checked against the founder's HTML prototype.
 * Tokens are defined ONCE here — no component hardcodes a hex value.
 *
 * ── Dark theme: a palette swap, not a second set of classes ───────────────────────────────────
 *
 * Every colour a component uses (`bg-white`, `text-gray-600`, `border-gray-200`, `bg-blue-50`…)
 * resolves to a CSS variable declared in `styles/index.css`, once for `:root` and once for `.dark`.
 * Switching theme therefore changes the VALUES behind ~1,400 existing class usages instead of
 * requiring a `dark:` twin on each of them — which, at that count, would never stay in sync.
 *
 * The variables hold `R G B` triplets so Tailwind's opacity modifiers (`bg-white/95`,
 * `bg-brand-blue/20`) keep working through `<alpha-value>`.
 *
 * Two tokens are deliberately split by ROLE, because one name serves two opposite jobs:
 *
 *   · `white`      as a background/border/ring it is the card SURFACE and flips dark; as TEXT it
 *                  is the ink on a brand-blue button and must stay white.
 *   · `brand.dark` as TEXT it is the primary ink and flips light; as a background it is the dark
 *                  band or button and stays dark.
 *
 * Tailwind resolves `textColor` separately from `colors`, so `extend.textColor` overrides those
 * two for text utilities only. `black` is not remapped: it is used for video and photo backdrops,
 * which are black in either theme.
 *
 * @type {import('tailwindcss').Config}
 */

/** `rgb(var(--name) / <alpha-value>)`, the shape Tailwind needs for opacity modifiers. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** A shade scale mapped onto variables `--<family>-<shade>`. */
const scale = (family, shades) =>
  Object.fromEntries(shades.map((shade) => [shade, v(`${family}-${shade}`)]));

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],

  darkMode: 'class',

  theme: {
    extend: {
      colors: {
        white: v('white'),
        gray: scale('gray', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        slate: scale('slate', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        blue: scale('blue', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        green: scale('green', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        red: scale('red', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        amber: scale('amber', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),

        brand: {
          // Primary action colour. PRD §19.1 (#0671E0 in light; a touch lighter in dark for
          // contrast against dark surfaces).
          // Contrast note: ~4.7:1 on white — passes AA for normal text, fails AAA. Verify
          // before using as text rather than assuming (03_TRD.md §12).
          blue: v('brand-blue'),
          // Dark surface / band colour. See `textColor` below for the ink role.
          dark: v('brand-dark'),
          light: v('brand-light'),
          gray: v('brand-gray'),
          // Tints a few screens use as `bg-brand-50` / `border-brand-500`.
          50: v('brand-50'),
          500: v('brand-blue'),
        },
      },

      textColor: {
        /* Ink on accent surfaces — white in both themes. */
        white: v('ink-inverse'),
        brand: {
          /* Primary ink — near-black in light, near-white in dark. */
          dark: v('ink'),
        },
      },

      /* `ring-offset-2` paints the gap in this colour; it must be the surface, not #fff. */
      ringOffsetColor: {
        DEFAULT: v('white'),
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },

  plugins: [],
};
