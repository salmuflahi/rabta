import { RABTA_BRAND } from "./brand.js";
import type { CSSProperties } from "react";

export const EASINGS = {
  studio: "cubic-bezier(0.22, 1, 0.36, 1)",
  smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  precise: "cubic-bezier(0.76, 0, 0.24, 1)",
  linear: "linear",
} as const;

export type StudioConfig = {
  accent: string;
  background: string;
  radius: number;
  duration: number;
  intensity: number;
  scale: number;
  stroke: number;
  iconSize: number;
  easing: keyof typeof EASINGS;
  font: "display" | "body" | "mono";
  label: string;
  subtext: string;
  motion: boolean;
  glow: boolean;
  texture: boolean;
  icon: string;
  speed: number;
  detail: number;
  seed: number;
  distortion: number;
  renderMode: "auto" | "static";
};
export const DEFAULT_CONFIG: StudioConfig = {
  accent: RABTA_BRAND.dark.signal,
  background: RABTA_BRAND.dark.canvas,
  radius: 20,
  duration: 800,
  intensity: 55,
  scale: 100,
  stroke: 1.5,
  iconSize: 72,
  easing: "studio",
  font: "display",
  label: "Your place, kept.",
  subtext: "A little less starting over.",
  motion: true,
  glow: true,
  texture: true,
  icon: "capsule",
  speed: 0.45,
  detail: 1.4,
  seed: 42,
  distortion: 55,
  renderMode: "auto",
};
export const COLOR_PRESETS = [
  { name: "Forest", accent: "#b9cfaa", background: "#101b14" },
  { name: "Glacier", accent: "#a5c9de", background: "#111a24" },
  { name: "Ember", accent: "#e3af8c", background: "#211914" },
  { name: "Mono", accent: "#d7d7d0", background: "#171717" },
] as const;

export const isHex = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const bound = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, v))
    : fallback;
export function normalizeConfig(value: unknown): StudioConfig {
  const v =
    typeof value === "object" && value !== null
      ? (value as Partial<StudioConfig>)
      : {};
  return {
    accent: isHex(v.accent) ? v.accent : DEFAULT_CONFIG.accent,
    background: isHex(v.background) ? v.background : DEFAULT_CONFIG.background,
    radius: bound(v.radius, 0, 40, 20),
    duration: bound(v.duration, 150, 2400, 800),
    intensity: bound(v.intensity, 0, 100, 55),
    scale: bound(v.scale, 60, 145, 100),
    stroke: bound(v.stroke, 0.75, 3, 1.5),
    iconSize: bound(v.iconSize, 24, 128, 72),
    easing: v.easing && Object.hasOwn(EASINGS, v.easing) ? v.easing : "studio",
    font:
      v.font && ["display", "body", "mono"].includes(v.font)
        ? v.font
        : "display",
    label:
      typeof v.label === "string" ? v.label.slice(0, 90) : DEFAULT_CONFIG.label,
    subtext:
      typeof v.subtext === "string"
        ? v.subtext.slice(0, 160)
        : DEFAULT_CONFIG.subtext,
    motion: typeof v.motion === "boolean" ? v.motion : true,
    glow: typeof v.glow === "boolean" ? v.glow : true,
    texture: typeof v.texture === "boolean" ? v.texture : true,
    renderMode: v.renderMode === "static" ? "static" : "auto",
    speed: bound(v.speed, 0, 2, 0.45),
    detail: bound(v.detail, 0.5, 3, 1.4),
    seed: Math.round(bound(v.seed, 3, 92, 42)),
    distortion: bound(v.distortion, 0, 100, 55),
    icon: typeof v.icon === "string" ? v.icon.slice(0, 30) : "capsule",
  };
}
export function isLight(hex: string) {
  if (!isHex(hex)) return false;
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179;
}
export function configStyle(input: Partial<StudioConfig> = {}): CSSProperties {
  const c = normalizeConfig({ ...DEFAULT_CONFIG, ...input });
  const light = isLight(c.background);
  return {
    "--r-accent": c.accent,
    "--r-bg": c.background,
    "--r-fg": light ? "#172018" : "#f0f2ec",
    "--r-muted": light ? "#526155" : "#a3afa1",
    "--r-line": light ? "#17201826" : "#e0edcf29",
    "--r-on-accent": isLight(c.accent) ? "#000000" : "#ffffff",
    "--r-radius": `${c.radius}px`,
    "--r-duration": `${c.duration}ms`,
    "--r-ease": EASINGS[c.easing],
    "--r-intensity": c.intensity / 100,
    "--r-scale": c.scale / 100,
    "--r-stroke": c.stroke,
    "--r-font":
      c.font === "mono"
        ? "var(--r-font-mono)"
        : c.font === "body"
          ? "var(--r-font-body)"
          : "var(--r-font-display)",
    "--r-glow": c.glow ? 0.28 : 0,
    "--r-texture": c.texture ? 0.035 : 0,
  } as CSSProperties;
}
