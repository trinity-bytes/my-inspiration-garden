import { describe, expect, it } from "vitest";
import { motionPolicyFor } from "../../src/canvas/reduced-motion";

describe("motionPolicyFor", () => {
  it("disables auto drift and inertia glide when reduced", () => {
    expect(motionPolicyFor(true)).toEqual({
      autoDrift: false,
      inertiaGlide: false,
    });
  });

  it("enables everything when motion is not reduced", () => {
    expect(motionPolicyFor(false)).toEqual({
      autoDrift: true,
      inertiaGlide: true,
    });
  });
});
