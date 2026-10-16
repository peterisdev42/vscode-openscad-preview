import assert from "node:assert/strict";
import test from "node:test";
import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { viewportPanDelta } from "../webview/preview/rigs/DirectPointerNavigation";
import {
  buildPlateOffset,
  BUILD_PLATE_SIZE,
} from "../webview/preview/managers/BuildPlateLayout";
import { BuildPlateOrigin } from "../webview/contexts/ViewOptionsContext";

test("Mouse panning maps CSS pixel displacement 1:1 in both camera modes", () => {
  const width = 900,
    height = 600;
  for (const distance of [25, 150, 900]) {
    for (const fov of [35, 75]) {
      const perspective = new PerspectiveCamera(
        fov,
        width / height,
        0.1,
        10000,
      );
      const orthographic = new OrthographicCamera(
        -120,
        120,
        80,
        -80,
        0.1,
        10000,
      );
      orthographic.zoom = 1.7;
      orthographic.updateProjectionMatrix();
      for (const camera of [perspective, orthographic]) {
        const target = new Vector3(15, -7, 12);
        camera.position
          .copy(target)
          .add(new Vector3(1, -2, 1).normalize().multiplyScalar(distance));
        camera.up.set(0, 0, 1);
        camera.lookAt(target);
        camera.updateMatrixWorld();
        const before = target.clone().project(camera);
        const delta = viewportPanDelta(camera, target, 83, -37, width, height);
        camera.position.add(delta);
        const movedTarget = target.clone().add(delta);
        camera.lookAt(movedTarget);
        camera.updateMatrixWorld();
        const after = target.clone().project(camera);
        assert.ok(Math.abs(((after.x - before.x) * width) / 2 - 83) < 1e-8);
        assert.ok(Math.abs((-(after.y - before.y) * height) / 2 + 37) < 1e-8);
        assert.ok(
          Math.abs(camera.position.distanceTo(movedTarget) - distance) < 1e-8,
        );
      }
    }
  }
});

test("Build plate center and printable lower-left origins align correctly", () => {
  const half = BUILD_PLATE_SIZE / 2;
  assert.deepEqual(
    buildPlateOffset(BuildPlateOrigin.Center).toArray(),
    [0, 0, 0],
  );
  const offset = buildPlateOffset(BuildPlateOrigin.LowerLeft);
  assert.deepEqual(
    new Vector3(-half, -half, 0).add(offset).toArray(),
    [0, 0, 0],
  );
  assert.deepEqual(new Vector3(half, half, 0).add(offset).toArray(), [
    BUILD_PLATE_SIZE,
    BUILD_PLATE_SIZE,
    0,
  ]);
});
