/**
 * Card sprite shader: rounded corners via a signed-distance-field mask
 * (T8b requirement — no geometry-level rounding, cards stay a single
 * PlaneGeometry(1,1) like clouds, see `layers/cards.ts`), the fade-in
 * opacity from `card-fade.ts`, and a subtle hover highlight (mixes toward
 * the apricot-soft accent — `styles/tokens.css`'s `--garden-accent-soft`).
 * Premultiplied-alpha output + (ONE, ONE_MINUS_SRC_ALPHA) blending, same
 * technique to avoid dark edge fringing.
 */
export const CARD_VERTEX_GLSL = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const CARD_FRAGMENT_GLSL = /* glsl */ `
uniform sampler2D u_map;
uniform float u_opacity;
uniform float u_aspect;
uniform float u_cornerRadius;
uniform float u_highlight;
varying vec2 vUv;

const vec3 HIGHLIGHT_COLOR = vec3(0.988, 0.890, 0.827); // #FCE3D3 (--garden-accent-soft)
const float AA = 0.015;

float roundedRectSDF(vec2 p, vec2 halfSize, float radius) {
  vec2 d = abs(p) - halfSize + radius;
  return length(max(d, 0.0)) - radius + min(max(d.x, d.y), 0.0);
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(u_aspect, 1.0);
  vec2 halfSize = vec2(u_aspect, 1.0) * 0.5;
  float dist = roundedRectSDF(p, halfSize, u_cornerRadius);
  float mask = 1.0 - smoothstep(0.0, AA, dist);

  vec4 tex = texture2D(u_map, vUv);
  vec3 tinted = mix(tex.rgb, HIGHLIGHT_COLOR, u_highlight * 0.18);
  float alpha = mask * u_opacity * tex.a;
  gl_FragColor = vec4(tinted * alpha, alpha);
}
`;
