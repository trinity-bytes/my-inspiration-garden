/**
 * Card sprite shader: rounded corners via a signed-distance-field mask
 * (T8b requirement — no geometry-level rounding, cards stay a single
 * PlaneGeometry(1,1) like clouds, see `layers/cards.ts`), the fade-in
 * opacity from `card-fade.ts`, and a subtle hover highlight (mixes toward
 * the apricot-soft accent — `styles/tokens.css`'s `--garden-accent-soft`).
 * Premultiplied-alpha output + (ONE, ONE_MINUS_SRC_ALPHA) blending, same
 * technique to avoid dark edge fringing.
 *
 * Below `u_reveal` 1 the card shows its skeleton (Figma Proposals `68:3061`):
 * white at 8% (`--color-surface-raised` on the canvas), optional text lines
 * as a second raised layer, and the sheen. The sheen is measured in screen
 * pixels, so one band crosses every card (`skeleton.ts` drives it).
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
uniform float u_reveal;
uniform float u_lines;
uniform float u_sheenCenter;
uniform float u_sheenHalfWidth;
varying vec2 vUv;

const vec3 HIGHLIGHT_COLOR = vec3(0.988, 0.890, 0.827); // #FCE3D3 (--garden-accent-soft)
const float AA = 0.015;
const float SKELETON_ALPHA = 0.08;
const float SHEEN_ALPHA = 0.1;
const float SHEEN_SLOPE = 0.21; // skeleton.ts SHEEN_SLOPE

float roundedRectSDF(vec2 p, vec2 halfSize, float radius) {
  vec2 d = abs(p) - halfSize + radius;
  return length(max(d, 0.0)) - radius + min(max(d.x, d.y), 0.0);
}

// One text line, in card-width units measured from the card's top left.
float skeletonLine(vec2 q, float x, float y, float width, float height) {
  vec2 halfSize = vec2(width, height) * 0.5;
  float dist = roundedRectSDF(q - vec2(x, y) - halfSize, halfSize, height * 0.5);
  return 1.0 - smoothstep(0.0, 0.004, dist);
}

vec4 skeletonColor() {
  float alpha = SKELETON_ALPHA;
  if (u_lines > 0.5) {
    vec2 q = vec2(vUv.x, (1.0 - vUv.y) / u_aspect);
    float lines = skeletonLine(q, 0.075, 0.09, 0.564, 0.053);
    lines = max(lines, skeletonLine(q, 0.075, 0.21, 0.85, 0.038));
    lines = max(lines, skeletonLine(q, 0.075, 0.286, 0.752, 0.038));
    lines = max(lines, skeletonLine(q, 0.075, 0.361, 0.451, 0.038));
    alpha += lines * SKELETON_ALPHA * (1.0 - SKELETON_ALPHA);
  }
  float band = abs(gl_FragCoord.x + gl_FragCoord.y * SHEEN_SLOPE - u_sheenCenter) / u_sheenHalfWidth;
  float sheen = SHEEN_ALPHA * (1.0 - smoothstep(0.0, 1.0, band));
  alpha += sheen * (1.0 - alpha);
  return vec4(vec3(alpha), alpha);
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(u_aspect, 1.0);
  vec2 halfSize = vec2(u_aspect, 1.0) * 0.5;
  float dist = roundedRectSDF(p, halfSize, u_cornerRadius);
  float mask = 1.0 - smoothstep(0.0, AA, dist);

  vec4 tex = texture2D(u_map, vUv);
  vec3 tinted = mix(tex.rgb, HIGHLIGHT_COLOR, u_highlight * 0.18);
  vec4 color = vec4(tinted * tex.a, tex.a);
  if (u_reveal < 1.0) {
    color = mix(skeletonColor(), color, u_reveal);
  }
  gl_FragColor = color * mask * u_opacity;
}
`;
