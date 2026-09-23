/**
 * Cloud sprite shader: outputs premultiplied color so the material can use
 * (ONE, ONE_MINUS_SRC_ALPHA) blending, which avoids dark fringing at the
 * alpha-sprite edges that straight-alpha + normal blending produces under
 * bilinear filtering.
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
varying vec2 vUv;

void main() {
  vec4 tex = texture2D(u_map, vUv);
  float alpha = tex.a * u_opacity;
  gl_FragColor = vec4(tex.rgb * alpha, alpha);
}
`;
