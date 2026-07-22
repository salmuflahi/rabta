import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStore } from "@/store";
import { renderWithProviders } from "@/test/smoke-utils";
import { ActivityPage } from "./ActivityPage";

describe("ActivityPage", () => {
  it("renders a seeded log entry without throwing", async () => {
    useStore.setState({
      log: [{ seq: 1, at: "3:04:12 PM", type: "connectorConnected", connectorId: "conn-1" }],
    });

    renderWithProviders(<ActivityPage />);

    expect(await screen.findByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("connectorConnected")).toBeInTheDocument();
  });
});
