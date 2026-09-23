import { getSession } from "../api/endpoints";

export type OwnerSessionStatus = "loading" | "owner" | "visitor";

/**
 * Determines whether the current browser holds an authenticated owner
 * session via the dedicated `GET /api/session` endpoint (see
 * `docs/api.md`): positive proof only, `role: "owner"` exactly when the API
 * resolved the actor as the owner. Any failure — network, non-2xx status, or
 * an unexpected response shape — resolves to `"visitor"`: this never
 * over-claims owner privileges, and it only ever affects UI (showing the
 * "Sign out" link, etc.) — the API independently enforces write
 * authorization on every request regardless of what this returns.
 */
export async function detectOwnerSession(): Promise<OwnerSessionStatus> {
  try {
    const { role } = await getSession();
    return role;
  } catch {
    return "visitor";
  }
}
