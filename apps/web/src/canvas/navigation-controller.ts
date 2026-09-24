import { centerOffsetFor } from "./coords";
import { deadZoneRadius } from "./deadzone";
import { type DragSample, decayVelocity, releaseVelocity } from "./drag";
import { clampDt } from "./dt-clamp";
import { approachVec2 } from "./inertia";
import {
  directionForKey,
  isTextInputFocused,
  type KeyDirection,
  keyboardVelocity,
} from "./keyboard";
import { computeDriftVelocity } from "./navigation";
import type { Vec2 } from "./types";

export interface NavigationControllerOptions {
  /** The focusable canvas host element; drag and keyboard panning are scoped to it. */
  container: HTMLElement;
  getViewportSize: () => { width: number; height: number };
  /** World units / second reached at the viewport edge for cursor drift. Default DEFAULT_MAX_SPEED. */
  maxSpeed?: number;
  /** World units / second for keyboard panning. Default DEFAULT_KEYBOARD_SPEED. */
  keyboardSpeed?: number;
  /** Inertia smoothing constant (higher = snappier). Default 6. */
  smoothingK?: number;
  /** Half-life, in seconds, of the post-drag release glide. Default 0.35. */
  dragDecayHalfLife?: number;
  reducedMotion?: boolean;
}

// Exported so the constants are easy to find and re-tune later (owner
// feedback: 220/260 felt slow → 380/420; 2026-09-24 doubled for 2x max speed).
export const DEFAULT_MAX_SPEED = 760;
export const DEFAULT_KEYBOARD_SPEED = 840;
const DEFAULT_SMOOTHING_K = 6;
const DEFAULT_DRAG_DECAY_HALF_LIFE = 0.35;
const RELEASE_STOP_EPSILON = 0.05;

type MotionState = "idle" | "dragging" | "releasing";

/**
 * Pure(ish), framework-free navigation controller: owns pointer/drag/
 * keyboard listeners and integrates the world offset each frame from
 * `update(dt)`. React only mounts/disposes it (see CanvasHost); it holds no
 * rendering state.
 */
export class NavigationController {
  private readonly container: HTMLElement;
  private readonly getViewportSize: () => { width: number; height: number };
  private readonly maxSpeed: number;
  private readonly keyboardSpeed: number;
  private readonly smoothingK: number;
  private readonly dragDecayHalfLife: number;
  private reducedMotion: boolean;

  private mounted = false;
  private disposed = false;

  private worldOffset: Vec2 = { x: 0, y: 0 };
  private velocity: Vec2 = { x: 0, y: 0 };
  private motionState: MotionState = "idle";

  private pointerInWindow = false;
  private pointerX = 0;
  private pointerY = 0;
  private lastPointerType: string | null = null;
  private documentHidden = false;

  private dragPointerId: number | null = null;
  private dragStart: Vec2 = { x: 0, y: 0 };
  private dragSamples: DragSample[] = [];

  private readonly activeKeyDirections = new Set<KeyDirection>();

  constructor(options: NavigationControllerOptions) {
    this.container = options.container;
    this.getViewportSize = options.getViewportSize;
    this.maxSpeed = options.maxSpeed ?? DEFAULT_MAX_SPEED;
    this.keyboardSpeed = options.keyboardSpeed ?? DEFAULT_KEYBOARD_SPEED;
    this.smoothingK = options.smoothingK ?? DEFAULT_SMOOTHING_K;
    this.dragDecayHalfLife = options.dragDecayHalfLife ?? DEFAULT_DRAG_DECAY_HALF_LIFE;
    this.reducedMotion = options.reducedMotion ?? false;
  }

  mount(): void {
    if (this.mounted || this.disposed) {
      return;
    }
    this.mounted = true;

    window.addEventListener("pointermove", this.handleWindowPointerMove);
    document.addEventListener("pointerout", this.handleDocumentPointerOut);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("blur", this.handleWindowBlur);

    this.container.addEventListener("pointerdown", this.handlePointerDown);
    this.container.addEventListener("pointermove", this.handleContainerPointerMove);
    this.container.addEventListener("pointerup", this.handlePointerUp);
    this.container.addEventListener("pointercancel", this.handlePointerUp);

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.mounted = false;

    window.removeEventListener("pointermove", this.handleWindowPointerMove);
    document.removeEventListener("pointerout", this.handleDocumentPointerOut);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    window.removeEventListener("blur", this.handleWindowBlur);

    this.container.removeEventListener("pointerdown", this.handlePointerDown);
    this.container.removeEventListener("pointermove", this.handleContainerPointerMove);
    this.container.removeEventListener("pointerup", this.handlePointerUp);
    this.container.removeEventListener("pointercancel", this.handlePointerUp);

    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);

    this.activeKeyDirections.clear();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced && this.motionState === "releasing") {
      this.velocity = { x: 0, y: 0 };
      this.motionState = "idle";
    }
  }

  getWorldOffset(): Vec2 {
    return { ...this.worldOffset };
  }

  /**
   * Instantly pans so `worldPoint` (a 1:1, parallax-1 layer's world
   * coordinate — the card layer, see `item-layout.ts`) sits at the screen
   * center, and stops any in-flight drift/release motion. Used by the
   * parallel DOM/ARIA layer (`components/CanvasHost/CanvasHost.tsx`) when a
   * card gains keyboard focus. Instant rather than eased: a smooth animated
   * pan needs its own time-based tween state, which is a reasonable future
   * enhancement but out of scope here (see the T8b report's known gaps).
   */
  centerOn(worldPoint: Vec2): void {
    this.worldOffset = centerOffsetFor(worldPoint, 1);
    this.velocity = { x: 0, y: 0 };
    this.motionState = "idle";
  }

  getVelocity(): Vec2 {
    return { ...this.velocity };
  }

  /** Advances the simulation by `dt` seconds (un-clamped; clamped internally). */
  update(dtSeconds: number): void {
    if (this.disposed) {
      return;
    }
    const dt = clampDt(dtSeconds);
    if (dt === 0) {
      return;
    }

    if (this.motionState === "dragging") {
      // Position is driven directly by drag pointermove deltas; no
      // velocity integration while actively dragging.
      return;
    }

    if (this.motionState === "releasing") {
      this.velocity = decayVelocity(this.velocity, dt, this.dragDecayHalfLife);
      this.worldOffset = {
        x: this.worldOffset.x + this.velocity.x * dt,
        y: this.worldOffset.y + this.velocity.y * dt,
      };
      if (Math.hypot(this.velocity.x, this.velocity.y) < RELEASE_STOP_EPSILON) {
        this.velocity = { x: 0, y: 0 };
        this.motionState = "idle";
      }
      return;
    }

    const target = this.computeIdleTargetVelocity();
    this.velocity = approachVec2(this.velocity, target, dt, this.smoothingK);
    // Idle-state velocity (drift + keyboard) points toward where you're
    // looking/traveling (computeDriftVelocity/keyboardVelocity, unchanged).
    // The world offset integrates the OPPOSITE way: coords.ts's
    // worldToScreen(world, offset, parallax) = world + offset*parallax, and
    // "you travel toward the pointer" must make the ambient world recede
    // from you (content scrolls opposite your travel direction — the
    // standard camera-dolly effect; see the T8a "Y axis inverted"
    // correction). Drag (below, "dragging"/"releasing" states) is the
    // opposite interaction — grab-and-move content 1:1 — and is
    // deliberately NOT negated here.
    this.worldOffset = {
      x: this.worldOffset.x - this.velocity.x * dt,
      y: this.worldOffset.y - this.velocity.y * dt,
    };
  }

  private computeIdleTargetVelocity(): Vec2 {
    const keyboard = keyboardVelocity(this.activeKeyDirections, this.keyboardSpeed);

    const driftAllowed =
      !this.reducedMotion &&
      this.lastPointerType !== "touch" &&
      this.pointerInWindow &&
      !this.documentHidden;

    if (!driftAllowed) {
      return keyboard;
    }

    const { width, height } = this.getViewportSize();
    const drift = computeDriftVelocity({
      pointerX: this.pointerX,
      pointerY: this.pointerY,
      viewportWidth: width,
      viewportHeight: height,
      deadZoneRadius: deadZoneRadius(width, height),
      maxSpeed: this.maxSpeed,
    });

    return { x: drift.x + keyboard.x, y: drift.y + keyboard.y };
  }

  private updatePointerPosition(clientX: number, clientY: number): void {
    const { width, height } = this.getViewportSize();
    this.pointerX = clientX - width / 2;
    this.pointerY = clientY - height / 2;
    this.pointerInWindow = true;
  }

  private readonly handleWindowPointerMove = (event: PointerEvent): void => {
    this.lastPointerType = event.pointerType;
    if (this.motionState === "dragging") {
      return;
    }
    this.updatePointerPosition(event.clientX, event.clientY);
  };

  private readonly handleDocumentPointerOut = (event: PointerEvent): void => {
    if (event.relatedTarget === null) {
      this.pointerInWindow = false;
    }
  };

  private readonly handleVisibilityChange = (): void => {
    this.documentHidden = document.hidden;
  };

  private readonly handleWindowBlur = (): void => {
    this.pointerInWindow = false;
  };

  private hasContainerFocus(): boolean {
    const active = document.activeElement;
    return active === this.container || (active !== null && this.container.contains(active));
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.dragPointerId !== null) {
      return;
    }
    this.dragPointerId = event.pointerId;
    this.motionState = "dragging";
    this.dragStart = { x: this.worldOffset.x, y: this.worldOffset.y };
    this.dragSamples = [{ x: event.clientX, y: event.clientY, t: event.timeStamp / 1000 }];
    this.container.setPointerCapture?.(event.pointerId);
    this.container.focus();
  };

  private readonly handleContainerPointerMove = (event: PointerEvent): void => {
    this.lastPointerType = event.pointerType;
    if (this.motionState !== "dragging" || event.pointerId !== this.dragPointerId) {
      return;
    }
    const firstSample = this.dragSamples[0];
    if (!firstSample) {
      return;
    }
    const dx = event.clientX - firstSample.x;
    const dy = event.clientY - firstSample.y;
    this.worldOffset = { x: this.dragStart.x + dx, y: this.dragStart.y + dy };
    this.dragSamples.push({ x: event.clientX, y: event.clientY, t: event.timeStamp / 1000 });
    if (this.dragSamples.length > 5) {
      this.dragSamples.shift();
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.motionState !== "dragging" || event.pointerId !== this.dragPointerId) {
      return;
    }
    this.container.releasePointerCapture?.(event.pointerId);
    this.dragPointerId = null;

    if (this.reducedMotion) {
      this.velocity = { x: 0, y: 0 };
      this.motionState = "idle";
      this.dragSamples = [];
      return;
    }

    const velocity = releaseVelocity(this.dragSamples);
    this.dragSamples = [];
    if (Math.hypot(velocity.x, velocity.y) < RELEASE_STOP_EPSILON) {
      this.velocity = { x: 0, y: 0 };
      this.motionState = "idle";
      return;
    }
    this.velocity = velocity;
    this.motionState = "releasing";
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.hasContainerFocus() || isTextInputFocused(document.activeElement)) {
      return;
    }
    const direction = directionForKey(event.key);
    if (!direction) {
      return;
    }
    event.preventDefault();
    this.activeKeyDirections.add(direction);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const direction = directionForKey(event.key);
    if (!direction) {
      return;
    }
    this.activeKeyDirections.delete(direction);
  };
}
