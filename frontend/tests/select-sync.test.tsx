// @vitest-environment jsdom
//
// Select keeps its highlighted option in sync with value and options while open.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Select } from "@/components/ui/Select";

// jsdom has no scrollIntoView; Select calls it for the active option.
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);

const OPTS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

function active(): string | null {
  const id = screen.getByRole("combobox").getAttribute("aria-activedescendant");
  return id ? id.slice(id.lastIndexOf("-opt-") + 5) : null;
}

describe("Select highlighted option", () => {
  it("highlights nothing while closed", () => {
    render(<Select options={OPTS} value="b" onChange={() => {}} />);
    expect(active()).toBeNull();
  });

  it("highlights the selected option when opened", () => {
    render(<Select options={OPTS} value="b" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(active()).toBe("1");
  });

  it("highlights nothing when the value is not in the options", () => {
    render(<Select options={OPTS} value="zzz" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(active()).toBeNull();
  });

  it("re-syncs to the new value while open", () => {
    const { rerender } = render(<Select options={OPTS} value="a" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(active()).toBe("0");
    rerender(<Select options={OPTS} value="c" onChange={() => {}} />);
    expect(active()).toBe("2");
  });

  it("re-syncs when the options change while open", () => {
    const { rerender } = render(<Select options={OPTS} value="b" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(active()).toBe("1");
    rerender(<Select options={[OPTS[1], OPTS[0], OPTS[2]]} value="b" onChange={() => {}} />);
    expect(active()).toBe("0");
  });

  it("keeps the hovered option across a re-render with the same props", () => {
    const { rerender } = render(<Select options={OPTS} value="a" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.mouseEnter(screen.getAllByRole("option")[2]);
    expect(active()).toBe("2");
    rerender(<Select options={OPTS} value="a" onChange={() => {}} />);
    expect(active()).toBe("2");
  });

  it("resets to the selected option on the next open", () => {
    render(<Select options={OPTS} value="a" onChange={() => {}} />);
    const box = screen.getByRole("combobox");
    fireEvent.click(box);
    fireEvent.mouseEnter(screen.getAllByRole("option")[2]);
    fireEvent.click(box);
    fireEvent.click(box);
    expect(active()).toBe("0");
  });

  it("closes on a mousedown outside", () => {
    render(<Select options={OPTS} value="a" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
