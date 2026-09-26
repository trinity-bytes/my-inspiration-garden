import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CanvasHost } from "../../src/components/CanvasHost/CanvasHost";

describe("CanvasHost", () => {
  it("renders the canvas host container", () => {
    render(<CanvasHost />);
    expect(screen.getByTestId("canvas-host")).toBeInTheDocument();
  });

  it("exposes a focusable, labeled navigation region (jsdom has no WebGL, so the engine takes its fallback path)", () => {
    render(<CanvasHost />);
    const target = screen.getByLabelText(
      "Inspiration garden canvas. Move the cursor, drag, or use arrow keys to look around.",
    );
    expect(target).toHaveAttribute("tabIndex", "0");
  });

  it("calls onReady once the engine resolves readiness (WebGL-unavailable fallback still fires it)", async () => {
    let ready = false;
    render(<CanvasHost onReady={() => (ready = true)} />);

    await waitFor(() => expect(ready).toBe(true));
  });

  it("unmounts cleanly (dispose does not throw)", () => {
    const { unmount } = render(<CanvasHost />);
    expect(() => unmount()).not.toThrow();
  });

  it("shows a subtle empty-state message when there are no items, and the canvas still renders", () => {
    render(<CanvasHost itemsStatus="empty" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "The garden is empty for now — nothing to show yet.",
    );
    expect(screen.getByTestId("canvas-host")).toBeInTheDocument();
  });

  it("shows a subtle error message when the items fetch failed", () => {
    render(<CanvasHost itemsStatus="error" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Couldn't load the garden's items right now.",
    );
  });

  it("shows no message once items are ready", () => {
    render(<CanvasHost itemsStatus="ready" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("exposes an (initially empty, jsdom has no WebGL to compute visible cards) parallel DOM/ARIA card list", () => {
    render(<CanvasHost items={[]} />);
    expect(
      screen.getByRole("list", { name: "Garden items currently in view" }),
    ).toBeInTheDocument();
  });

  it("accepts a paused prop (T9 detail modal) and re-renders cleanly when it toggles", () => {
    const { rerender } = render(<CanvasHost paused={false} />);
    expect(() => rerender(<CanvasHost paused={true} />)).not.toThrow();
    expect(() => rerender(<CanvasHost paused={false} />)).not.toThrow();
  });

  it("reflects the paused prop as data-paused (test/tooling hook, e.g. for App's filter-panel wiring)", () => {
    const { rerender } = render(<CanvasHost paused={false} />);
    expect(screen.getByTestId("canvas-host")).toHaveAttribute("data-paused", "false");

    rerender(<CanvasHost paused={true} />);
    expect(screen.getByTestId("canvas-host")).toHaveAttribute("data-paused", "true");
  });
});
