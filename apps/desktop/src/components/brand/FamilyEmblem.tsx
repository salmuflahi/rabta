import type { CSSProperties } from "react";
export type FamilyId =
  | "workspace"
  | "companion"
  | "connect"
  | "teams"
  | "studio";
export const FAMILY_PATHS: Record<FamilyId, readonly string[]> = {
  workspace: [
    "M33 7H17C11.5 7 7 11.5 7 17v14c0 5.5 4.5 10 10 10h14c5.5 0 10-4.5 10-10V17c0-5.5-4.5-10-10-10",
    "M17 17h9a7 7 0 0 1 0 14h-9m0 0 5-5m-5 5 5 5",
  ],
  companion: [
    "M29 7H17C11.5 7 7 11.5 7 17v14c0 5.5 4.5 10 10 10h14c5.5 0 10-4.5 10-10v-2",
    "M24 17v7h7",
    "M33 7h8v8h-8Z",
  ],
  connect: [
    "M20 14l-3-3a8.5 8.5 0 0 0-12 12l12 12a8.5 8.5 0 0 0 12-12l-3-3",
    "m28 34 3 3a8.5 8.5 0 0 0 12-12L31 13a8.5 8.5 0 0 0-12 12l3 3",
  ],
  teams: [
    "M20 26 14 16a8 8 0 1 1 14 0l-5 8",
    "m28 22 11-1a8 8 0 1 1-7 13l-7-8",
    "m21 30-4 10a8 8 0 1 1-8-12l10-2",
  ],
  studio: [
    "M8 36C23 36 21 12 40 12",
    "M8 36V12h12M40 12v24H28",
    "M5 33h6v6H5Zm32-24h6v6h-6Z",
    "M20 9v6m-3-3h6M28 33v6m-3-3h6",
  ],
};
export function FamilyEmblem({
  product,
  size = 40,
  label,
  className = "",
  style,
}: {
  product: FamilyId;
  size?: number;
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={`family-emblem ${className}`}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={style}
    >
      {FAMILY_PATHS[product].map((d, i) => (
        <path d={d} key={i} />
      ))}
    </svg>
  );
}
