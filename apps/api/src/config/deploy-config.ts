/**
 * Deploy-configuration validation.
 *
 * `wrangler.jsonc` ships with placeholder values because this machine has no
 * Cloudflare account, and inventing an account id, Access team domain or AUD
 * tag would be a lie. The risk that creates is specific: a placeholder reaches
 * a real deploy, the Worker boots, `/api/health` answers 200, and owner auth is
 * silently broken — or wide open. This module is the check that catches it.
 *
 * `apps/api/wrangler.jsonc` — `GET /api/health` reads it back as the runtime
 * `vars` bindings and reports whatever is still a placeholder.
 *
 * ## Laziness
 *
 * Nothing here runs at module-import time. The only module-scope values are
 * inert data literals; every comparison, split and parse happens inside
 * `findDeployConfigProblems`, once per request. This is deliberate: a previous
 * session had module-scope initialization crash the running dev server, and
 * `test/worker-entry.test.ts` guards that `import("../src/index")` must never
 * throw.
 *
 * ## Placeholder vs. absent
 *
 * A *placeholder* is a value that was shipped in the config on purpose and
 * must not survive a deploy — the important case, and the one this module
 * exists for. An *absent* binding is a different thing: locally the Access
 * vars are legitimately not set, because local development runs behind
 * `DEV_OWNER_BYPASS` (`apps/api/.dev.vars`) and has no Access application at
 * all. The single signal that separates the two situations is
 * `DEV_OWNER_BYPASS === "true"`, which only ever exists in a local, gitignored
 * `.dev.vars`. A deployed Worker never has it, so its absence is not amnesty.
 *
 * ## What is deliberately not checked here
 *
 * `d1_databases[].database_id`. At runtime `env.DB` exposes only `prepare`,
 * `batch`, `exec`, `withSession`, `query` and `dump` — never the id the
 * database was created with — so a Worker cannot inspect its own config. That
 * placeholder is a manual step (README "Deployment") and
 * `wrangler d1 migrations apply --remote` fails loudly on a wrong id.
 */

/** One thing the owner must fix before the deployment is trustworthy. */
export interface ConfigProblem {
  /** The env binding at fault — stable and greppable. */
  id: string;
  /** What is wrong, and what to do about it. */
  message: string;
}

/** The `wrangler.jsonc` `vars` this module reads. Structurally satisfied by `AppBindings`. */
export interface DeployConfigInput {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  OWNER_EMAIL?: string;
  CORS_ORIGINS?: string;
  DEV_OWNER_BYPASS?: string;
}

/** Bindings whose value is compared against a shipped placeholder. */
type PlaceholderBinding = "ACCESS_TEAM_DOMAIN" | "ACCESS_AUD" | "OWNER_EMAIL";

export interface PlaceholderRequirement {
  binding: PlaceholderBinding;
  /** Values `wrangler.jsonc` ships today that must not reach a real deploy. */
  placeholders: readonly string[];
  /** What breaks in production while this binding is wrong. */
  reason: string;
}

/**
 * The placeholder table — the data-driven half of the check. Adding a var means
 * adding a row here, and `test/wrangler-config.test.ts` then fails if a
 * `wrangler.jsonc` `vars` entry still holds a placeholder this table ignores.
 *
 * Matching is exact rather than heuristic on purpose: a "looks like a
 * placeholder" rule (`/^REPLACE/`, `*.example.com`) would eventually reject a
 * legitimate value — an owner address at a real example-domain registrar, say.
 * A wrong exact match fails safe, reporting nothing, which is the same failure
 * mode as the check not existing; a wrong heuristic actively lies.
 */
export const DEPLOY_CONFIG_PLACEHOLDERS: readonly PlaceholderRequirement[] = [
  {
    binding: "ACCESS_TEAM_DOMAIN",
    placeholders: ["your-team.cloudflareaccess.com"],
    reason:
      "owner Access JWTs are verified against this team domain's JWKS, so every owner login is rejected",
  },
  {
    binding: "ACCESS_AUD",
    placeholders: ["REPLACE_WITH_ACCESS_AUD"],
    reason: "owner Access JWTs are rejected on `aud` mismatch, so every owner login is rejected",
  },
  {
    binding: "OWNER_EMAIL",
    placeholders: ["owner@example.com"],
    reason:
      "no Access-authenticated email ever matches it, so no request is ever treated as the owner",
  },
];

/** Every `vars` binding `GET /api/health` inspects. Kept in step with `wrangler.jsonc` by a test. */
export const REQUIRED_CONFIG_BINDINGS: readonly string[] = [
  ...DEPLOY_CONFIG_PLACEHOLDERS.map((requirement) => requirement.binding),
  "CORS_ORIGINS",
];

/** Hosts that only ever exist on a developer's machine. */
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * True for an allowlist entry that can stand in for the site's own origin in
 * the CSRF guard's allowlist: an absolute `http(s)` origin that is neither
 * loopback nor a wildcard.
 *
 * The `http(s)` requirement is what rejects `*` and `chrome-extension://*`.
 * Both are legitimate `CORS_ORIGINS` entries, but neither can satisfy a
 * same-origin owner write — a bare `*` would instead open the guard to every
 * origin, which is the "wide open" failure this check exists to prevent.
 */
function isWebOrigin(entry: string): boolean {
  if (!/^https?:\/\//.test(entry)) return false;
  try {
    return !LOOPBACK_HOSTS.includes(new URL(entry).hostname);
  } catch {
    return false;
  }
}

/** Splits a comma-separated allowlist the way `cors.ts` and `csrf.ts` both do. */
function parseOrigins(allowlist: string | undefined): string[] {
  return (allowlist ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Reports every deploy-configuration problem in `bindings`. Pure: no I/O, no
 * globals, no mutation of the input, and no result caching — a misconfigured
 * deploy is fixed by editing the config, so a cached verdict would outlive the
 * fix.
 */
export function findDeployConfigProblems(bindings: DeployConfigInput): ConfigProblem[] {
  // The local owner bypass is the one signal that says "this is a laptop, not
  // a deployment": `wrangler dev` behind `DEV_OWNER_BYPASS` needs no Access
  // application and no production origin, so the shipped placeholders are the
  // correct local values rather than a mistake. Strict `"true"` so an empty or
  // malformed value does not silently excuse a real deployment.
  if (bindings.DEV_OWNER_BYPASS === "true") return [];

  const problems: ConfigProblem[] = [];

  for (const requirement of DEPLOY_CONFIG_PLACEHOLDERS) {
    const value = bindings[requirement.binding]?.trim();

    if (value === undefined || value === "") {
      problems.push({
        id: requirement.binding,
        message:
          `${requirement.binding} is not set. It is required in wrangler.jsonc vars: ` +
          `${requirement.reason}.`,
      });
      continue;
    }

    if (requirement.placeholders.includes(value)) {
      problems.push({
        id: requirement.binding,
        message:
          `${requirement.binding} is still the placeholder ${JSON.stringify(value)}. ` +
          `While it is, ${requirement.reason}. Replace it in apps/api/wrangler.jsonc vars.`,
      });
    }
  }

  if (!parseOrigins(bindings.CORS_ORIGINS).some(isWebOrigin)) {
    problems.push({
      id: "CORS_ORIGINS",
      message:
        "CORS_ORIGINS lists no real web origin. The CSRF guard checks same-origin owner " +
        "writes against this same allowlist, so every owner write would fail with " +
        "`403 csrf check failed`. Add the production site's origin to wrangler.jsonc vars " +
        "(exact, no trailing slash) alongside any localhost and extension entries.",
    });
  }

  return problems;
}
