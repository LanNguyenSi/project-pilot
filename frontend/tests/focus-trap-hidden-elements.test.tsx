// @vitest-environment jsdom
//
// Focus trapping when part of the container is hidden. A focusable element in a
// `display: none` subtree cannot be focused, so counting it as the first or last
// element breaks the wrap: `last.focus()` on a hidden last element leaves the
// focus where it was and Tab stops cycling. The app produces that state with
// responsive utilities (the sidebar's `hidden lg:flex` Collapse toggle is one),
// and this file produces it with the `hidden` attribute, same computed display.
//
// jsdom has no layout engine, so `getClientRects()` returns an empty list for
// every element, a plain visible button included. The hook reads an entirely
// rect-less document as "this environment does not lay out" and skips the
// filter (see getFocusable in useFocusTrap.ts), which is also what keeps the
// other focus tests green here. This file supplies the layout signal itself:
// `Element.prototype.getClientRects` is stubbed to report one client rect (a
// laid out element), and a hidden element overrides the method on its own
// instance to report none, exactly as `display: none` does in a real browser.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useRef, type ReactNode } from "react";

import { useFocusTrap } from "@/components/ui/useFocusTrap";

const NO_RECTS = () => [] as unknown as DOMRectList;
const ONE_RECT = () => [{} as DOMRect] as unknown as DOMRectList;

beforeAll(() => {
  // Run the focus trap's requestAnimationFrame synchronously.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(ONE_RECT);
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  // A test may flip the stub to the rect-less (no layout) implementation.
  vi.mocked(Element.prototype.getClientRects).mockImplementation(ONE_RECT);
});

function Trap({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, () => {});
  return (
    <div ref={ref} role="dialog" aria-label="Trap">
      {children}
    </div>
  );
}

/** Reports no client rects from the moment it is attached (before the effect). */
function hiddenRef(el: HTMLButtonElement | null) {
  if (el) el.getClientRects = NO_RECTS;
}

/**
 * All buttons in the trap, DOM order. `hidden` keeps an element out of the
 * accessibility tree, so the buttons are read from the DOM and not by role: the
 * hidden one has to stay in the list for the assertions to be meaningful.
 */
function buttons(container: HTMLElement) {
  return Array.from(container.querySelectorAll("button"));
}

describe("focus trap with hidden focusable elements", () => {
  it("wraps Tab from the last visible element when the last focusable is hidden", () => {
    const { container } = render(
      <Trap>
        <button>first</button>
        <button>second</button>
        <button ref={hiddenRef} hidden>
          last
        </button>
      </Trap>,
    );
    const [first, second, last] = buttons(container);
    expect(last.hasAttribute("hidden")).toBe(true);

    second.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("wraps Shift+Tab from the first visible element when the first focusable is hidden", () => {
    const { container } = render(
      <Trap>
        <button ref={hiddenRef} hidden>
          first
        </button>
        <button>second</button>
        <button>last</button>
      </Trap>,
    );
    const [first, second, last] = buttons(container);

    second.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    expect(document.activeElement).not.toBe(first);
  });

  it("moves the initial focus to the first visible element", () => {
    const { container } = render(
      <Trap>
        <button ref={hiddenRef} hidden>
          first
        </button>
        <button>second</button>
      </Trap>,
    );
    const [first, second] = buttons(container);
    expect(document.activeElement).toBe(second);
    expect(document.activeElement).not.toBe(first);
  });

  it("still treats a rect-less document (no layout engine) as unfiltered", () => {
    // Guards the fallback itself: with no element reporting any rect the hook
    // must keep wrapping instead of concluding that everything is hidden.
    vi.mocked(Element.prototype.getClientRects).mockImplementation(NO_RECTS);
    const { container } = render(
      <Trap>
        <button>first</button>
        <button>second</button>
      </Trap>,
    );
    const [first, second] = buttons(container);
    second.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });
});
