import assert from "node:assert/strict";
import test from "node:test";
import {
  Matrix4,
  Euler,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Raycaster,
  Vector3,
} from "three";
import {
  createCubeRegions,
  cubeRegionGeometry,
  cubeViewDirection,
  cubeLabelQuaternion,
  cubeViewUp,
} from "../webview/preview/widgets/ViewCubeGeometry";

test("View cube exposes exactly 6 face, 12 edge and 8 corner directions", () => {
  const regions = createCubeRegions();
  assert.equal(regions.length, 26);
  for (const [kind, count] of [
    ["face", 6],
    ["edge", 12],
    ["corner", 8],
  ] as const) {
    assert.equal(
      regions.filter((region) => region.kind === kind).length,
      count,
    );
  }
  assert.equal(
    new Set(regions.map((region) => region.direction.toArray().join(","))).size,
    26,
  );
  for (const region of regions) {
    assert.ok(Math.abs(region.direction.length() - 1) < 1e-10);
    assert.ok(
      Math.abs(cubeViewDirection(region.direction).length() - 1) < 1e-10,
    );
    assert.ok(
      cubeViewDirection(region.direction).distanceTo(region.direction) < 2e-6,
    );
  }
});

test("All 26 cube regions are independently pickable by outward-facing geometry", () => {
  const regions = createCubeRegions();
  const material = new MeshBasicMaterial();
  const meshes = regions.map(
    (region) => new Mesh(cubeRegionGeometry(region), material),
  );
  for (const mesh of meshes) mesh.updateMatrixWorld();
  for (const [index, region] of regions.entries()) {
    const ray = new Raycaster(
      region.direction.clone().multiplyScalar(6),
      region.direction.clone().negate(),
    );
    const hits = ray.intersectObjects(meshes, false);
    assert.equal(
      hits[0]?.object,
      meshes[index],
      `${region.label} must hit its own ${region.kind}`,
    );
  }
  // The bevels should form a closed surface, with no gaps to click through.
  for (let i = 0; i < 300; i++) {
    const z = 1 - (2 * (i + 0.5)) / 300;
    const phi = i * Math.PI * (3 - Math.sqrt(5));
    const radius = Math.sqrt(1 - z * z);
    const direction = new Vector3(
      radius * Math.cos(phi),
      radius * Math.sin(phi),
      z,
    );
    assert.ok(
      new Raycaster(
        direction.clone().multiplyScalar(6),
        direction.negate(),
      ).intersectObjects(meshes, false).length,
    );
  }
  for (const mesh of meshes) mesh.geometry.dispose();
  material.dispose();
});

test("Face labels follow OpenSCAD Z-up coordinates and pole directions are exact", () => {
  const faces = createCubeRegions().filter((region) => region.kind === "face");
  for (const [label, direction] of [
    ["Top", [0, 0, 1]],
    ["Bottom", [0, 0, -1]],
    ["Front", [0, -1, 0]],
    ["Right", [1, 0, 0]],
    ["Back", [0, 1, 0]],
    ["Left", [-1, 0, 0]],
  ] as const) {
    assert.deepEqual(
      faces.find((face) => face.label === label)?.direction.toArray(),
      [...direction],
    );
  }
  const top = cubeViewDirection(new Vector3(0, 0, 1));
  assert.deepEqual(top.toArray(), [0, 0, 1]);
});

test("Bevels have half their original thickness while face labels still fit", () => {
  const regions = createCubeRegions();
  const edge = regions.find((region) => region.label === "Right · Front")!;
  assert.ok(
    Math.abs(
      edge.vertices[0].distanceTo(edge.vertices[1]) - Math.SQRT2 * 0.18,
    ) < 1e-10,
  );
  const face = regions.find((region) => region.label === "Right")!;
  const extent = Math.max(...face.vertices.map((vertex) => Math.abs(vertex.y)));
  assert.ok(extent > 1.5 / 2, "Fixed face texture must fit within the face");
});

test("Visible labels stay upright on their faces for tilted, rolled and pole views", () => {
  const faces = createCubeRegions().filter((region) => region.kind === "face");
  for (let i = 0; i < 400; i++) {
    const camera = new Quaternion().setFromEuler(
      new Euler(i * 0.137, i * 0.317, i * 0.479),
    );
    const screenUp = new Vector3(0, 1, 0).applyQuaternion(camera);
    const screenRight = new Vector3(1, 0, 0).applyQuaternion(camera);
    const facing = new Vector3(0, 0, 1).applyQuaternion(camera);
    for (const face of faces) {
      const rotation = cubeLabelQuaternion(face.direction, camera);
      assert.ok(
        new Vector3(0, 0, 1)
          .applyQuaternion(rotation)
          .distanceTo(face.direction) < 1e-10,
        "Text must stay on its cube face",
      );
      if (face.direction.dot(facing) <= 0.03) continue;
      assert.ok(
        new Vector3(0, 1, 0).applyQuaternion(rotation).dot(screenUp) > 0,
        `${face.label} must not be upside-down`,
      );
      const textUp = new Vector3(0, 1, 0).applyQuaternion(rotation);
      const textRight = new Vector3(1, 0, 0).applyQuaternion(rotation);
      const projectedArea =
        textRight.dot(screenRight) * textUp.dot(screenUp) -
        textRight.dot(screenUp) * textUp.dot(screenRight);
      assert.ok(projectedArea > 0, `${face.label} must not be mirrored`);
      const fixedUp =
        Math.abs(face.direction.z) > 0.5
          ? new Vector3(0, face.direction.z, 0)
          : new Vector3(0, 0, 1);
      const alignment = Math.abs(textUp.dot(fixedUp));
      assert.ok(
        alignment < 1e-10 || alignment > 1 - 1e-10,
        `${face.label} must use a quarter-turn texture orientation`,
      );
      assert.ok(
        textRight.dot(screenRight) >= -1e-10,
        `${face.label} must read left-to-right`,
      );
    }
  }
});

test("Each face supports all four readable quarter-turn orientations", () => {
  for (const face of createCubeRegions().filter(
    (region) => region.kind === "face",
  )) {
    // Start looking straight at this face with its original text upright.
    const up =
      Math.abs(face.direction.z) > 0.5
        ? new Vector3(0, face.direction.z, 0)
        : new Vector3(0, 0, 1);
    const right = up.clone().cross(face.direction).normalize();
    const base = new Quaternion().setFromRotationMatrix(
      new Matrix4().makeBasis(right, up, face.direction),
    );
    for (let quarter = 0; quarter < 4; quarter++) {
      const camera = base
        .clone()
        .multiply(
          new Quaternion().setFromAxisAngle(
            new Vector3(0, 0, 1),
            (quarter * Math.PI) / 2,
          ),
        );
      const rotation = cubeLabelQuaternion(face.direction, camera);
      assert.ok(
        rotation.angleTo(camera) < 1e-7,
        `${face.label} failed quarter-turn ${quarter}`,
      );
      const tiltedCamera = camera
        .clone()
        .multiply(
          new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.25),
        );
      assert.ok(
        rotation.angleTo(cubeLabelQuaternion(face.direction, tiltedCamera)) <
          1e-7,
        "Small camera rolls must retain natural face texture tilt",
      );
    }
  }
});

test("Every cube target has a valid reference pose", () => {
  for (const region of createCubeRegions()) {
    const up = cubeViewUp(region.direction);
    assert.ok(Math.abs(up.dot(region.direction)) < 1e-10);
    assert.ok(Math.abs(up.length() - 1) < 1e-10);
    if (Math.abs(region.direction.z) === 1) {
      assert.deepEqual(up.toArray(), [0, region.direction.z, 0]);
    } else {
      assert.ok(up.z > 0, "Non-pole views must have world Z pointing up");
    }
    const right = up.clone().cross(region.direction).normalize();
    if (region.kind === "face") {
      assert.ok(
        Math.max(Math.abs(up.x), Math.abs(up.y), Math.abs(up.z)) > 1 - 1e-10,
      );
    } else if (region.kind === "edge") {
      const along = [
        region.direction.x,
        region.direction.y,
        region.direction.z,
      ].findIndex((value) => Math.abs(value) < 1e-10);
      const edgeAxis = new Vector3().setComponent(along, 1);
      if (along === 2) {
        assert.ok(
          Math.abs(edgeAxis.dot(right)) < 1e-10,
          "Side edge must be vertical",
        );
        assert.ok(Math.abs(edgeAxis.dot(up) - 1) < 1e-10);
      } else {
        assert.ok(
          Math.abs(edgeAxis.dot(up)) < 1e-10,
          "Top/bottom edge must be horizontal",
        );
        assert.ok(Math.abs(Math.abs(edgeAxis.dot(right)) - 1) < 1e-10);
      }
    } else {
      assert.ok(
        Math.abs(right.z) < 1e-10,
        "Isometric views must not roll vertical cube edges sideways",
      );
      assert.ok(Math.abs(up.z - Math.sqrt(2 / 3)) < 1e-10);
    }
  }
});

test("Roll correction selects the nearest equivalent screen pose for every target", () => {
  for (const region of createCubeRegions()) {
    const base = cubeViewUp(region.direction);
    for (let i = 0; i < 360; i++) {
      const preferred = base
        .clone()
        .applyAxisAngle(region.direction, (i * Math.PI) / 180);
      const actual = cubeViewUp(region.direction, preferred);
      const bound = region.kind === "corner" ? Math.PI / 6 : Math.PI / 4;
      assert.ok(actual.angleTo(preferred) <= bound + 1e-9);
      assert.ok(Math.abs(actual.dot(region.direction)) < 1e-10);
      assert.ok(Math.abs(actual.length() - 1) < 1e-10);
      assert.ok(
        cubeViewUp(region.direction, actual).distanceTo(actual) < 1e-10,
        "Repeated clicks must keep a calibrated screen pose stable",
      );
    }
  }
});
