import type { ToolIconName } from "./catalog";
const paths: Record<ToolIconName, string> = {
  note: "M6 3h9l4 4v14H6z M15 3v5h4 M9 12h7 M9 16h5",
  snippet: "M8 3h11v14 M5 7h10v14H5z M8 11h4 M8 15h4",
  clipboard: "M9 5H6v16h12V5h-3 M9 3h6v4H9z M9 12h6 M9 16h4",
  link: "M10 8l3-3a4 4 0 0 1 6 6l-3 3 M14 16l-3 3a4 4 0 0 1-6-6l3-3 M8 16l8-8",
  timer:
    "M9 2h6 M12 2v3 M18 5l2 2 M12 9v5l3 2 M20 14a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  calculator: "M5 3h14v18H5z M8 7h8 M8 12h1 M15 12h1 M8 16h1 M15 16h1",
  measure: "M3 8h18v8H3z M7 8v4 M11 8v3 M15 8v4 M19 8v3",
  text: "M3 5h12 M9 5v14 M6 19h6 M14 11h7 M17.5 11v8 M15 19h5",
  code: "M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16",
  table: "M3 4h18v16H3z M3 10h18 M9 4v16 M15 10v10",
  hash: "M9 3L7 21 M17 3l-2 18 M4 8h17 M3 16h17",
  key: "M14 9a5 5 0 1 1-10 0 5 5 0 0 1 10 0 M13 12l8 8 M17 16l3-3 M19 18l3-3",
  color: "M12 3C9 7 5 10 5 14a7 7 0 0 0 14 0c0-4-4-7-7-11z M8 15a4 4 0 0 0 4 4",
  files: "M8 3h9l4 4v11H8z M17 3v5h4 M4 7v14h13",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z",
  search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M15 15l6 6",
  x: "m6 6 12 12 M18 6 6 18",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  mac: "M3 4h18v13H3z M8 21h8 M12 17v4",
};
export function ToolIcon({
  name,
  size = 22,
}: {
  name: ToolIconName;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
