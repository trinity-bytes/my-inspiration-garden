import { describe, expect, it } from "vitest";

/**
 * Regression (T12): the OpenAPI document generator (`src/http/openapi.ts`)
 * once built its route table — including every `z.toJSONSchema` call — as a
 * module-level constant. That ran at import time, so any schema conversion
 * failure (e.g. a shared schema using `.transform()`) threw while the Worker
 * was still starting up, crashing the whole API rather than just the one
 * `/api/openapi.json` request. Importing the actual Worker entry module (the
 * file wrangler's `main` points at) must never throw.
 */
describe("Worker entry module", () => {
  it(
    "imports without throwing",
    async () => {
      // Dynamic import under the Cloudflare Workers vitest pool is slow, and
      // slower still under full-workspace concurrent test load — this isn't
      // a perf-sensitive assertion, just a startup-safety regression check.
      await expect(import("../src/index")).resolves.toBeDefined();
    },
    20_000,
  );
});
