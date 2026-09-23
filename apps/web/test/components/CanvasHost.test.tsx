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
});
