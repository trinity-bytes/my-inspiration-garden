import { describe, expect, it } from "vitest";
import schemaText from "../node_modules/wrangler/config-schema.json?raw";
import configText from "../wrangler.jsonc?raw";

/**
 * Guards the deploy topology that the owner-auth design (T7b) depends on.
 *
 * The Worker serves the built web app from `assets.directory` and only forwards
 * `run_worker_first` globs to Worker code. That makes `run_worker_first` the
 * single switch deciding whether a request reaches a Hono route or is answered
 * by the SPA fallback — so it is asserted here rather than left to a comment.
 */

/**
 * Minimal JSONC reader: strips `//` and slash-star comments, then `JSON.parse`.
 *
 * Needed because the Workers vitest pool has no filesystem (so the config is
 * read via a Vite `?raw` import) and the repo has no direct JSONC parser
 * dependency (wrangler bundles its own). Biome formats `wrangler.jsonc` and
 * rejects trailing commas in JSONC, so comment-stripping alone is enough.
 *
 * The scanner tracks string state, so a value like `https://garden.example.com`
 * — which the owner will paste into `CORS_ORIGINS` — keeps its `//`.
 */
function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;

    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (char === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += char;
  }
  return out;
}

interface WranglerConfig {
  main: string;
  observability?: { enabled?: boolean };
  assets?: {
    directory?: string;
    not_found_handling?: string;
    run_worker_first?: string[] | boolean;
  };
  d1_databases?: { binding: string; database_id: string }[];
  vars?: Record<string, string>;
}

const config = JSON.parse(stripJsonComments(configText)) as WranglerConfig;
const schema = JSON.parse(schemaText) as {
  definitions: Record<
    string,
    { properties?: Record<string, unknown>; additionalProperties?: boolean }
  >;
};

const runWorkerFirst = Array.isArray(config.assets?.run_worker_first)
  ? config.assets.run_worker_first
  : [];

describe("wrangler.jsonc assets (one Worker serves the API and the web app)", () => {
  it("points assets.directory at the web app's build output", () => {
    // Resolved relative to apps/api/wrangler.jsonc, so this is apps/web/dist.
    expect(config.assets?.directory).toBe("../web/dist");
  });

  it("uses the SPA fallback so client-side routes resolve", () => {
    expect(config.assets?.not_found_handling).toBe("single-page-application");
  });

  it("forwards /api/* to Worker code", () => {
    expect(runWorkerFirst).toContain("/api/*");
  });

  it("forwards /auth/* to Worker code", () => {
    // CRITICAL. /auth/login is a real top-level Hono route
    // (src/http/routes/auth.ts) that 302-redirects to "/", and it is the only
    // path Cloudflare Access protects. Without this glob the SPA fallback
    // answers it with index.html + HTTP 200 instead of the redirect, so owner
    // login breaks silently — no error, no failed request, just a dead button.
    expect(runWorkerFirst).toContain("/auth/*");
  });

  it("keeps run_worker_first a list of globs, not `true`", () => {
    // `true` would run Worker code for every static asset request too. That
    // still works, but it forfeits the "static assets are served without
    // invoking the Worker" property the topology was chosen for.
    expect(config.assets?.run_worker_first).not.toBe(true);
  });

  it("does not widen the Worker beyond /api/* and /auth/*", () => {
    expect([...runWorkerFirst].sort()).toEqual(["/api/*", "/auth/*"]);
  });
});

describe("wrangler.jsonc observability", () => {
  it("enables Workers Logs", () => {
    expect(config.observability?.enabled).toBe(true);
  });
});

describe("wrangler.jsonc local-owner escape hatch", () => {
  it("never sets DEV_OWNER_BYPASS as a deployed var", () => {
    // The local bypass belongs only in the gitignored apps/api/.dev.vars.
    // Shipping it in `vars` would make every deployed request the owner.
    expect(config.vars).not.toHaveProperty("DEV_OWNER_BYPASS");
  });
});

describe("wrangler.jsonc against the wrangler config schema", () => {
  it("parses as JSONC (comments stripped, still valid JSON)", () => {
    expect(() => JSON.parse(stripJsonComments(configText))).not.toThrow();
  });

  it("uses only top-level keys the schema allows", () => {
    const allowed = Object.keys(schema.definitions.RawConfig?.properties ?? {});
    for (const key of Object.keys(config)) {
      expect(allowed, `wrangler.jsonc key "${key}" is not in RawConfig.properties`).toContain(key);
    }
  });

  it("uses only keys the schema allows inside assets and observability", () => {
    for (const block of ["Assets", "Observability"] as const) {
      const allowed = Object.keys(schema.definitions[block]?.properties ?? {});
      // biome-ignore lint/suspicious/noExplicitAny: heterogeneous block, only the keys matter.
      const value = (config as any)[block.toLowerCase()] as Record<string, unknown> | undefined;
      for (const key of Object.keys(value ?? {})) {
        expect(allowed, `${block} key "${key}" is not allowed by the schema`).toContain(key);
      }
    }
  });

  it("points main at the Worker entry that stays free of asset serving", () => {
    // src/index.ts is `export default createApp()`. Asset serving is the
    // platform router's job (assets + run_worker_first), not Worker code.
    expect(config.main).toBe("src/index.ts");
  });
});
