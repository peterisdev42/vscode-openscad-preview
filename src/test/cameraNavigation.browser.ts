import { Box3, Color, Quaternion, Vector3 } from "three";
import { CameraRig } from "../webview/preview/rigs/CameraRig";
import { CameraMode } from "../webview/contexts/ViewOptionsContext";
import {
  createCubeRegions,
  cubeViewUp,
} from "../webview/preview/widgets/ViewCubeGeometry";

const modes = [CameraMode.Perspective, CameraMode.Orthographic];
function assert(condition: boolean, detail: string) {
  if (!condition) throw new Error(detail);
}

/** Independently transport the current screen-up along the shortest viewing arc. */
function expectedUp(
  camera: ReturnType<CameraRig["getPerspectiveCamera"]>,
  target: Vector3,
  direction: Vector3,
): Vector3 {
  const from = camera.position.clone().sub(target).normalize();
  const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const rotation =
    from.dot(direction) < -1 + 1e-10
      ? new Quaternion().setFromAxisAngle(
          up.clone().cross(from).normalize(),
          Math.PI,
        )
      : new Quaternion().setFromUnitVectors(from, direction);
  return cubeViewUp(direction, up.applyQuaternion(rotation));
}

/** Real controls must calibrate every target after arbitrary free-orbit rolls. */
export function checkCameraNavigation(element: HTMLElement): string {
  const rig = new CameraRig("navigation-test", 800, 560, element, new Color());
  const camera = rig.getPerspectiveCamera();
  const target = new Vector3(12, -8, 5);
  const radius = 150;
  const targets = createCubeRegions();
  let count = 0;
  try {
    rig.getControls().target.copy(target);
    camera.position
      .copy(target)
      .add(new Vector3(0, -100, 100).normalize().multiplyScalar(radius));
    rig.update();
    for (const mode of modes) {
      rig.setMode(mode);
      for (let repetition = 0; repetition < 8; repetition++) {
        for (const region of targets) {
          camera.up.applyAxisAngle(
            camera.position.clone().sub(target).normalize(),
            0.37 + repetition * 0.19,
          );
          rig.update();
          const wantedUp = expectedUp(camera, target, region.direction);
          rig.orientTo(region.direction, 0);
          const offset = camera.position.clone().sub(target);
          const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
          assert(
            offset.clone().normalize().distanceTo(region.direction) < 1e-10,
            "Incorrect target direction",
          );
          assert(up.distanceTo(wantedUp) < 1e-8, "Target has residual roll");
          assert(
            Math.abs(offset.length() - radius) < 1e-8,
            "Click changed zoom",
          );
          assert(
            rig.getControls().target.distanceTo(target) < 1e-10,
            "Click changed target",
          );
          assert(
            camera.quaternion.angleTo(rig.activeCamera.quaternion) < 1e-7,
            "Projection cameras lost sync",
          );
          const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
          if (region.kind === "edge") {
            const along = region.direction
              .toArray()
              .findIndex((value) => Math.abs(value) < 1e-10);
            const edge = new Vector3().setComponent(along, 1);
            assert(
              Math.min(Math.abs(edge.dot(right)), Math.abs(edge.dot(up))) <
                1e-8,
              "Edge is not aligned horizontally/vertically",
            );
          } else if (region.kind === "corner") {
            assert(
              Math.min(
                Math.abs(right.x),
                Math.abs(right.y),
                Math.abs(right.z),
              ) < 1e-8,
              "Corner has no screen-vertical cube edge",
            );
          } else {
            assert(
              Math.max(Math.abs(up.x), Math.abs(up.y), Math.abs(up.z)) >
                1 - 1e-8,
              "Face is not square to screen axes",
            );
          }
          count++;
        }
      }
    }
    // Both vertical meridians and the horizontal equator must remain continuous.
    const cycles = [
      { start: [0, 0, 1], up: [0, 1, 0], axis: [1, 0, 0] },
      { start: [0, 0, 1], up: [0, 1, 0], axis: [0, 1, 0] },
      { start: [0, -1, 0], up: [0, 0, 1], axis: [0, 0, 1] },
    ];
    for (const mode of modes) {
      rig.setMode(mode);
      for (const cycle of cycles) {
        const start = new Vector3(...cycle.start);
        const axis = new Vector3(...cycle.axis);
        const initialUp = new Vector3(...cycle.up);
        camera.position.copy(start).multiplyScalar(radius).add(target);
        camera.up.copy(initialUp);
        rig.update();
        for (let step = 1; step <= 24; step++) {
          const angle = (step * Math.PI) / 4;
          const direction = start.clone().applyAxisAngle(axis, angle);
          const previous = camera.quaternion.clone();
          rig.orientTo(direction, 0);
          assert(
            previous.angleTo(camera.quaternion) <= Math.PI / 4 + 1e-7,
            "A vertical/horizontal orbit introduced an extra roll",
          );
          assert(
            new Vector3(0, 1, 0)
              .applyQuaternion(camera.quaternion)
              .distanceTo(initialUp.clone().applyAxisAngle(axis, angle)) < 1e-8,
            "Screen orientation flipped during a complete orbit",
          );
        }
      }
    }
    // Restoring Euler properties must retain the calibrated camera orientation.
    rig.getControls().target.set(0, 0, 0);
    rig.orientTo(new Vector3(0, 1, -1), 0);
    const expected = camera.quaternion.clone();
    const restored = new CameraRig(
      "restored-camera",
      800,
      560,
      element,
      new Color(),
    );
    try {
      for (const [key, value] of Object.entries(rig.getProperties())) {
        if (typeof value === "number") restored.setProperty(key, value);
      }
      restored.update();
      assert(
        expected.angleTo(restored.getPerspectiveCamera().quaternion) < 0.001,
        "Saved orientation was lost",
      );
    } finally {
      restored.dispose();
    }
    return `PASS: ${count} calibrated face/edge/corner views in both projection modes; nearest screen roll poses.`;
  } finally {
    rig.dispose();
  }
}

/** Roll correction is smooth, including standard views on either side of a pole. */
export async function checkAnimatedCameraNavigation(): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:absolute;left:-1000px;width:800px;height:560px";
  document.body.appendChild(canvas);
  const rig = new CameraRig(
    "animated-navigation",
    800,
    560,
    canvas,
    new Color(),
  );
  rig.getControls().enabled = false;
  const camera = rig.getPerspectiveCamera();
  const cycle = [
    [0, 0, 1],
    [0, -1, 1],
    [0, -1, 0],
    [0, -1, -1],
    [0, 0, -1],
    [0, 1, -1],
    [-1, 1, -1],
    [0, 1, 0],
    [0, 1, 1],
    [0, 0, 1],
  ];
  let frames = 0;
  try {
    for (const mode of modes) {
      camera.position.set(0, 0, 150);
      camera.up.set(0, 1, 0);
      rig.getControls().target.set(0, 0, 0);
      rig.update();
      rig.setMode(mode);
      for (const values of cycle) {
        const direction = new Vector3(
          values[0],
          values[1],
          values[2],
        ).normalize();
        let previous = camera.quaternion.clone();
        const duration = 80;
        const wantedUp = expectedUp(
          camera,
          rig.getControls().target,
          direction,
        );
        rig.orientTo(direction, duration);
        const started = performance.now();
        let previousTime = started;
        do {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          const now = performance.now();
          rig.update();
          const maxStep =
            4 * Math.PI * Math.min(1, (now - previousTime) / duration) + 1e-4;
          assert(
            previous.angleTo(camera.quaternion) <= maxStep,
            "Animated pose jumped instead of interpolating",
          );
          assert(
            Math.abs(camera.position.length() - 150) < 1e-8,
            "Animated zoom drifted",
          );
          previous = camera.quaternion.clone();
          previousTime = now;
          frames++;
        } while (performance.now() - started < duration + 20);
        assert(
          camera.position.clone().normalize().distanceTo(direction) < 1e-9,
          "Animated endpoint mismatch",
        );
        assert(
          new Vector3(0, 1, 0)
            .applyQuaternion(camera.quaternion)
            .distanceTo(wantedUp) < 1e-8,
          "Animated endpoint did not calibrate roll",
        );
      }
    }
    return `PASS: ${frames} smoothly calibrated animation frames across poles, edges and corners.`;
  } finally {
    rig.dispose();
    canvas.remove();
  }
}

/** Synthetic input mocks pointer capture only, and exercises real control handlers. */
export async function checkDirectPointerNavigation(): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:absolute;left:-2000px;width:800px;height:560px";
  document.body.appendChild(canvas);
  const captures = new Set<number>();
  canvas.setPointerCapture = (id) => {
    captures.add(id);
  };
  canvas.hasPointerCapture = (id) => captures.has(id);
  canvas.releasePointerCapture = (id) => {
    captures.delete(id);
  };
  const rig = new CameraRig("direct-input-test", 800, 560, canvas, new Color());
  const camera = rig.getPerspectiveCamera();
  const rect = canvas.getBoundingClientRect();
  const x = rect.left + 400,
    y = rect.top + 280;
  const pointer = (type: string, button: number, dx = 0, dy = 0) =>
    canvas.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 71,
        pointerType: "mouse",
        isPrimary: true,
        button,
        buttons: type === "pointerup" ? 0 : button === 2 ? 2 : 1,
        clientX: x + dx,
        clientY: y + dy,
      }),
    );
  try {
    for (const mode of modes) {
      rig.setMode(mode);
      const worldPoint = rig.getControls().target.clone();
      rig.activeCamera.updateMatrixWorld();
      const before = worldPoint.clone().project(rig.activeCamera);
      pointer("pointerdown", 2);
      pointer("pointermove", 2, 80, 35);
      pointer("pointerup", 2, 80, 35);
      rig.activeCamera.updateMatrixWorld();
      const after = worldPoint.clone().project(rig.activeCamera);
      assert(
        Math.abs((after.x - before.x) * 400 - 80) < 1e-7,
        "Right-drag horizontal gain is not 1:1",
      );
      assert(
        Math.abs(-(after.y - before.y) * 280 - 35) < 1e-7,
        "Right-drag vertical gain is not 1:1",
      );
      pointer("pointerdown", 0);
      for (let i = 1; i <= 10; i++) {
        const previous = camera.quaternion.clone();
        pointer("pointermove", 0, i * 5, 0);
        // Each input event is a task; consume its microtask before the next event.
        await Promise.resolve();
        assert(
          previous.angleTo(camera.quaternion) > 1e-4,
          "Rotation input was lost before the next animation frame",
        );
      }
      pointer("pointerup", 0, 50, 0);
    }
    return "PASS: real input handlers pan 1:1 in both modes and consume all 20 rotation samples before rendering.";
  } finally {
    rig.dispose();
    canvas.remove();
  }
}

/** Project all model-bound corners to catch fitting and clipping regressions. */
export function checkResetView(element: HTMLElement): string {
  const cases = [
    new Box3(new Vector3(-180, 40, -12), new Vector3(-20, 95, 28)),
    new Box3(new Vector3(10, -50, 0), new Vector3(11, 160, 500)),
    new Box3(new Vector3(-1e7, -2e7, -3e7), new Vector3(1e7, 2e7, 3e7)),
    new Box3(new Vector3(1, 2, 3), new Vector3(1, 2, 3)),
  ];
  let count = 0;
  for (const [width, height] of [
    [1000, 400],
    [350, 900],
  ]) {
    const rig = new CameraRig(
      "reset-test",
      width,
      height,
      element,
      new Color(),
    );
    try {
      for (const mode of modes) {
        rig.setMode(mode);
        for (const bounds of cases) {
          // A queued cube transition must not undo an explicit view reset.
          rig.orientTo(new Vector3(1, -1, -1).normalize());
          rig.resetView(bounds);
          rig.update();
          const camera = rig.activeCamera;
          camera.updateMatrixWorld();
          const center = bounds.getCenter(new Vector3());
          assert(
            rig.getControls().target.distanceTo(center) < 1e-8,
            "Reset did not center the model",
          );
          assert(
            camera.up.distanceTo(new Vector3(0, 1, 0)) < 1e-10,
            "Reset did not restore Top screen up",
          );
          assert(
            camera
              .getWorldDirection(new Vector3())
              .distanceTo(new Vector3(0, 0, -1)) < 1e-10,
            "Reset is not a Top view",
          );
          assert(
            (mode === CameraMode.Perspective) ===
              (camera === rig.getPerspectiveCamera()),
            "Reset changed projection mode",
          );
          for (const x of [bounds.min.x, bounds.max.x])
            for (const y of [bounds.min.y, bounds.max.y])
              for (const z of [bounds.min.z, bounds.max.z]) {
                const projected = new Vector3(x, y, z).project(camera);
                assert(
                  Math.abs(projected.x) < 1 &&
                    Math.abs(projected.y) < 1 &&
                    Math.abs(projected.z) <= 1 + 1e-9,
                  "Reset cropped part of the model",
                );
              }
          count++;
        }
        rig.resetView(new Box3());
        assert(
          Number.isFinite(rig.activeCamera.position.z),
          "Empty model produced an invalid reset",
        );
      }
    } finally {
      rig.dispose();
    }
  }
  return `PASS: ${count} reset views fit all model corners in landscape/portrait and perspective/orthographic, including displaced, tall, huge and point bounds.`;
}
