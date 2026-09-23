import { render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useKeyboardShortcut } from "../../src/hooks/useKeyboardShortcut";

function Harness({ onTrigger }: { onTrigger: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useKeyboardShortcut("k", onTrigger);
  return <input ref={inputRef} aria-label="search" />;
}

describe("useKeyboardShortcut", () => {
  it("invokes the callback on Ctrl+K", () => {
    const onTrigger = vi.fn();
    render(<Harness onTrigger={onTrigger} />);

    const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true });
    document.dispatchEvent(event);

    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("invokes the callback on Cmd+K (metaKey)", () => {
    const onTrigger = vi.fn();
    render(<Harness onTrigger={onTrigger} />);

    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
    document.dispatchEvent(event);

    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("prevents the browser default action so it does not clash with the address bar", () => {
    const onTrigger = vi.fn();
    render(<Harness onTrigger={onTrigger} />);

    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores the key without a modifier", () => {
    const onTrigger = vi.fn();
    render(<Harness onTrigger={onTrigger} />);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("ignores unrelated keys with a modifier", () => {
    const onTrigger = vi.fn();
    render(<Harness onTrigger={onTrigger} />);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "j", ctrlKey: true, bubbles: true }),
    );

    expect(onTrigger).not.toHaveBeenCalled();
  });
});
