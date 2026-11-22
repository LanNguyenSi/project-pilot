// @vitest-environment jsdom
//
// The depsight iframe on /security must keep exactly the sandbox flags the
// page needs (scripts + same-origin for the NextAuth session, forms for
// login, popups for external links depsight renders). Popups opened from
// the frame must stay sandboxed: no allow-popups-to-escape-sandbox, so an
// advisory or GitHub PR tab depsight opens keeps the same flags, and no
// allow-top-navigation* flag lets the frame or its popups navigate the
// embedding page.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SecurityPage from "@/app/(app)/security/page";

afterEach(cleanup);

const REQUIRED_FLAGS = [
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-popups",
];

function sandboxTokens(): string[] {
  render(<SecurityPage />);
  const iframe = screen.getByTitle("depsight");
  return (iframe.getAttribute("sandbox") ?? "").split(/\s+/).filter(Boolean);
}

describe("security page depsight iframe sandbox", () => {
  it("carries exactly the four required sandbox flags", () => {
    expect(new Set(sandboxTokens())).toEqual(new Set(REQUIRED_FLAGS));
  });

  it("does not let popups escape the sandbox", () => {
    const tokens = sandboxTokens();
    expect(tokens).not.toContain("allow-popups-to-escape-sandbox");
  });

  it("does not allow top navigation from the frame or its popups", () => {
    const tokens = sandboxTokens();
    expect(
      tokens.filter((token) => token.startsWith("allow-top-navigation")),
    ).toEqual([]);
  });
});
