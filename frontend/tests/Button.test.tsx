// @vitest-environment jsdom
//
// Button variant classes. The danger variant must use the dedicated
// --danger-solid background token (white text on --accent-red #f87171 is
// 2.77:1, below WCAG AA; white on --danger-solid #dc2626 is 4.83:1 and on
// the hover token #b91c1c 6.47:1 - the ratios themselves are pinned by
// contrast-tokens.test.ts, this test pins the wiring).
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/Button";

afterEach(cleanup);

describe("Button danger variant", () => {
  it("uses the solid danger background tokens, not the light accent red", () => {
    render(
      <Button variant="danger">
        Remove
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Remove" });
    expect(btn).toHaveClass("bg-danger-solid");
    expect(btn).toHaveClass("text-white");
    expect(btn).toHaveClass("hover:bg-danger-solid-hover");
    expect(btn).not.toHaveClass("bg-accent-red");
    expect(btn.className).not.toContain("bg-accent-red/");
  });
});
