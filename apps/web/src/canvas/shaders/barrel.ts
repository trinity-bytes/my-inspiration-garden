/**
 * Full-screen barrel post-process: for each output pixel, finds where in
 * the (undistorted) rendered scene it should sample from by inverting the
 * forward barrel mapping (see `../distortion.ts`, kept in sync by hand —
 * this is the GLSL twin of `barrelInverse`), then fades softly at the
 * edges so the effect never hard-clips.
 */
export const BARREL_FRAGMENT_GLSL = /* glsl */ `
uniform sampler2D u_scene;
uniform float u_k;
uniform float u_aspect;
varying vec2 vUv;

vec2 barrelInverse(vec2 p, float k) {
  float rd = length(p);
  if (rd < 1e-6 || k == 0.0) {
    return p;
  }
  float ru = rd;
  for (int i = 0; i < 6; i++) {
    float f = ru * (1.0 + k * ru * ru) - rd;
    float fPrime = 1.0 + 3.0 * k * ru * ru;
    ru -= f / fPrime;
  }
  return p * (ru / rd);
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec2 aspectCorrected = vec2(ndc.x * u_aspect, ndc.y);

  vec2 worldNdc = barrelInverse(aspectCorrected, u_k);
  worldNdc.x /= u_aspect;

  vec2 sampleUv = worldNdc * 0.5 + 0.5;

  // \`length(ndc)\` is 1.0 at the midpoint of every edge and sqrt(2) at the
  // corners; fading only starts well past the edges so the falloff stays
  // limited to the far corners instead of dimming most of the screen.
  float edge = length(ndc);
  float edgeFade = 1.0 - smoothstep(1.2, 1.8, edge);

  vec4 color = texture2D(u_scene, clamp(sampleUv, 0.0, 1.0));
  gl_FragColor = vec4(color.rgb * edgeFade, 1.0);
}
`;
