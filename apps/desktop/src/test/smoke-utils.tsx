import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

// Shared Tauri mocks for page-level smoke tests. `invoke` resolves `[]` by
// default so list-returning commands (list_projects, recent_events,
// known_connectors, pending_pairings, list_tasks, git_branches, ...) get a
// harmless empty array instead of undefined; individual tests can still
// override behavior per-call via `vi.mocked(invoke).mockImplementationOnce`.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => [] as unknown[]),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

/** Renders `ui` wrapped in the same providers main.tsx mounts app-wide
 * (ThemeProvider, TooltipProvider), so components that assume a Tooltip
 * context (or any other provider-dependent primitive) don't crash on
 * render in isolation. */
export function renderWithProviders(ui: ReactElement) {
  return render(
    <ThemeProvider>
      <TooltipProvider>{ui}</TooltipProvider>
    </ThemeProvider>
  );
}
