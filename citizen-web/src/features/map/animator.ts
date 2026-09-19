import type { LatLng, VehicleLocation } from "@swachhata/core";
import { TRACKING } from "@/lib/config";
import { lerpAngle, lerpLatLng, resolveHeading } from "@swachhata/core";

export interface Pose extends LatLng {
  heading: number;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * Moves the truck between two fixes instead of teleporting it.
 *
 * Each accepted fix starts a new tween from wherever the marker currently *is* — not from
 * the previous fix — so a late update re-targets smoothly rather than fighting the running
 * animation. The render callback fires on every frame and is expected to mutate the DOM or
 * the map marker directly; it must not set React state.
 */
export class MarkerAnimator {
  private pose: Pose | null = null;
  private from: Pose | null = null;
  private to: Pose | null = null;
  private startedAt = 0;
  private durationMs: number = TRACKING.expectedUpdateIntervalMs;
  private frame: number | null = null;
  private previousFix: VehicleLocation | null = null;

  constructor(
    private readonly onFrame: (pose: Pose) => void,
    private readonly reducedMotion = false,
  ) {}

  /** Current on-screen position, used to keep the camera with the vehicle. */
  get current(): Pose | null {
    return this.pose;
  }

  push(location: VehicleLocation): void {
    const heading = resolveHeading(this.previousFix, location, this.pose?.heading ?? 0);
    const target: Pose = { lat: location.lat, lng: location.lng, heading };

    if (!this.pose || this.reducedMotion) {
      // First fix, or motion is switched off: place it and skip the tween.
      this.pose = target;
      this.previousFix = location;
      this.cancel();
      this.onFrame(target);
      return;
    }

    const gap = this.previousFix
      ? Date.parse(location.recordedAt) - Date.parse(this.previousFix.recordedAt)
      : TRACKING.expectedUpdateIntervalMs;

    this.previousFix = location;
    this.from = this.pose;
    this.to = target;
    this.startedAt = performance.now();
    this.durationMs = Math.min(
      TRACKING.maxAnimationMs,
      Math.max(TRACKING.minAnimationMs, gap || TRACKING.expectedUpdateIntervalMs),
    );

    if (this.frame === null) this.frame = requestAnimationFrame(this.step);
  }

  private readonly step = (now: number) => {
    if (!this.from || !this.to) {
      this.frame = null;
      return;
    }

    const t = Math.min(1, (now - this.startedAt) / this.durationMs);
    const eased = easeInOut(t);
    const point = lerpLatLng(this.from, this.to, eased);
    this.pose = {
      ...point,
      heading: lerpAngle(this.from.heading, this.to.heading, Math.min(1, eased * 1.6)),
    };
    this.onFrame(this.pose);

    if (t < 1) {
      this.frame = requestAnimationFrame(this.step);
    } else {
      this.frame = null;
      this.from = null;
      this.to = null;
    }
  };

  private cancel() {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.from = null;
    this.to = null;
  }

  destroy(): void {
    this.cancel();
  }
}
