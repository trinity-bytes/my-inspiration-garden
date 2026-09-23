import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOwnerSession } from "../../src/session/useOwnerSession";

vi.mock("../../src/session/owner-session", () => ({
  detectOwnerSession: vi.fn(),
}));

import { detectOwnerSession } from "../../src/session/owner-session";

describe("useOwnerSession", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts as loading, then resolves to the detected status", async () => {
    vi.mocked(detectOwnerSession).mockResolvedValue("owner");

    const { result } = renderHook(() => useOwnerSession());

    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("owner"));
  });

  it("does not update state after unmount (no act warning / leak)", async () => {
    let resolveDetection!: (status: "owner" | "visitor") => void;
    vi.mocked(detectOwnerSession).mockReturnValue(
      new Promise((resolve) => {
        resolveDetection = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useOwnerSession());
    unmount();

    await act(async () => {
      resolveDetection("visitor");
      await Promise.resolve();
    });

    expect(result.current.status).toBe("loading");
  });
});
