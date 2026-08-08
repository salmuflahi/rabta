import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { expectFocusRingSuppressed } from "@/test/no-box";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/**
 * These three overlays share one root cause with the restore sheet
 * (src/restore/RestoreExperience.tsx): Radix moves real DOM focus onto the
 * Content container itself — not onto any item inside it — whenever there's
 * no better candidate to focus at the moment the overlay opens:
 *
 *   - DropdownMenu / ContextMenu: opening via a POINTER (a real left-click
 *     on a dropdown trigger, or a right-click for a context menu — the
 *     overwhelmingly common way either is opened) focuses the menu's own
 *     `role="menu"` container, not the first `role="menuitem"`. Keyboard-
 *     opened menus are fine (Radix focuses the first item directly), but
 *     pointer-opened ones are not — confirmed by mounting each and firing a
 *     real click / contextmenu event, then reading `document.activeElement`.
 *   - Popover: focuses its own `role="dialog"` container specifically when
 *     its content has no focusable descendant (e.g. an info popover that's
 *     just text) — confirmed the same way.
 *
 * A `<div>` is never natively pointer-focusable, so per the :focus-visible
 * spec this programmatic `.focus()` still matches `:focus-visible` even
 * though the trigger was a mouse click — exactly the mechanism that painted
 * the orange ring around the whole restore-sheet card. Same cause, same
 * fix: the Content container neutralises its own ring with
 * `focus-visible:ring-0`; individual items keep whatever focus treatment
 * they already had (a `focus:bg-accent` highlight, unrelated to this ring).
 */
describe("shared overlay Content containers suppress their own auto-focus ring", () => {
  // Radix's dismissable-layer / focus-scope teardown for the previous
  // test's overlay (document-level pointerdown listeners, a layer-stack
  // entry removed via a 0ms timeout) doesn't always finish before RTL's
  // automatic unmount — leftover document listeners have been observed to
  // make the *next* test's overlay in this file re-close itself right after
  // opening. An explicit cleanup + a real tick between tests avoids that
  // cross-test interference.
  afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("DropdownMenuContent: focused directly by a pointer-opened menu", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item 1</DropdownMenuItem>
          <DropdownMenuItem>Item 2</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    const trigger = screen.getByText("Open");
    fireEvent.pointerDown(trigger, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(trigger, { button: 0, pointerId: 1 });
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu");
    // Radix's focus-scope mount effect settles asynchronously; give it a
    // tick before reading `document.activeElement`.
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Confirms the container — not an item — is what real focus landed on,
    // which is exactly the condition this test guards.
    expect(document.activeElement).toBe(menu);
    expectFocusRingSuppressed(menu);
  });

  it("ContextMenuContent: focused directly by a right-click-opened menu", async () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger>Right-click area</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Item 1</ContextMenuItem>
          <ContextMenuItem>Item 2</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
    fireEvent.contextMenu(screen.getByText("Right-click area"));
    const menu = await screen.findByRole("menu");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.activeElement).toBe(menu);
    expectFocusRingSuppressed(menu);
  });

  it("PopoverContent: focused directly when its content has no focusable descendant", async () => {
    // `defaultOpen` (rather than simulating a click) mounts the content
    // directly — Radix's focus-scope mount effect, which decides whether
    // to fall back to focusing the container, runs the same way regardless
    // of *how* the popover came to be open, and this sidesteps this
    // environment's dismissable-layer treating a synthetic pointerdown +
    // click pair as an "outside" interaction that immediately re-closes it.
    render(
      <Popover defaultOpen>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>
          <p>Just some static text, no button or input.</p>
        </PopoverContent>
      </Popover>
    );
    const popover = await screen.findByRole("dialog");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.activeElement).toBe(popover);
    expectFocusRingSuppressed(popover);
  });
});
