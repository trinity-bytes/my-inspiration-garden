/// <reference path="../node_modules/@cloudflare/vitest-plugin/types/cloudflare-test.d.ts" />

import type { D1Migration } from "@cloudflare/vitest-plugin";

// This file has top-level imports, which makes it a module; without
// `declare global` the namespace merge below would stay module-local instead
// of augmenting the real ambient `Cloudflare.Env`.
declare global {
  namespace Cloudflare {
    interface Env {
      /** Injected by vitest.config.ts via readD1Migrations(); applied in beforeAll. */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
