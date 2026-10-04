export interface MotionPolicy {
  /** Cursor-driven drift toward the pointer direction. */
  autoDrift: boolean;
  /** Inertia glide: smoothed approach to a moving target, and post-drag decay. */
  inertiaGlide: boolean;
}

/**
 * `prefers-reduced-motion` policy: direct input (drag pan, keyboard pan)
 * always stays available; only ambient/automatic motion is suppressed.
 */
export function motionPolicyFor(reducedMotion: boolean): MotionPolicy {
  const enabled = !reducedMotion;
  return { autoDrift: enabled, inertiaGlide: enabled };
}
