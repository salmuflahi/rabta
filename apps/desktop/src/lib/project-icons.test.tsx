import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectIcon, PROJECT_ICON_OPTIONS } from "@/lib/project-icons";
import type { ProjectIconKey } from "@/store";

describe("ProjectIcon", () => {
  it("exposes every stable project icon key once", () => {
    expect(PROJECT_ICON_OPTIONS.map((option) => option.key)).toEqual([
      "code",
      "globe",
      "database",
      "terminal",
      "blocks",
      "rocket",
      "wrench",
      "folder",
    ]);
  });

  it("falls back safely for a null or unknown project icon", () => {
    const { rerender } = render(
      <ProjectIcon icon={null} aria-label="project icon" />,
    );
    expect(screen.getByLabelText("project icon")).toBeInTheDocument();

    rerender(
      <ProjectIcon
        icon={"future-icon" as ProjectIconKey}
        aria-label="project icon"
      />,
    );
    expect(screen.getByLabelText("project icon")).toBeInTheDocument();
  });
});
