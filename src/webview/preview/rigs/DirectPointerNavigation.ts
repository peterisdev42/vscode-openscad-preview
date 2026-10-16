import {
  MathUtils,
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
} from "three";
import type { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";

/** Convert CSS pixel dragging to a translation on the orbit target's view plane. */
export function viewportPanDelta(
  camera: PerspectiveCamera | OrthographicCamera,
  target: Vector3,
  dx: number,
  dy: number,
  width: number,
  height: number,
): Vector3 {
  const spanY =
    camera instanceof PerspectiveCamera
      ? 2 *
        camera.position.distanceTo(target) *
        Math.tan(MathUtils.degToRad(camera.fov / 2))
      : (camera.top - camera.bottom) / camera.zoom;
  const spanX =
    camera instanceof PerspectiveCamera
      ? spanY * camera.aspect
      : (camera.right - camera.left) / camera.zoom;
  return new Vector3(1, 0, 0)
    .applyQuaternion(camera.quaternion)
    .multiplyScalar((-dx * spanX) / Math.max(width, 1))
    .addScaledVector(
      new Vector3(0, 1, 0).applyQuaternion(camera.quaternion),
      (dy * spanY) / Math.max(height, 1),
    );
}

/** Exact screen-space mouse panning and per-input trackball rotation updates. */
export class DirectPointerNavigation {
  private pan?: { pointerId: number; x: number; y: number };
  private disposed = false;

  constructor(
    private readonly controls: TrackballControls,
    private readonly camera: PerspectiveCamera,
    private readonly activeCamera: () => PerspectiveCamera | OrthographicCamera,
    private readonly element: HTMLElement,
  ) {
    this.element.addEventListener("pointerdown", this.onDown, true);
    this.element.addEventListener("pointermove", this.onMove, true);
    this.element.addEventListener("pointerup", this.onEnd, true);
    this.element.addEventListener("pointercancel", this.onEnd, true);
    this.element.addEventListener("lostpointercapture", this.onEnd, true);
  }

  private onDown = (event: PointerEvent) => {
    if (!this.controls.enabled) return;
    this.controls.handleResize();
    if (
      event.pointerType === "touch" ||
      (event.button !== 2 &&
        !(
          event.button === 0 &&
          (event.shiftKey || event.ctrlKey || event.metaKey)
        ))
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.pan = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    this.element.setPointerCapture(event.pointerId);
    this.controls.dispatchEvent({ type: "start" });
  };

  private onMove = (event: PointerEvent) => {
    if (this.pan?.pointerId === event.pointerId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!this.controls.enabled) return;
      const rect = this.element.getBoundingClientRect();
      const delta = viewportPanDelta(
        this.activeCamera(),
        this.controls.target,
        event.clientX - this.pan.x,
        event.clientY - this.pan.y,
        rect.width,
        rect.height,
      );
      this.camera.position.add(delta);
      this.controls.target.add(delta);
      this.pan.x = event.clientX;
      this.pan.y = event.clientY;
      this.controls.update();
      return;
    }
    // TrackballControls overwrites its last mouse sample on every pointermove.
    // Consume it after its handler, before another input event can replace it.
    queueMicrotask(() => {
      if (!this.disposed && this.controls.enabled && !this.pan)
        this.controls.update();
    });
  };

  private onEnd = (event: PointerEvent) => {
    if (this.pan?.pointerId !== event.pointerId) return;
    event.stopImmediatePropagation();
    this.pan = undefined;
    if (this.element.hasPointerCapture(event.pointerId))
      this.element.releasePointerCapture(event.pointerId);
    this.controls.dispatchEvent({ type: "end" });
  };

  dispose() {
    this.disposed = true;
    if (this.pan && this.element.hasPointerCapture(this.pan.pointerId))
      this.element.releasePointerCapture(this.pan.pointerId);
    this.pan = undefined;
    this.element.removeEventListener("pointerdown", this.onDown, true);
    this.element.removeEventListener("pointermove", this.onMove, true);
    this.element.removeEventListener("pointerup", this.onEnd, true);
    this.element.removeEventListener("pointercancel", this.onEnd, true);
    this.element.removeEventListener("lostpointercapture", this.onEnd, true);
  }
}
