import { createRemoteJWKSet, type JWTPayload, type JWTVerifyGetKey, jwtVerify } from "jose";

export interface AccessJwtEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

/** Verifies a Cloudflare Access JWT assertion and returns its claims. */
export type VerifyAccessJwt = (token: string, env: AccessJwtEnv) => Promise<JWTPayload>;

/** Resolves the JWKS-lookup function to use for a given Access team domain. */
export type GetAccessJwtKey = (teamDomain: string) => JWTVerifyGetKey;

/**
 * Builds a `VerifyAccessJwt` around an injectable key source. This is the
 * single real verification path — it always runs `jose#jwtVerify` (which
 * checks signature, `alg`, and `exp`) with `issuer`/`audience` pinned to the
 * request's configured env, so both production and tests exercise the exact
 * same aud/iss/exp/signature checks. Only where the key comes from differs:
 * production resolves it from Cloudflare Access's remote JWKS; tests inject
 * a `getKey` backed by a locally generated key pair, so no network call is
 * ever made in the test suite.
 */
export function createAccessJwtVerifier(getKey: GetAccessJwtKey): VerifyAccessJwt {
  return async (token, env) => {
    if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
      throw new Error("Cloudflare Access is not configured (ACCESS_TEAM_DOMAIN/ACCESS_AUD)");
    }
    const { payload } = await jwtVerify(token, getKey(env.ACCESS_TEAM_DOMAIN), {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
    });
    return payload;
  };
}

// Cached per team domain so repeated requests reuse jose's own JWKS cache
// instead of re-creating a resolver (and re-fetching keys) every request.
const remoteJwksCache = new Map<string, JWTVerifyGetKey>();

function getRemoteJwks(teamDomain: string): JWTVerifyGetKey {
  let jwks = remoteJwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    remoteJwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

/**
 * Production implementation: fetches the team's JWKS over the network.
 * Tests should inject a `VerifyAccessJwt` built from `createAccessJwtVerifier`
 * with a locally generated key pair instead (see `test/access-jwt-fixture.ts`).
 */
export const defaultVerifyAccessJwt: VerifyAccessJwt = createAccessJwtVerifier(getRemoteJwks);
