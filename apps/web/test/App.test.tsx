import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

describe("App", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Prevents useOwnerSession's probe request from hitting the real
    // network during this composition test; its own behavior is covered by
    // test/session/owner-session.test.ts and useOwnerSession.test.tsx.
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "forbidden", message: "no" } }), {
        status: 403,
      }),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders the brand wordmark", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Inspiration Garden" })).toBeInTheDocument();
  });

  it("renders the canvas host, navbar search and filters entry points", () => {
    render(<App />);

    expect(screen.getByTestId("canvas-host")).toBeInTheDocument();
    expect(screen.getByLabelText("Search the garden")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
  });

  it("renders the loading screen", () => {
    render(<App />);

    expect(screen.getByTestId("loading-screen")).toBeInTheDocument();
  });
});
