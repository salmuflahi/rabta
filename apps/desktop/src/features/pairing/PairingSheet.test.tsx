import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ARM_DELAY_MS, PairingSheet } from "./PairingSheet";
import { useStore } from "@/store";
import { renderWithProviders } from "@/test/smoke-utils";

const chrome = { pairingId: "p1", name: "Chrome", kind: "browser" };
const cursor = { pairingId: "p2", name: "Cursor", kind: "editor" };

describe("PairingSheet", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useStore.setState({ pairings: [] });
  });

  const arm = () => act(() => void vi.advanceTimersByTime(ARM_DELAY_MS + 10));

  it("shows nothing with no pending request", () => {
    renderWithProviders(<PairingSheet />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the connector asking", () => {
    useStore.setState({ pairings: [chrome] });
    renderWithProviders(<PairingSheet />);
    expect(screen.getByText(/Chrome/)).toBeInTheDocument();
  });

  // The reason this is a sheet and not a banner: consent needs to state what
  // is being consented to.
  it("states what the connector can and cannot see", () => {
    useStore.setState({ pairings: [chrome] });
    renderWithProviders(<PairingSheet />);
    expect(screen.getByText("Can see")).toBeInTheDocument();
    expect(screen.getByText("Never sees")).toBeInTheDocument();
    expect(screen.getByText("Passwords, tokens or keychain items")).toBeInTheDocument();
  });

  it("holds both decisions inert until armed", () => {
    useStore.setState({ pairings: [chrome] });
    renderWithProviders(<PairingSheet />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeDisabled();
    arm();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeEnabled();
  });

  it("does not approve on Enter, even once armed", () => {
    useStore.setState({ pairings: [chrome] });
    renderWithProviders(<PairingSheet />);
    arm();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(useStore.getState().pairings).toHaveLength(1);
  });

  it("counts the queue and advances through it", () => {
    useStore.setState({ pairings: [chrome, cursor] });
    renderWithProviders(<PairingSheet />);
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText(/Chrome/)).toBeInTheDocument();
  });

  // Dismissing is not deciding. A stray Escape must not permanently reject a
  // connector the user wanted — the request stays pending on Connectors.
  it("keeps the request pending when dismissed without a decision", () => {
    useStore.setState({ pairings: [chrome] });
    renderWithProviders(<PairingSheet />);
    arm();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(useStore.getState().pairings).toHaveLength(1);
  });

  it("suppresses itself on the Connectors view, which has its own card", () => {
    useStore.setState({ pairings: [chrome], view: "connectors" });
    renderWithProviders(<PairingSheet />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
