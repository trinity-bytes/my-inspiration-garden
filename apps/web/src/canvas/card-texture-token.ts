/**
 * A pool entry's texture-load callbacks (`layers/cards.ts`'s
 * `assignTexture`: thumbnail success, thumbnail failure, fallback-placeholder
 * load) are guarded by a monotonically increasing `loadToken` bumped every
 * time the entry is reassigned to a different card instance. Each callback
 * closes over the token in effect when its load started. By the time an
 * async callback resolves, the pool entry may already have moved on to a
 * different item (pool entries are reused, not recreated); applying a stale
 * callback's result then would corrupt the entry's current texture pin
 * and/or `u_map` uniform with a value that belongs to an item it no longer
 * renders. Pure and framework-free so the decision is unit-testable without
 * three.js (see `test/canvas/card-texture-token.test.ts`); `layers/cards.ts`
 * must check this before any pin/unpin or uniform side effect inside a
 * texture-load callback.
 */
export function isStaleLoadCallback(currentLoadToken: number, capturedToken: number): boolean {
  return currentLoadToken !== capturedToken;
}
