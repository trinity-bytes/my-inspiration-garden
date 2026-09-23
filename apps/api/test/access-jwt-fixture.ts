import { generateKeyPair, type JWTPayload, SignJWT } from "jose";
import { createAccessJwtVerifier } from "../src/http/auth/access-jwt";

export const TEST_ISSUER = "https://test-team.cloudflareaccess.com";
export const TEST_AUD = "test-aud";

let keys: { publicKey: CryptoKey; privateKey: CryptoKey } | null = null;

export async function getTestKeys() {
  if (!keys) {
    const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
    keys = { publicKey, privateKey };
  }
  return keys;
}

/** Signs a fake Cloudflare Access JWT with a locally generated key pair (no network). */
export async function signAccessJwt(
  claims: JWTPayload,
  overrides: { issuer?: string; audience?: string; expiresInSeconds?: number } = {},
): Promise<string> {
  const { privateKey } = await getTestKeys();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setIssuer(overrides.issuer ?? TEST_ISSUER)
    .setAudience(overrides.audience ?? TEST_AUD)
    .setExpirationTime(now + (overrides.expiresInSeconds ?? 300))
    .sign(privateKey);
}

/**
 * Test double for `VerifyAccessJwt`: runs the exact same `createAccessJwtVerifier`
 * production code path (real aud/iss/exp/signature checks via jose#jwtVerify),
 * only the key source differs — a locally generated key pair instead of a
 * remote JWKS fetch, so the auth middleware's Access-JWT path is exercised
 * end-to-end with zero network calls in tests.
 */
export const testVerifyAccessJwt = createAccessJwtVerifier(() => {
  return async () => (await getTestKeys()).publicKey;
});
