import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../src/index";

describe("@garden/shared", () => {
  it("exports the current schema version", () => {
    expect(SCHEMA_VERSION).toBe("0.1.0");
  });
});
