import type { CSSProperties, SVGProps } from "react";

/** Original 24 × 24 Rabta geometry. Every export and renderer uses this registry. */
export const ICON_PATHS = {
  database: ["M4 6c0-2 16-2 16 0s-16 2-16 0Z", "M4 6v12c0 3 16 3 16 0V6M4 12c0 3 16 3 16 0"],
  plus: ["M12 4v16M4 12h16"],
  minus: ["M4 12h16"],
  check: ["m5 12 4.5 4.5L19 7"],
  close: ["m6 6 12 12M18 6 6 18"],
  chevrondown: ["m6 9 6 6 6-6"],
  chevronup: ["m6 15 6-6 6 6"],
  chevronleft: ["m15 6-6 6 6 6"],
  chevronright: ["m9 6 6 6-6 6"],
  play: ["m8 4 12 8-12 8V4Z"],
  capture: ["M4 6h5l2-3h5l2 3h3v15H3V6h1Z", "M12 9a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"],
  more: ["M4 11v2M12 11v2M20 11v2"],
  folder: ["M3 6V4h6l3 3h9v13H3V6Z", "M3 10h18"],
  archive: ["M3 3h18v5H3zM5 8v13h14V8M10 12h4"],
  sidebar: ["M3 4h18v16H3zM9 4v16", "m14 9 3 3-3 3"],
  keyboard: ["M2 6h20v13H2zM5 9h1m3 0h1m3 0h1m3 0h2M5 12h1m3 0h1m3 0h1m3 0h2M7 16h10"],
  wifi: ["M3 8a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0M9 16a4 4 0 0 1 6 0M12 20h.01"],
  alert: ["m12 3 10 17H2L12 3Z", "M12 9v5m0 3h.01"],
  checkcircle: ["M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z", "m7 12 3 3 7-7"],
  circle: ["M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z"],
  download: ["M12 3v12m-5-5 5 5 5-5", "M4 16v5h16v-5"],
  upload: ["M12 17V3m-5 5 5-5 5 5", "M4 16v5h16v-5"],
  pin: ["M8 3h8l-1 7 4 4v2H5v-2l4-4-1-7ZM12 16v6"],
  pinoff: ["m3 3 18 18M8 3h8l-1 7 4 4v2h-3M8 11l-3 3v2h7m0 0v6"],
  delete: ["M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"],
  commit: ["M12 2v6m0 8v6M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"],
  rocket: ["M9 15c0-8 7-12 12-12 0 5-4 12-12 12ZM9 15l-3 3M9 9H5l-3 6h7m6 0v4l-6 3v-7M15 7h2v2h-2Z"],
  wrench: ["M14 4a6 6 0 0 0-7 8l-5 5a3 3 0 0 0 5 5l5-5a6 6 0 0 0 8-7l-5 3-4-4 3-5Z"],
  arrowup: ["M12 21V3m-7 7 7-7 7 7"],
  arrowdown: ["M12 3v18m-7-7 7 7 7-7"],
  arrowleft: ["M21 12H3m7-7-7 7 7 7"],
  arrowright: ["M3 12h18m-7-7 7 7-7 7"],
  copy: ["M8 8h13v13H8zM16 4V2H2v14h2"],
  menu: ["M3 6h18M3 12h18M3 18h18"],
  grip: ["M8 4v2m0 5v2m0 5v2M16 4v2m0 5v2m0 5v2"],
  info: ["M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18ZM12 11v6m0-10h.01"],
  moon: ["M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z"],
  sun: ["M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10ZM12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"],
  companion: ["M5 3h14l3 3v12l-3 3H5l-3-3V6l3-3Z", "M7 10h.01M17 10h.01M8 15c2 2 6 2 8 0", "M9 1v4M15 1v4"],
  people: ["M8 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM2 21v-4a6 6 0 0 1 12 0v4", "M16 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 4 5v3"],
  merch: ["m8 3-6 5 4 5 2-2v11h8V11l2 2 4-5-6-5c0 4-8 4-8 0Z"],

  search: ["M10.5 3.5a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z", "m15.5 15.5 5 5", "M7.5 7.5h3M7.5 7.5v3"],
  gyroscope: [
    "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z",
    "M6 6c3-3 12 6 12 9s-3 3-6 0S3 9 6 6Z",
    "M12 1v5M12 18v5M9 12h6M12 9v6",
  ],
  spline: [
    "M3 18c4 0 3-12 9-12s5 12 9 12",
    "M3 18h5M16 18h5M7 6h10",
    "M10 4h4v4h-4zM2 17h2v2H2zM20 17h2v2h-2z",
  ],
  shutterblade: [
    "M7 3h10l5 9-5 9H7l-5-9 5-9Z",
    "M7 3l10 9-10 9M2 12h15M17 3l-3 6M17 21l-3-6",
    "M9 9v6l5-3-5-3Z",
  ],
  ribbon: [
    "M4 3h12l4 5-4 5H8l-4 5h12",
    "M4 3v15l4 4h12V8M4 8h16M8 13v9",
    "M16 13v5l4 4",
  ],
  knot: [
    "M9 5 6 2 2 6l7 7m6-2 7 7-4 4-5-5",
    "M13 9l5-7 4 4-9 13-4 3-7-7 4-4",
    "m6 6 12 12M6 18l4-6m4-5 4-1",
  ],
  signalbranch: [
    "M10 10h4v4h-4zM12 14v8M10 10 6 6m8 4 4-4",
    "M3 8a7 7 0 0 1 5-5M1 5a9 9 0 0 1 4-4M16 3a7 7 0 0 1 5 5m-2-7a9 9 0 0 1 4 4",
    "M8 22h8",
  ],
  orbitpath: [
    "M8 5C1 7 0 13 5 17s16 2 17-4-6-10-10-9",
    "M12 2h4v4h-4zM10 11a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",
    "m3 20 4-3-4-2M15 13l5-3",
  ],
  wireframe: [
    "m12 2 9 5v10l-9 5-9-5V7l9-5Z",
    "M12 2 7 7l-4 10 9 5 5-5 4-10-9-5ZM7 7l10 10M3 7l18 10M7 7h14M3 17h14",
    "M12 2v20",
  ],
  isometric: [
    "m3 10 5-3 5 3-5 3-5-3Zm5 3v8l-5-3v-8m5 11 5-3v-8",
    "m13 4 5-3 4 3-4 3-5-3Zm5 3v9l-5 3V4m5 12 4-3V4",
    "m8 7 5-3M13 10l5-3",
  ],
  loupe: [
    "M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z",
    "m16 16 6 6M6 10h8M10 6v8",
    "M5 7a6 6 0 0 1 4-3",
  ],
  sequencer: [
    "M2 5h20M2 12h20M2 19h20",
    "M5 3h4v4H5zM13 10h4v4h-4zM8 17h4v4H8z",
    "M20 3v18",
  ],
  helix: [
    "M6 2c0 5 12 5 12 10S6 17 6 22",
    "M18 2c0 5-12 5-12 10s12 5 12 10",
    "M7 4h10M8 9h8M6 12h12M8 15h8M7 20h10",
  ],
  iris: [
    "M2 12S6 5 12 5s10 7 10 7-4 7-10 7S2 12 2 12Z",
    "M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10ZM12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",
    "M12 1v2M4 3l2 2m12 0 2-2M12 21v2",
  ],
  focusplane: [
    "m7 5 14-3-4 17-14 3L7 5Z",
    "M12 5v14M5 12h14M1 7V3h4m14 18h4v-4",
    "M10 10h4v4h-4z",
  ],
  fold: [
    "M3 3h12l6 6v12H3V3Z",
    "M15 3v6h6M3 3l12 6L3 21m12-12 6 12",
    "M7 12v4l4-4H7Z",
  ],
  tracepoint: [
    "M2 20c5 0 6-16 11-16h9",
    "M7 10h4v4H7zM3 12h4m4 0h6M9 6v4m0 4v4",
    "M17 2v4M21 2v4M2 17v5",
  ],
  capsule: [
    "M8 3h8l5 5v8l-5 5H8l-5-5V8L8 3Z",
    "m8 8 4-2 4 2v8l-4 2-4-2V8Z",
    "m8 8 4 2 4-2M12 10v8",
  ],
  thread: [
    "M8 4H6a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h12a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-2",
    "m7 1 3 3-3 3M17 17l-3 3 3 3",
    "M8 12h8",
  ],
  restore: ["M4 8a9 9 0 1 1 0 8", "M4 3v5h5", "M12 7v5l4 2"],
  workspace: ["M3 6h18v13H3V6Z", "M3 10h18M8 10v9", "M6 3h12M11 14h6M11 16h4"],
  branch: [
    "M6 3v14a3 3 0 0 0 3 3h2",
    "M6 12h7a5 5 0 0 0 5-5V3",
    "M4 3h4v4H4zM16 3h4v4h-4zM11 18h4v4h-4z",
  ],
  terminal: ["M3 4h18v16H3z", "M3 8h18", "m7 12 3 2-3 2M13 16h4"],
  browser: [
    "M4 3h16l1 1v16l-1 1H4l-1-1V4l1-1Z",
    "M3 8h18M6 5.5h.1M9 5.5h.1",
    "m10 11-3 3 3 3m4-6 3 3-3 3",
  ],
  file: ["M6 2h8l5 5v15H6V2Z", "M14 2v6h5", "M9 12h7M9 15h7M9 18h4"],
  layers: ["m12 2 10 5-10 5L2 7l10-5Z", "m2 12 10 5 10-5M2 17l10 5 10-5"],
  local: ["M4 3h16v13H4z", "M8 21h8M12 16v5", "m9 8 2 2 4-4M8 13h8"],
  shield: ["m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5l8-3Z", "m8 12 3 3 5-6"],
  lock: ["M6 10h12v11H6z", "M8 10V6a4 4 0 0 1 8 0v4M12 14v3"],
  signal: ["M3 16v5M7.5 12v9M12 8v13M16.5 4v17M21 1v20"],
  orbit: [
    "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z",
    "M20 9a9 9 0 1 1-5-6",
    "M16 1h5v5h-5z",
  ],
  portal: ["M5 21V7l7-5 7 5v14", "M9 21V9l3-2 3 2v12M2 21h20"],
  spark: [
    "m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z",
    "m19 2 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z",
  ],
  motion: ["M3 6h6M2 12h4M3 18h6", "m12 4 8 8-8 8V4Z"],
  curve: [
    "M3 19C3 5 21 19 21 5",
    "M1 17h4v4H1zM19 3h4v4h-4z",
    "M3 3v10M21 11v10",
  ],
  grid: ["M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z", "M17.5 14v7M14 17.5h7"],
  focus: ["M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6", "M9 9h6v6H9z"],
  arrow: ["M4 20 20 4M7 4h13v13", "M4 12v8h8"],
  command: [
    "M8 8H5a3 3 0 1 1 3-3v14a3 3 0 1 1-3-3h14a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H8Z",
  ],
  wave: ["M2 12c3-14 5 14 8 0s5 14 8 0 4-1 4-1"],
  sliders: [
    "M5 3v5M5 14v7M12 3v10M12 19v2M19 3v2M19 11v10",
    "M2 8h6v6H2zM9 13h6v6H9zM16 5h6v6h-6z",
  ],
  receipt: ["M5 2h14v20l-3-2-4 2-4-2-3 2V2Z", "M8 7h8M8 11h8m-8 5 2 2 5-5"],
  link: [
    "m9 15-2 2a3.5 3.5 0 0 1-5-5l5-5a3.5 3.5 0 0 1 5 0",
    "m15 9 2-2a3.5 3.5 0 0 1 5 5l-5 5a3.5 3.5 0 0 1-5 0M8 16l8-8",
  ],
  scan: ["M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M2 12h20", "M7 7h10v10H7z"],
  fingerprint: [
    "M4 13v-1a8 8 0 0 1 16 0v3M7 17v-5a5 5 0 0 1 10 0v5M10 20v-8a2 2 0 0 1 4 0v9M4 17v2M20 18v1",
  ],
  horizon: [
    "M2 17h20M4 21h16",
    "M6 13a6 6 0 0 1 12 0M12 1v3M3 5l2 2M21 5l-2 2",
  ],
  route: [
    "M4 4v13a3 3 0 0 0 3 3h5a3 3 0 0 0 3-3V7a3 3 0 0 1 3-3h2",
    "M2 2h4v4H2zM18 2h4v4h-4z",
  ],
  prism: ["m12 2 10 18H2L12 2Z", "M12 2v18M2 20l10-8 10 8"],
  pause: ["M5 3h5v18H5zM14 3h5v18h-5z"],
  aperture: [
    "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Z",
    "m7 3 5 9 5-9M2 12h10l-5 9m10 0-5-9h10",
  ],
  droplet: [
    "M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z",
    "M9 14c-1 2 0 4 2 4",
  ],
  mesh: [
    "M3 3h18v18H3z",
    "M3 8c7 6 11-6 18 0M3 16c7-6 11 6 18 0M8 3c6 7-6 11 0 18M16 3c-6 7 6 11 0 18",
  ],
  ripple: [
    "M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",
    "M7 5a8 8 0 0 1 10 0M5 7a8 8 0 0 0 0 10m2 2a8 8 0 0 0 10 0m2-2a8 8 0 0 0 0-10",
  ],
  refraction: ["m12 3 8 17H4L12 3Z", "M1 9l9 4 12-5M10 13l12 1M10 13l12 7"],
  shader: [
    "m12 2 9 5v10l-9 5-9-5V7l9-5Z",
    "m3 7 9 5 9-5M12 12v10M7 5l10 14M17 5 7 19",
  ],
  fluid: [
    "M3 8c4-8 14-8 18 0s-4 14-9 14S-1 16 3 8Z",
    "M5 7c2 5 11-2 13 3s-8 3-8 7",
  ],
  contour: [
    "M3 8c3-8 15-8 18 0s-1 13-9 13S0 16 3 8Z",
    "M7 9c2-5 8-5 10 0s0 8-5 8-7-3-5-8Z",
    "M11 10c2-2 4 1 2 3s-4-1-2-3Z",
  ],
  orbitals: [
    "M3 7c3-5 20 5 18 10S0 12 3 7Z",
    "M7 21C2 18 12 1 17 3S12 24 7 21Z",
    "M12 11v2",
  ],
  timeline: [
    "M3 5v14M21 5v14M3 12h18",
    "M7 8h3v8H7zM14 4h3v8h-3zM14 17h3v3h-3z",
  ],
  keyframe: ["m12 5 7 7-7 7-7-7 7-7Z", "M1 12h4M19 12h4M12 1v4M12 19v4"],
  stagger: ["M3 4h7v4H3zM8 10h7v4H8zM13 16h7v4h-7z", "M3 12h2M3 18h7M13 6h7"],
  morph: [
    "M3 4h7v7H3z",
    "M17 13a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z",
    "M14 4h6v6m-6-6 6 6M4 14v6h6m-6-6 6 6",
  ],
  easing: ["M3 3v18h18", "M6 17C16 17 6 7 18 7", "m15 4 3 3-3 3"],
  loop: [
    "M6 6h11a5 5 0 0 1 5 5M18 18H7a5 5 0 0 1-5-5",
    "m9 2-4 4 4 4m6 4 4 4-4 4",
  ],
  magnet: [
    "M4 3h5v10a3 3 0 0 0 6 0V3h5v10a8 8 0 0 1-16 0V3Z",
    "M4 8h5M15 8h5M12 2v4",
  ],
  spring: ["M3 4h18M3 20h18", "M12 4v2l-6 2 12 3-12 3 12 3-6 1v2"],
  tether: ["M2 4h6v6H2zM16 14h6v6h-6z", "M8 7h5c5 0-7 10-2 10h5"],
  cursor: ["m5 2 15 11-8 1-3 8L5 2Z", "m14 16 5 5M2 10H0M12 3V1"],
  bloom: [
    "M12 12C1 12 1 2 7 3c4 1 5 6 5 9Z",
    "M12 12c0-11 10-11 9-5-1 4-6 5-9 5Z",
    "M12 12c11 0 11 10 5 9-4-1-5-6-5-9Z",
    "M12 12c0 11-10 11-9 5 1-4 6-5 9-5Z",
  ],
  halo: [
    "M2 12a10 5 0 1 0 20 0 10 5 0 1 0-20 0Z",
    "M5 12a7 3 0 1 0 14 0 7 3 0 1 0-14 0ZM12 2v3M12 19v3",
  ],
  split: ["M3 4h7v16H3zM14 4h7v16h-7z", "m6 9-3 3 3 3m12-6 3 3-3 3"],
  mask: ["M3 3h18v18H3z", "m3 9 6-6M3 15 15 3M3 21 21 3M9 21 21 9M15 21l6-6"],
  noise: [
    "M3 3h3v3H3zM15 3h6v3h-6zM9 8h3v3H9zM18 9h3v3h-3zM3 12h3v3H3zM12 14h3v3h-3zM3 18h6v3H3zM18 18h3v3h-3z",
  ],
  spectrum: ["M3 16v-4M6 19V9M9 21V3M12 17V7M15 20V4M18 17V7M21 14v-4"],
  prismatics: [
    "m12 2 9 7-4 12H7L3 9l9-7Z",
    "M3 9h18M12 2l-5 19 10-12-5-7 5 19L7 9l5-7",
  ],
  bezier: [
    "M4 19C4 1 20 23 20 5",
    "M4 19V5h4M20 5v14h-4",
    "M2 17h4v4H2zM18 3h4v4h-4z",
  ],
  anchor: [
    "M12 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM12 7v14M7 11h10",
    "M3 14v2a9 5 0 0 0 18 0v-2M1 16l2-2 2 2m14 0 2-2 2 2",
  ],
  compass: [
    "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Z",
    "m16 8-3 5-5 3 3-5 5-3ZM12 2v2M12 20v2M2 12h2M20 12h2",
  ],
  shutter: ["M4 3h16v18H4z", "M4 7h16M4 11h16M4 15h16M4 19h16"],
  constellation: [
    "m4 5 8 4 8-5-3 13-12 3 7-11 5 8",
    "M2 3h4v4H2zM18 2h4v4h-4zM10 7h4v4h-4zM15 15h4v4h-4zM3 18h4v4H3z",
  ],
  material: [
    "m12 2 9 5v10l-9 5-9-5V7l9-5Z",
    "M12 2v20M3 7l9 5m-9 5 9-5M15 5v14M18 7v10",
  ],
} as const;
export type IconName = keyof typeof ICON_PATHS;
export const ICON_NAMES = Object.keys(ICON_PATHS) as IconName[];
export type RabtaIconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  duotone?: boolean;
  draw?: boolean;
  label?: string;
};
export function RabtaIcon({
  name,
  size = 24,
  strokeWidth = 1.5,
  duotone = false,
  draw = false,
  label,
  style,
  ...props
}: RabtaIconProps) {
  const paths = Object.hasOwn(ICON_PATHS, name)
    ? ICON_PATHS[name]
    : ICON_PATHS.capsule;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={draw ? "r-icon-draw" : undefined}
      style={style}
      {...props}
    >
      {duotone && (
        <rect
          x="1"
          y="1"
          width="22"
          height="22"
          rx="6"
          fill="currentColor"
          opacity=".1"
          stroke="none"
        />
      )}
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          pathLength="100"
          style={{ "--r-i": i } as CSSProperties}
        />
      ))}
    </svg>
  );
}
export function iconSVG(
  name: string,
  {
    color = "#b9cfaa",
    size = 72,
    stroke = 1.5,
    duotone = false,
  }: { color?: string; size?: number; stroke?: number; duotone?: boolean } = {},
) {
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "#b9cfaa";
  const safeSize = Math.min(
    512,
    Math.max(16, Number.isFinite(size) ? size : 72),
  );
  const safeStroke = Math.min(
    4,
    Math.max(0.5, Number.isFinite(stroke) ? stroke : 1.5),
  );
  const paths = Object.hasOwn(ICON_PATHS, name)
    ? ICON_PATHS[name as IconName]
    : ICON_PATHS.capsule;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 24 24" fill="none" stroke="${safeColor}" stroke-width="${safeStroke}" stroke-linecap="round" stroke-linejoin="round">\n${duotone ? `  <rect x="1" y="1" width="22" height="22" rx="6" fill="${safeColor}" opacity="0.1" stroke="none"/>\n` : ""}${paths.map((d) => `  <path d="${d}"/>`).join("\n")}\n</svg>`;
}
