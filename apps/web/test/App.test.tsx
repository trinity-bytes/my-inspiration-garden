import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

describe("App", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Prevents useOwnerSession's probe request from hitting the real
    // network during this composition test; its own behavior is covered by
    // test/session/owner-session.test.ts and useOwnerSession.test.tsx.
    // `mockImplementation` (not `mockResolvedValue`) so every call gets its
    // own `Response` instance: `Navbar`'s T10 filter-option loads
    // (`getCategoryTree`/`getTags`) now fetch alongside `useOwnerSession`'s
    // probe, and a `Response` body can only be read (`.json()`) once — a
    // single shared instance would make the second reader's parse throw.
    globalThis.fetch = vi.fn().mockImplementation(
      async () =>
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

  it("does not show a sign-out link for a visitor session", async () => {
    render(<App />);

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Sign out" })).not.toBeInTheDocument(),
    );
  });

  it("shows a sign-out link once the owner session resolves", async () => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ role: "owner" }), { status: 200 }),
      );

    render(<App />);

    await waitFor(() => expect(screen.getByRole("link", { name: "Sign out" })).toBeInTheDocument());
  });

  it("shows a subtle canvas message when the items fetch fails (the every-request 403 above)", async () => {
    render(<App />);

    await waitFor(() =>
      expect(screen.getByText("Couldn't load the garden's items right now.")).toBeInTheDocument(),
    );
    // The sky/canvas host still renders alongside the message.
    expect(screen.getByTestId("canvas-host")).toBeInTheDocument();
  });
});
