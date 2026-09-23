import { describe, expect, it } from "vitest";
import { apiTokenPublicSchema, scopeSatisfies, tokenScopeSchema } from "../src/token";

describe("tokenScopeSchema", () => {
  it("accepts read and write", () => {
    expect(tokenScopeSchema.safeParse("read").success).toBe(true);
    expect(tokenScopeSchema.safeParse("write").success).toBe(true);
  });

  it("rejects unknown scopes", () => {
    expect(tokenScopeSchema.safeParse("admin").success).toBe(false);
  });
});

describe("scopeSatisfies", () => {
  it("write implies read", () => {
    expect(scopeSatisfies("write", "read")).toBe(true);
    expect(scopeSatisfies("write", "write")).toBe(true);
  });

  it("read does not imply write", () => {
    expect(scopeSatisfies("read", "read")).toBe(true);
    expect(scopeSatisfies("read", "write")).toBe(false);
  });
});

describe("apiTokenPublicSchema", () => {
  it("never exposes a raw token secret field", () => {
    const parsed = apiTokenPublicSchema.parse({
      id: "01J8Z6Q7GZ7YV1N7Q9K2X3M4A5",
      name: "agent-1",
      scope: "read",
      createdAt: "2026-09-23T12:00:00.000Z",
    });
    expect(parsed).not.toHaveProperty("token");
    expect(parsed).not.toHaveProperty("tokenHash");
  });
});
