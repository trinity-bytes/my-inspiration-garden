import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";

export interface AccessJwtEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

/** Verifies a Cloudflare Access JWT assertion and returns its claims. */
export type VerifyAccessJwt = (token: string, env: AccessJwtEnv) => Promise<JWTPayload>;

// Cached per team domain so repeated requests reuse jose's own JWKS cache
// instead of re-creating a resolver (and re-fetching keys) every request.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

/**
 * Production implementation: fetches the team's JWKS over the network and
 * verifies `aud`/`iss` against the configured env. Tests should instead
 * inject a `VerifyAccessJwt` built from a locally generated key pair (see
 * `createAuthMiddleware`'s `verifyAccessJwt` option) so no network call is
 * ever made in the test suite.
 */
export const defaultVerifyAccessJwt: VerifyAccessJwt = async (token, env) => {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new Error("Cloudflare Access is not configured (ACCESS_TEAM_DOMAIN/ACCESS_AUD)");
  }
  const { payload } = await jwtVerify(token, getJwks(env.ACCESS_TEAM_DOMAIN), {
    issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
    audience: env.ACCESS_AUD,
  });
  return payload;
};
