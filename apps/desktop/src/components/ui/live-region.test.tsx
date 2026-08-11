import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { announce } from "@/lib/announce";
import { LiveRegion } from "./live-region";

describe("LiveRegion", () => {
  it("mounts exactly one polite and one assertive sr-only region", () => {
    const { container } = render(<LiveRegion />);
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(2);
    const polite = container.querySelector('[aria-live="polite"]');
    const assertiveEl = container.querySelector('[aria-live="assertive"]');
    expect(polite).not.toBeNull();
    expect(assertiveEl).not.toBeNull();
    expect(polite).toHaveAttribute("aria-atomic", "true");
    expect(assertiveEl).toHaveAttribute("aria-atomic", "true");
    expect(polite?.className).toMatch(/sr-only/);
    expect(assertiveEl?.className).toMatch(/sr-only/);
  });

  it("writes a polite announcement into the polite region only", () => {
    const { container } = render(<LiveRegion />);
    act(() => announce("Capsule captured"));
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent("Capsule captured");
    expect(container.querySelector('[aria-live="assertive"]')).toHaveTextContent("");
  });

  it("writes an assertive announcement into the assertive region only", () => {
    const { container } = render(<LiveRegion />);
    act(() => announce("Chrome wants to connect to Rabta", { assertive: true }));
    expect(container.querySelector('[aria-live="assertive"]')).toHaveTextContent(
      "Chrome wants to connect to Rabta",
    );
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent("");
  });

  // The subtle requirement this whole mechanism exists for: a screen reader
  // ignores a live region whose rendered text did not change, so an
  // identical consecutive message must still produce a genuine DOM mutation
  // — not a React no-op bail-out because the text child looked unchanged.
  // Proven directly at the DOM level: capture the actual text-node's parent
  // element instance across two identical announcements and assert the
  // second one is a *different* node, not the same node left alone.
  it("genuinely re-announces an identical consecutive message (a fresh DOM node each time, not a no-op)", () => {
    const { container } = render(<LiveRegion />);

    act(() => announce("Restored"));
    const region = container.querySelector('[aria-live="polite"]')!;
    expect(region).toHaveTextContent("Restored");
    const firstNode = region.firstElementChild;

    act(() => announce("Restored"));
    expect(region).toHaveTextContent("Restored");
    const secondNode = region.firstElementChild;

    expect(secondNode).not.toBeNull();
    expect(secondNode).not.toBe(firstNode);
  });

  // Same proof on the assertive side, since it has its own independent
  // channel/state/timer rather than sharing the polite region's.
  it("genuinely re-announces an identical consecutive assertive message", () => {
    const { container } = render(<LiveRegion />);

    act(() => announce("Chrome wants to connect to Rabta", { assertive: true }));
    const region = container.querySelector('[aria-live="assertive"]')!;
    const firstNode = region.firstElementChild;

    act(() => announce("Chrome wants to connect to Rabta", { assertive: true }));
    const secondNode = region.firstElementChild;

    expect(secondNode).not.toBe(firstNode);
  });

  it("clears the shown text after the auto-clear delay, using real timers", async () => {
    const { container } = render(<LiveRegion />);
    act(() => announce("Capsule captured"));
    const region = container.querySelector('[aria-live="polite"]')!;
    expect(region).toHaveTextContent("Capsule captured");

    // Real timers (no vi.useFakeTimers here): wait past the 1s auto-clear
    // the component documents, then confirm the region actually went idle.
    await act(() => new Promise((resolve) => setTimeout(resolve, 1100)));
    expect(region).toHaveTextContent("");
  }, 2000);
});
