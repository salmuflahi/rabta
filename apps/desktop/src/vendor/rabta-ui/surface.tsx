"use client";
import {
  createContext,
  useContext,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  DEFAULT_CONFIG,
  configStyle,
  normalizeConfig,
  type StudioConfig,
} from "./config.js";
export const ConfigContext = createContext<StudioConfig>(DEFAULT_CONFIG);
export function RabtaSurface({
  config,
  children,
  className = "",
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  config?: Partial<StudioConfig>;
  children: ReactNode;
}) {
  const c = normalizeConfig({ ...DEFAULT_CONFIG, ...config });
  return (
    <ConfigContext.Provider value={c}>
      <div
        className={`r-ui r-surface ${className}`}
        data-motion={c.motion ? "on" : "off"}
        data-glow={c.glow ? "on" : "off"}
        style={{ ...configStyle(c), ...style }}
        {...props}
      >
        {children}
      </div>
    </ConfigContext.Provider>
  );
}
export type PatternProps = {
  variant?: string;
  title?: string;
  subtitle?: string;
  onAction?: () => void;
  compact?: boolean;
};
export function useLabels(title?: string, subtitle?: string) {
  const c = useContext(ConfigContext);
  return { c, title: title ?? c.label, subtitle: subtitle ?? c.subtext };
}
