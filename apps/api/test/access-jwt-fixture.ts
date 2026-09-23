import { generateKeyPair, type JWTPayload, jwtVerify, SignJWT } from "jose";
import type { VerifyAccessJwt } from "../src/http/auth/access-jwt";

export const TEST_ISSUER = "https://test-team.cloudflareaccess.com";
export const TEST_AUD = "test-aud";

let keys: { publicKey: CryptoKey; privateKey: CryptoKey } | null = null;

async function getKeys() {
  if (!keys) {
    const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
    keys = { publicKey, privateKey };
  }
  return keys;
}

/** Signs a fake Cloudflare Access JWT with a locally generated key pair (no network). */
export async function signAccessJwt(claims: JWTPayload): Promise<string> {
  const { privateKey } = await getKeys();
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setIssuer(TEST_ISSUER)
    .setAudience(TEST_AUD)
    .setExpirationTime("5m")
    .sign(privateKey);
}

/**
 * Test double for `VerifyAccessJwt`: verifies against the local key pair
 * instead of fetching a remote JWKS, so the auth middleware's Access-JWT path
 * is exercised end-to-end with zero network calls in tests.
 */
export const testVerifyAccessJwt: VerifyAccessJwt = async (token) => {
  const { publicKey } = await getKeys();
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: TEST_ISSUER,
    audience: TEST_AUD,
  });
  return payload;
};
