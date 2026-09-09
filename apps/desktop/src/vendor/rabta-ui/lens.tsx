"use client";

import {
  useContext,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { ConfigContext, useLabels, type PatternProps } from "./surface.js";
import { useLiveActivity } from "./activity.js";
import { RabtaIcon, type IconName } from "./icons.js";

export type LensTone = "mist" | "sage" | "rose" | "neutral";

/** A composable material, with no minimum height or hidden app behavior. */
export function LensPanel({
  children,
  tone = "mist",
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: LensTone; children: ReactNode }) {
  return (
    <div
      className={`r-lens r-lens-panel ${className}`}
      data-tone={tone}
      {...props}
    >
      {children}
    </div>
  );
}

export function ContextArc({
  items,
  label = "Saved context",
  className = "",
  showLegend = true,
}: {
  items: { id: string; label: string; detail?: string; ready: boolean }[];
  label?: string;
  className?: string;
  showLegend?: boolean;
}) {
  const safe = items.slice(0, 8);
  const c = useContext(ConfigContext);
  const ref = useRef<HTMLDivElement>(null);
  const { active } = useLiveActivity(ref, c.motion);
  const points = safe.map((item, i) => {
    const a =
      ((205 + (130 * i) / Math.max(1, safe.length - 1)) * Math.PI) / 180;
    return { ...item, x: 160 + 122 * Math.cos(a), y: 190 + 122 * Math.sin(a) };
  });
  return (
    <div
      ref={ref}
      className={`r-lens r-context-arc ${className}`}
      data-active={active}
    >
      <svg viewBox="0 0 320 212" aria-hidden="true">
        {[95, 122, 145].map((r) => (
          <path
            key={r}
            d={`M${160 - r * 0.9063} ${190 - r * 0.4226} A${r} ${r} 0 0 1 ${160 + r * 0.9063} ${190 - r * 0.4226}`}
            className="r-arc-track"
          />
        ))}
        {Array.from({ length: 45 }, (_, i) => {
          const a = ((205 + (i * 130) / 44) * Math.PI) / 180;
          const r = i % 4 === 0 ? 133 : 138;
          return (
            <path
              key={i}
              className="r-arc-tick"
              d={`M${160 + r * Math.cos(a)} ${190 + r * Math.sin(a)} L${160 + 143 * Math.cos(a)} ${190 + 143 * Math.sin(a)}`}
            />
          );
        })}
        <path
          className="r-arc-light"
          d="M49.4 138.4 A122 122 0 0 1 270.6 138.4"
          pathLength="1"
        />
        {points.map((p) => (
          <g
            key={p.id}
            className={p.ready ? "r-arc-node is-ready" : "r-arc-node"}
          >
            <circle cx={p.x} cy={p.y} r="7" />
            <circle cx={p.x} cy={p.y} r="2" />
          </g>
        ))}
        <circle cx="160" cy="176" r="23" className="r-arc-core" />
        <path
          d={
            items.length > 0 && items.every((item) => item.ready)
              ? "M152 176l5 5 11-11"
              : "M153 176h14"
          }
          className="r-arc-check"
        />
      </svg>
      <div className="r-arc-caption">{label}</div>
      {showLegend && (
        <ul className="r-arc-legend">
          {items.map((item) => (
            <li key={item.id} data-ready={item.ready}>
              <i aria-hidden="true" />
              <span>{item.label}</span>
              <small>
                {item.detail ?? (item.ready ? "Ready" : "Not connected")}
              </small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ActionBridge({
  children,
  left,
  right,
  loading = false,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  left?: ReactNode;
  right?: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className={`r-lens r-action-bridge ${className}`}>
      {left && <div className="r-bridge-side">{left}</div>}
      <button
        type="button"
        {...props}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
      >
        <span style={{ opacity: loading ? 0 : 1 }}>{children}</span>
        {loading && (
          <span className="r-bridge-busy" role="status" aria-label="Working">
            <i />
          </span>
        )}
      </button>
      {right && <div className="r-bridge-side">{right}</div>}
    </div>
  );
}

export type DockItem = {
  id: string;
  label: string;
  icon: IconName;
  disabled?: boolean;
};
export function QuietDock({
  items,
  onAction,
  label = "Workspace actions",
  className = "",
}: {
  items: DockItem[];
  onAction: (id: string) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`r-lens r-quiet-dock ${className}`}
      role="group"
      aria-label={label}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-label={item.label}
          disabled={item.disabled}
          onClick={() => onAction(item.id)}
        >
          <RabtaIcon name={item.icon} size={19} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

const GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00100", "00100"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
};

export function DotText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const visible = text.toUpperCase();
  if (visible.length > 40 || !visible.trim())
    return <span className={`r-lens r-dot-fallback ${className}`}>{text}</span>;
  if ([...visible].some((char) => !GLYPHS[char]))
    return <span className={`r-lens r-dot-fallback ${className}`}>{text}</span>;
  return (
    <svg
      className={`r-lens r-dot-text ${className}`}
      viewBox={`0 0 ${Math.max(1, visible.length) * 36 - 6} 42`}
      role="img"
      aria-label={text}
    >
      {[...visible].flatMap((char, i) =>
        GLYPHS[char].flatMap((row, y) =>
          [...row].map((v, x) =>
            v === "1" ? (
              <circle
                key={`${i}-${x}-${y}`}
                cx={i * 36 + x * 6 + 3}
                cy={y * 6 + 3}
                r="1.9"
              />
            ) : null,
          ),
        ),
      )}
    </svg>
  );
}

export function OrbitThreads({
  label = "One task. All connected.",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  const c = useContext(ConfigContext),
    ref = useRef<HTMLDivElement>(null);
  const { active } = useLiveActivity(ref, c.motion);
  const id = useId().replace(/:/g, "");
  return (
    <div
      className={`r-lens r-orbit-threads ${className}`}
      ref={ref}
      data-active={active}
    >
      <svg viewBox="0 0 320 240" role="img" aria-label={label}>
        <defs>
          <linearGradient id={id} x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="currentColor" stopOpacity=".1" />
            <stop offset=".5" stopColor="currentColor" />
            <stop offset="1" stopColor="currentColor" stopOpacity=".15" />
          </linearGradient>
        </defs>
        {Array.from({ length: 7 }, (_, i) => (
          <ellipse
            className="r-orbit-line"
            key={i}
            cx="160"
            cy={81 + i * 15}
            rx={34 + i * 11}
            ry={28 - i * 2}
            fill="none"
            stroke={`url(#${id})`}
            style={{ "--r-orbit-i": i } as CSSProperties}
          />
        ))}
        <ellipse
          className="r-orbit-anchor"
          cx="160"
          cy="157"
          rx="89"
          ry="28"
          fill="none"
        />
        <circle cx="71" cy="157" r="4" fill="currentColor" />
      </svg>
    </div>
  );
}

export function ContextRail({
  items,
  className = "",
}: {
  items: { id: string; label: string; detail: string }[];
  className?: string;
}) {
  return (
    <ol className={`r-lens r-context-rail ${className}`}>
      {items.map((item) => (
        <li key={item.id}>
          <i aria-hidden="true" />
          <div>
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function LensStudy({
  variant = "frost",
  title,
  subtitle,
  onAction,
  compact = false,
}: PatternProps) {
  const labels = useLabels(title, subtitle),
    [note, setNote] = useState("");
  const actions: DockItem[] = [
    { id: "search", label: "Find", icon: "search" },
    { id: "capture", label: "Capture", icon: "capsule" },
    { id: "restore", label: "Restore", icon: "restore" },
  ];
  const action = (id: string) => {
    setNote(
      `${id === "restore" ? "Restore" : id === "capture" ? "Capture" : "Find"} selected in this preview.`,
    );
    onAction?.();
  };
  const items = [
    { id: "files", label: "Files", detail: "3 paths", ready: true },
    { id: "tabs", label: "Browser", detail: "5 tabs", ready: true },
    { id: "terminal", label: "Terminal", detail: "2 directories", ready: true },
  ];
  return (
    <div
      className={`r-lens r-lens-study r-lens-${variant}`}
      data-compact={compact}
    >
      {variant === "dock" ? (
        <>
          <DotText text="IN REACH" />
          <p>{labels.subtitle}</p>
          <QuietDock items={actions} onAction={action} />
        </>
      ) : variant === "dots" ? (
        <>
          <span className="r-lens-eyebrow">A QUIETER SIGNAL</span>
          <DotText text={labels.title} />
          <p>{labels.subtitle}</p>
        </>
      ) : variant === "orbit" ? (
        <LensPanel tone="sage">
          <span className="r-lens-eyebrow">WORKSPACE MEMORY</span>
          <OrbitThreads />
          <h3>{labels.title}</h3>
          <p>{labels.subtitle}</p>
        </LensPanel>
      ) : variant === "rail" ? (
        <LensPanel>
          <span className="r-lens-eyebrow">YOUR PLACE, KEPT</span>
          <ContextRail
            items={[
              { id: "file", label: "session.rs", detail: "Your active file" },
              {
                id: "branch",
                label: "feat/reconnect",
                detail: "The branch for this task",
              },
              {
                id: "browser",
                label: "WebSocket reference",
                detail: "Pinned in Chrome",
              },
            ]}
          />
        </LensPanel>
      ) : variant === "bridge" ? (
        <LensPanel tone="sage">
          <OrbitThreads />
          <h3>{labels.title}</h3>
          <ActionBridge
            left={
              <>
                <b>3</b>
                <small>Files</small>
              </>
            }
            right={
              <>
                <b>5</b>
                <small>Tabs</small>
              </>
            }
            onClick={() => action("restore")}
          >
            Resume work
          </ActionBridge>
        </LensPanel>
      ) : variant === "split" ? (
        <div className="r-lens-split">
          <LensPanel tone="sage">
            <RabtaIcon name="local" size={26} />
            <h3>On this Mac.</h3>
            <p>Your saved context stays local.</p>
          </LensPanel>
          <LensPanel tone="rose">
            <RabtaIcon name="anchor" size={26} />
            <h3>Keep it close.</h3>
            <p>Pin the paths you always need.</p>
          </LensPanel>
        </div>
      ) : variant === "dial" ? (
        <LensPanel>
          <div className="r-lens-card-heading">
            <span>Saved context</span>
            <RabtaIcon name="capsule" size={20} />
          </div>
          <ContextArc items={items} />
        </LensPanel>
      ) : (
        <LensPanel>
          <div className="r-lens-card-heading">
            <span>Current capsule</span>
            <RabtaIcon name="capsule" size={23} />
          </div>
          <h3>{labels.title}</h3>
          <p>{labels.subtitle}</p>
          <ContextArc items={items} />
          <ActionBridge onClick={() => action("restore")}>
            Resume work <RabtaIcon name="arrow" size={17} />
          </ActionBridge>
        </LensPanel>
      )}
      {!compact && (
        <span className="r-lens-demo-feedback" role="status">
          {note || "Illustrative component · connect actions to your app"}
        </span>
      )}
    </div>
  );
}
