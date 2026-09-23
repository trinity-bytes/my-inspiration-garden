import { NOISE_GLSL } from "./noise";

/**
 * Tiled sky with a very subtle low-frequency tint drifting between the
 * lavender scale and soft apricot (garden-mvp.md "Visual theme" /
 * "Canvas"). The texture tiles via `THREE.RepeatWrapping`; this shader only
 * picks the UV and blends the tint.
 */
export const SKY_FRAGMENT_GLSL = /* glsl */ `
uniform sampler2D u_skyTex;
uniform vec2 u_resolution;
uniform vec2 u_worldOffset;
uniform float u_parallax;
uniform float u_tileWidth;
uniform float u_tileAspect;
uniform float u_time;
varying vec2 vUv;

${NOISE_GLSL}

void main() {
  // Screen space in the engine's ONE coordinate convention (canvas/coords.ts):
  // x right, y DOWN, CSS px, origin at viewport center. \`vUv\` (from a
  // standard PlaneGeometry, unrotated) has y=1 at the TOP of the screen, so
  // this flips it — using vUv.y directly here previously mixed a y-UP
  // (clip-space) screenPx with the engine's y-DOWN worldOffset, inverting
  // both navigation and, once mixed into the texture UV below, the image
  // itself.
  vec2 screenPx = vec2((vUv.x - 0.5) * u_resolution.x, (0.5 - vUv.y) * u_resolution.y);
  // screenToWorld(screen, offset, parallax) = screen - offset*parallax (coords.ts).
  vec2 worldPx = screenPx - u_worldOffset * u_parallax;

  // Texture v increases upward (three.js default flipY=true), but worldPx.y
  // increases downward (this engine's convention) — negate y only for the
  // texture lookup so the image's TOP renders at the screen's top.
  vec2 tileUv = vec2(worldPx.x / u_tileWidth, -worldPx.y / (u_tileWidth * u_tileAspect));
  vec3 sky = texture2D(u_skyTex, tileUv).rgb;

  float n = fbm(worldPx * 0.00006 + vec2(u_time * 0.004, -u_time * 0.003));
  vec3 lavender = vec3(0.965, 0.953, 0.980);
  vec3 apricot = vec3(0.988, 0.890, 0.827);
  vec3 tint = mix(lavender, apricot, smoothstep(0.35, 0.65, n));

  vec3 color = mix(sky, tint, 0.12);
  gl_FragColor = vec4(color, 1.0);
}
`;
