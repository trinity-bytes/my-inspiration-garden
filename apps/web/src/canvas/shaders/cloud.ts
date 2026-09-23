import { ATMOSPHERE_COLOR_RGB } from "../cloud-depth";

/**
 * Cloud sprite shader: outputs premultiplied color so the material can use
 * (ONE, ONE_MINUS_SRC_ALPHA) blending, which avoids dark fringing at the
 * alpha-sprite edges that straight-alpha + normal blending produces under
 * bilinear filtering.
 *
 * Aerial perspective (owner feedback, T8a): farther clouds mix toward the
 * atmosphere color by `u_atmosphereMix` (0 for the nearest layer — no
 * tint). The mix happens on the straight (non-premultiplied) color, then
 * the result is multiplied by alpha once, so premultiplication stays
 * correct.
 */
export const CLOUD_VERTEX_GLSL = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const CLOUD_FRAGMENT_GLSL = /* glsl */ `
uniform sampler2D u_map;
uniform float u_opacity;
uniform float u_atmosphereMix;
varying vec2 vUv;

const vec3 ATMOSPHERE_COLOR = vec3(${ATMOSPHERE_COLOR_RGB.r}, ${ATMOSPHERE_COLOR_RGB.g}, ${ATMOSPHERE_COLOR_RGB.b});

void main() {
  vec4 tex = texture2D(u_map, vUv);
  vec3 tinted = mix(tex.rgb, ATMOSPHERE_COLOR, u_atmosphereMix);
  float alpha = tex.a * u_opacity;
  gl_FragColor = vec4(tinted * alpha, alpha);
}
`;
