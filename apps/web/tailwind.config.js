/**
 * Tailwind configuration.
 *
 * Design tokens come from PRD §19.1 and are cross-checked against the founder's HTML prototype.
 * Tokens are defined ONCE here — no component hardcodes a hex value.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],

  theme: {
    extend: {
      colors: {
        brand: {
          // Primary action colour. PRD §19.1.
          // Contrast note: ~4.7:1 on white — passes AA for normal text, fails AAA. Verify
          // before using as text rather than assuming (03_TRD.md §12).
          blue: '#0671E0',
          // Primary text.
          dark: '#0A0A0B',
          light: '#f8fafc',
          gray: '#334155',
        },
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },

  plugins: [],
};
