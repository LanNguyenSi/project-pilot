// @vitest-environment jsdom
//
// Modal mounting and the focus trap's Escape handling. Runs under jsdom (see
// vitest.config.ts).
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { Modal } from "@/components/ui/Modal";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("Modal mounting", () => {
  it("renders nothing during the server render, even when open", () => {
    const html = renderToString(
      <Modal open onClose={() => {}} title="Hello">
        <p>body</p>
      </Modal>,
    );
    expect(html).toBe("");
  });

  it("renders the dialog on the client when open", () => {
    render(
      <Modal open onClose={() => {}} title="Hello">
        <p>body</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("renders nothing while closed", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hello">
        <p>body</p>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("useFocusTrap through Modal", () => {
  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hello">
        <p>body</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls the latest onClose after a re-render, not the first one", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <Modal open onClose={first} title="Hello">
        <p>body</p>
      </Modal>,
    );
    rerender(
      <Modal open onClose={second} title="Hello">
        <p>body</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("locks body scroll while open and releases it on close", () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Hello">
        <p>body</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <Modal open={false} onClose={() => {}} title="Hello">
        <p>body</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("");
  });
});
