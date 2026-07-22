import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { ProjectsPage } from "./ProjectsPage";

describe("ProjectsPage", () => {
  it("renders without throwing (catches missing-provider crashes)", async () => {
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText("Projects")).toBeInTheDocument();
  });
});
