// @vitest-environment jsdom
//
// Badge keeps its text on one line by default, so a status pill never breaks
// into two lines at 390 px. A caller that shows a long server string passes
// `wrap` to allow wrapping. jsdom has no layout, so the Tailwind class is pinned.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/Badge";

afterEach(cleanup);

describe("Badge wrapping", () => {
  it("does not wrap by default", () => {
    render(<Badge>Not configured</Badge>);
    expect(screen.getByText("Not configured")).toHaveClass("whitespace-nowrap");
  });

  it("allows wrapping with the wrap prop", () => {
    render(<Badge wrap>A long error message</Badge>);
    expect(screen.getByText("A long error message")).not.toHaveClass("whitespace-nowrap");
  });

  it("keeps wrap=false the same as the default", () => {
    render(<Badge wrap={false}>Plain</Badge>);
    expect(screen.getByText("Plain")).toHaveClass("whitespace-nowrap");
  });
});
