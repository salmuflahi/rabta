// Ambient type for the Tailwind config module. `tailwind.config.js` is
// deliberately plain JS (Tailwind loads it directly, and converting it to
// TypeScript risks breaking that load path), so it ships no types of its
// own. This declares just the shape the theme tests actually read out of
// `theme.extend` — narrow on purpose, not a full Tailwind config type.
declare module "*/tailwind.config.js" {
  interface TailwindConfig {
    theme: {
      extend: {
        boxShadow: Record<string, string>;
        fontSize: Record<string, [string, { lineHeight: string; letterSpacing?: string }]>;
        fontFamily: {
          sans: string[];
          mono: string[];
        };
        fontWeight: Record<string, string>;
      };
    };
  }

  const config: TailwindConfig;
  export default config;
}
