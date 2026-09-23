import type { Actor } from "./types";

/** Human/agent label recorded as `item_revisions.actor` for a mutation. */
export function actorLabel(actor: Actor): string {
  if (actor.type === "owner") return "owner";
  if (actor.type === "token") return `agent:${actor.name}`;
  return "anonymous";
}

/**
 * Derives an item's `source` server-side instead of trusting the client body
 * outright, so a token can never claim `source: "web"` and an owner request
 * can't spoof `agent:<name>`:
 *   - owner (web/Access session): `"web"`, unless the body explicitly opts
 *     into an allowed client source (`extension` | `pwa`) — forward
 *     compatibility for the owner using those clients once they exist.
 *   - token: `agent:<token name>` by default; a client using a bearer token
 *     (extension/PWA, not an agent) identifies itself via the
 *     `X-Garden-Client: extension|pwa` request header instead.
 */
export function computeItemSource(
  actor: Actor,
  bodySource: unknown,
  clientHeader: string | undefined,
): string {
  if (actor.type === "owner") {
    if (bodySource === "extension" || bodySource === "pwa") return bodySource;
    return "web";
  }
  if (actor.type === "token") {
    if (clientHeader === "extension" || clientHeader === "pwa") return clientHeader;
    return `agent:${actor.name}`;
  }
  return "web";
}
