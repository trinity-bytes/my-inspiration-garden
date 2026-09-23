import { generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { createAccessJwtVerifier } from "../src/http/auth/access-jwt";
import { getTestKeys, signAccessJwt, TEST_AUD, TEST_ISSUER } from "./access-jwt-fixture";

const TEAM_DOMAIN = "test-team.cloudflareaccess.com";
const TEST_ENV = { ACCESS_TEAM_DOMAIN: TEAM_DOMAIN, ACCESS_AUD: TEST_AUD };

/**
 * Unit-level coverage of the REAL production verification path
 * (`createAccessJwtVerifier`) — the only thing swapped for tests is the key
 * source (a local key pair instead of a remote JWKS fetch); every check
 * exercised here (aud/iss/exp/signature) is the exact code `defaultVerifyAccessJwt`
 * runs in production.
 */
function verifierWithLocalKey() {
  return createAccessJwtVerifier(() => async () => (await getTestKeys()).publicKey);
}

describe("createAccessJwtVerifier", () => {
  it("accepts a valid token (correct aud, issuer, signature, not expired)", async () => {
    const verify = verifierWithLocalKey();
    const jwt = await signAccessJwt({ email: "owner@test.dev" });
    const payload = await verify(jwt, TEST_ENV);
    expect(payload.email).toBe("owner@test.dev");
  });

  it("rejects a token signed for the wrong audience", async () => {
    const verify = verifierWithLocalKey();
    const jwt = await signAccessJwt({ email: "owner@test.dev" }, { audience: "some-other-aud" });
    await expect(verify(jwt, TEST_ENV)).rejects.toThrow();
  });

  it("rejects a token signed by the wrong issuer", async () => {
    const verify = verifierWithLocalKey();
    const jwt = await signAccessJwt(
      { email: "owner@test.dev" },
      { issuer: "https://someone-elses-team.cloudflareaccess.com" },
    );
    await expect(verify(jwt, TEST_ENV)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const verify = verifierWithLocalKey();
    const jwt = await signAccessJwt({ email: "owner@test.dev" }, { expiresInSeconds: -10 });
    await expect(verify(jwt, TEST_ENV)).rejects.toThrow();
  });

  it("rejects a token with correct claims but signed by a different key pair (forged/foreign token)", async () => {
    const verify = verifierWithLocalKey();
    const { privateKey: foreignPrivateKey } = await generateKeyPair("RS256", { extractable: true });
    const forgedJwt = await new SignJWT({ email: "owner@test.dev" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt()
      .setIssuer(TEST_ISSUER)
      .setAudience(TEST_AUD)
      .setExpirationTime("5m")
      .sign(foreignPrivateKey);
    await expect(verify(forgedJwt, TEST_ENV)).rejects.toThrow();
  });

  it("throws when Access env is not configured", async () => {
    const verify = verifierWithLocalKey();
    const jwt = await signAccessJwt({ email: "owner@test.dev" });
    await expect(verify(jwt, {})).rejects.toThrow();
  });
});
