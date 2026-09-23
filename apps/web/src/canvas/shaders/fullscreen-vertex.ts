/**
 * Vertex shader for a screen-anchored full-screen quad (sky, haze, barrel
 * post pass): outputs clip-space position directly from a -1..1 plane, so
 * the camera's own transform is irrelevant. `vUv` is 0..1 across the
 * screen.
 */
export const FULLSCREEN_VERTEX_GLSL = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
