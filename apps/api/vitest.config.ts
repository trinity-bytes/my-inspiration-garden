import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(dirname, "migrations"));

  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          // Wrangler loads the gitignored `.dev.vars` into tests too; pin the
          // local owner bypass off so auth tests behave the same either way.
          bindings: { TEST_MIGRATIONS: migrations, DEV_OWNER_BYPASS: "false" },
        },
        wrangler: { configPath: "./wrangler.jsonc" },
      }),
    ],
  };
});
