// NOTE: pinned to @cloudflare/vitest-pool-workers 0.12.0 + vitest 3.2.x.
// From 0.13.0 the package drops vitest support to require vitest ^4.1.0 and
// removes the documented `defineWorkersConfig` helper (no `./config` export,
// no replacement documented at time of writing) — see T1 report for details.
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
  },
});
