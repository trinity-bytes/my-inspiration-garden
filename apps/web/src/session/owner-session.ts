import { listItems } from "../api/endpoints";

export type OwnerSessionStatus = "loading" | "owner" | "visitor";

/**
 * Determines whether the current browser holds an authenticated owner
 * session, without a dedicated "who am I" endpoint (none exists yet — see
 * `docs/api.md`; T7 does not add one).
 *
 * Signal used: `GET /api/items?includeDeleted=true` is rejected with 403
 * for anyone who is not the owner or a write-scope token
 * (`canSeeDeleted` in `apps/api/src/http/routes/items.ts`), and succeeds
 * otherwise. The web app never sends a bearer token, so a 200 here can only
 * come from a Cloudflare Access owner session (`Cf-Access-Jwt-Assertion`,
 * forwarded via the browser's Access cookie on `credentials: "include"`).
 * Any failure — forbidden, network, or an unexpected response — resolves to
 * `"visitor"`: this never over-claims owner privileges.
 */
export async function detectOwnerSession(): Promise<OwnerSessionStatus> {
  try {
    await listItems({ limit: 1, includeDeleted: true });
    return "owner";
  } catch {
    return "visitor";
  }
}
