// @vitest-environment jsdom
//
// The depsight link inside the security page's info banner sits inside a
// sentence of text-content-tertiary text; color alone (brand-300 vs the
// surrounding grey, 2.25:1) does not mark it as a link (axe
// link-in-text-block). It must carry a permanent `underline` utility, not
// just `hover:underline`.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SecurityPage from "@/app/(app)/security/page";

afterEach(cleanup);

describe("security page info banner link", () => {
  it("underlines the banner link permanently (not only on hover)", () => {
    render(<SecurityPage />);
    const link = screen.getByRole("link", { name: "depsight in a new tab" });
    expect(link).toHaveClass("underline");
    expect(link).toHaveClass("underline-offset-2");
    expect(link).toHaveClass("hover:text-brand-200");
    expect(link).not.toHaveClass("hover:underline");
  });
});
