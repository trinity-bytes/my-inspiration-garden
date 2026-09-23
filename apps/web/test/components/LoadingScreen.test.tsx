import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingScreen } from "../../src/components/LoadingScreen/LoadingScreen";

describe("LoadingScreen", () => {
  it("is visible to assistive tech while not ready", () => {
    render(<LoadingScreen ready={false} message="Loading the garden…" />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading the garden…");
    expect(status).not.toHaveAttribute("aria-hidden");
  });

  it("is hidden from assistive tech once ready", () => {
    render(<LoadingScreen ready={true} message="Loading the garden…" />);

    const status = screen.getByText("Loading the garden…");
    expect(status.closest('[data-testid="loading-screen"]')).toHaveAttribute("aria-hidden", "true");
  });
});
