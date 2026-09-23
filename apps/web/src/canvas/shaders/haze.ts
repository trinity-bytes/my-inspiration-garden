import { NOISE_GLSL } from "./noise";

/**
 * Procedural haze: fbm noise, near-white lavender with a hint of apricot,
 * very low opacity, slowly animated and parallaxed independently of the
 * sky. Infinite by construction (pure function of world position).
 */
export const HAZE_FRAGMENT_GLSL = /* glsl */ `
uniform vec2 u_resolution;
uniform vec2 u_worldOffset;
uniform float u_parallax;
uniform float u_time;
varying vec2 vUv;

${NOISE_GLSL}

void main() {
  // Same y-down screen convention as sky.ts (canvas/coords.ts); see its
  // comment. No texture is sampled here, so only the parallax-motion
  // direction matters (no extra v-flip needed for procedural noise).
  vec2 screenPx = vec2((vUv.x - 0.5) * u_resolution.x, (0.5 - vUv.y) * u_resolution.y);
  vec2 worldPx = screenPx - u_worldOffset * u_parallax;
  vec2 p = worldPx * 0.0009 + vec2(u_time * 0.012, u_time * 0.007);

  float f = fbm(p);

  vec3 base = vec3(0.965, 0.953, 0.980);
  vec3 base2 = vec3(0.914, 0.890, 0.953);
  vec3 warm = vec3(0.988, 0.890, 0.827);

  vec3 color = mix(base, base2, f);
  color = mix(color, warm, 0.2 * smoothstep(0.6, 0.9, f));

  float alpha = mix(0.08, 0.15, f);
  gl_FragColor = vec4(color, alpha);
}
`;
