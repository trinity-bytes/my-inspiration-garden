import { describe, expect, it } from "vitest";
import { findDeployConfigProblems } from "../src/config/deploy-config";

/**
 * `apps/api/wrangler.jsonc` ships with placeholder values on purpose — this
 * machine has no Cloudflare account, and inventing an account id, Access team
 * domain or AUD tag would be a lie. The risk is that a placeholder reaches a
 * real deploy: the Worker boots, `/api/health` answers 200, and owner auth is
 * silently broken (or wide open). These tests pin the detection.
 */

/** A correctly configured deployment. No value is a placeholder. */
const CONFIGURED = {
  ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
  ACCESS_AUD: "9f8e7d6c5b4a39281706f5e4d3c2b1a0",
  OWNER_EMAIL: "owner@real-domain.dev",
  CORS_ORIGINS: "https://garden.example.com",
};

/** The exact values `apps/api/wrangler.jsonc` ships today. */
const SHIPPED = {
  ACCESS_TEAM_DOMAIN: "your-team.cloudflareaccess.com",
  ACCESS_AUD: "REPLACE_WITH_ACCESS_AUD",
  OWNER_EMAIL: "owner@example.com",
  CORS_ORIGINS: "http://localhost:5173",
};

const ALL_PLACEHOLDER_IDS = ["ACCESS_AUD", "ACCESS_TEAM_DOMAIN", "CORS_ORIGINS", "OWNER_EMAIL"];

function problemIds(input: Parameters<typeof findDeployConfigProblems>[0]): string[] {
  return findDeployConfigProblems(input)
    .map((problem) => problem.id)
    .sort();
}

describe("findDeployConfigProblems — a correctly configured deployment", () => {
  it("reports nothing", () => {
    expect(findDeployConfigProblems(CONFIGURED)).toEqual([]);
  });

  it("reports nothing when local origins sit alongside the production one", () => {
    // Developers keep localhost in the list; that is additive, not a problem.
    const input = {
      ...CONFIGURED,
      CORS_ORIGINS: "http://localhost:5173,https://garden.example.com",
    };
    expect(findDeployConfigProblems(input)).toEqual([]);
  });
});

describe("findDeployConfigProblems — placeholders that survived into a deploy", () => {
  it("reports a problem for each shipped placeholder", () => {
    expect(problemIds(SHIPPED)).toEqual(ALL_PLACEHOLDER_IDS);
  });

  for (const binding of ["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "OWNER_EMAIL"] as const) {
    it(`reports ${binding} on its own`, () => {
      expect(problemIds({ ...CONFIGURED, [binding]: SHIPPED[binding] })).toEqual([binding]);
    });
  }

  it("names the binding in the message so it can be grepped", () => {
    for (const problem of findDeployConfigProblems(SHIPPED)) {
      expect(problem.message).toContain(problem.id);
      expect(problem.message.length).toBeGreaterThan(0);
    }
  });

  it("still reports a placeholder that is surrounded by real values", () => {
    // The realistic mistake: three of four filled in, one forgotten.
    const input = { ...CONFIGURED, ACCESS_AUD: "REPLACE_WITH_ACCESS_AUD" };
    expect(problemIds(input)).toEqual(["ACCESS_AUD"]);
  });
});

describe("findDeployConfigProblems — bindings that are not set at all", () => {
  it("reports an absent binding", () => {
    const { OWNER_EMAIL: _omitted, ...rest } = CONFIGURED;
    expect(problemIds(rest)).toEqual(["OWNER_EMAIL"]);
  });

  it("reports an empty binding", () => {
    expect(problemIds({ ...CONFIGURED, ACCESS_AUD: "" })).toEqual(["ACCESS_AUD"]);
  });

  it("reports an absent CORS_ORIGINS", () => {
    const { CORS_ORIGINS: _omitted, ...rest } = CONFIGURED;
    expect(problemIds(rest)).toEqual(["CORS_ORIGINS"]);
  });
});

describe("findDeployConfigProblems — the local development escape hatch", () => {
  // `apps/api/.dev.vars` sets DEV_OWNER_BYPASS=true and local runs have no
  // Cloudflare Access at all. Shipping the placeholders locally is expected,
  // so a bypass is the one signal that says "this is not a deploy".
  it("reports nothing when the local owner bypass is on", () => {
    expect(findDeployConfigProblems({ ...SHIPPED, DEV_OWNER_BYPASS: "true" })).toEqual([]);
  });

  it("reports nothing for bare local dev, with no bindings configured at all", () => {
    expect(findDeployConfigProblems({ DEV_OWNER_BYPASS: "true" })).toEqual([]);
  });

  it("still reports placeholders when the bypass is explicitly off", () => {
    expect(problemIds({ ...SHIPPED, DEV_OWNER_BYPASS: "false" })).toEqual(ALL_PLACEHOLDER_IDS);
  });

  it("still reports placeholders when no bypass var is set at all", () => {
    // A deployed Worker never has DEV_OWNER_BYPASS, so its absence is not
    // amnesty — it is the normal production case.
    expect(problemIds(SHIPPED)).toEqual(ALL_PLACEHOLDER_IDS);
  });

  it("does not read an empty bypass value as local dev", () => {
    expect(problemIds({ ...SHIPPED, DEV_OWNER_BYPASS: "" })).toEqual(ALL_PLACEHOLDER_IDS);
  });
});

describe("findDeployConfigProblems — CORS_ORIGINS", () => {
  // The CSRF guard checks same-origin owner writes against this same allowlist,
  // so a localhost-only list means every owner write fails with
  // `403 csrf check failed` in production.
  it("reports a localhost-only allowlist", () => {
    expect(problemIds({ ...CONFIGURED, CORS_ORIGINS: "http://localhost:5173" })).toEqual([
      "CORS_ORIGINS",
    ]);
  });

  it("reports a 127.0.0.1-only allowlist", () => {
    expect(problemIds({ ...CONFIGURED, CORS_ORIGINS: "http://127.0.0.1:5173" })).toEqual([
      "CORS_ORIGINS",
    ]);
  });

  it("reports a bare wildcard, which opens the CSRF guard to every origin", () => {
    expect(problemIds({ ...CONFIGURED, CORS_ORIGINS: "*" })).toEqual(["CORS_ORIGINS"]);
  });

  it("reports an allowlist of only extension wildcards", () => {
    // `chrome-extension://*` is legitimate, but it is not a web origin, so it
    // cannot stand in for the site's own origin in the CSRF allowlist.
    expect(
      problemIds({ ...CONFIGURED, CORS_ORIGINS: "chrome-extension://*,moz-extension://*" }),
    ).toEqual(["CORS_ORIGINS"]);
  });

  it("reports an allowlist of only separators", () => {
    expect(problemIds({ ...CONFIGURED, CORS_ORIGINS: " , , " })).toEqual(["CORS_ORIGINS"]);
  });

  it("accepts a real origin next to extension wildcards", () => {
    const input = {
      ...CONFIGURED,
      CORS_ORIGINS: "https://garden.example.com,chrome-extension://*",
    };
    expect(findDeployConfigProblems(input)).toEqual([]);
  });

  it("tolerates surrounding whitespace", () => {
    const input = { ...CONFIGURED, CORS_ORIGINS: "  https://garden.example.com , , " };
    expect(findDeployConfigProblems(input)).toEqual([]);
  });
});

describe("findDeployConfigProblems — purity", () => {
  it("does not mutate the bindings it is given", () => {
    const input = { ...SHIPPED };
    const before = JSON.stringify(input);
    findDeployConfigProblems(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("returns the same result for the same input", () => {
    expect(findDeployConfigProblems(SHIPPED)).toEqual(findDeployConfigProblems(SHIPPED));
  });
});
