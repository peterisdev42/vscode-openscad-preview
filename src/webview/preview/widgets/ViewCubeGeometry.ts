import {
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";

export interface CubeRegion {
  direction: Vector3;
  label: string;
  kind: "face" | "edge" | "corner";
  vertices: Vector3[];
}

const labels = [
  ["Left", "Right"],
  ["Front", "Back"],
  ["Bottom", "Top"],
];
// Inset from the cube boundary: 0.18, half the original 0.36 bevel.
const bevel = 0.82;

/** A chamfered cube with 6 square faces, 12 bevelled edges and 8 corners. */
export function createCubeRegions(): CubeRegion[] {
  const regions: CubeRegion[] = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const signs = [x, y, z];
        const axes = signs.flatMap((value, axis) => (value ? [axis] : []));
        if (!axes.length) continue;
        const label = axes
          .map((axis) => labels[axis][signs[axis] > 0 ? 1 : 0])
          .join(" · ");
        const direction = new Vector3(x, y, z).normalize();
        let vertices: Vector3[];
        if (axes.length === 1) {
          const axis = axes[0];
          const other = [0, 1, 2].filter((value) => value !== axis);
          vertices = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ].map(([a, b]) => {
            const point = new Vector3().setComponent(axis, signs[axis]);
            return point
              .setComponent(other[0], a * bevel)
              .setComponent(other[1], b * bevel);
          });
        } else if (axes.length === 2) {
          const [a, b] = axes;
          const along = [0, 1, 2].find((axis) => !signs[axis])!;
          vertices = [
            [1, bevel, -bevel],
            [bevel, 1, -bevel],
            [bevel, 1, bevel],
            [1, bevel, bevel],
          ].map(([u, v, w]) =>
            new Vector3()
              .setComponent(a, u * signs[a])
              .setComponent(b, v * signs[b])
              .setComponent(along, w),
          );
        } else {
          vertices = axes.map(
            (axis) =>
              new Vector3(
                x * (axis === 0 ? 1 : bevel),
                y * (axis === 1 ? 1 : bevel),
                z * (axis === 2 ? 1 : bevel),
              ),
          );
        }
        // Consistent outward winding is also useful for labels and raycasting.
        const normal = vertices[1]
          .clone()
          .sub(vertices[0])
          .cross(vertices[2].clone().sub(vertices[0]));
        if (normal.dot(direction) < 0) vertices.reverse();
        regions.push({
          direction,
          label,
          kind:
            axes.length === 1 ? "face" : axes.length === 2 ? "edge" : "corner",
          vertices,
        });
      }
    }
  }
  return regions;
}

export function cubeRegionGeometry(region: CubeRegion): BufferGeometry {
  const points: number[] = [];
  for (let i = 1; i < region.vertices.length - 1; i++) {
    for (const point of [
      region.vertices[0],
      region.vertices[i],
      region.vertices[i + 1],
    ])
      points.push(...point.toArray());
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Free-orbit navigation supports exact pole views without a singular up vector. */
export function cubeViewDirection(direction: Vector3): Vector3 {
  return direction.clone().normalize();
}

/** Snap screen roll to the nearest equivalent pose, preserving orbit continuity. */
export function cubeViewUp(direction: Vector3, preferredUp?: Vector3): Vector3 {
  const normal = direction.clone().normalize();
  const baseUp =
    Math.abs(normal.z) > 1 - 1e-10
      ? new Vector3(0, normal.z > 0 ? 1 : -1, 0)
      : new Vector3(0, 0, 1).addScaledVector(normal, -normal.z).normalize();
  if (!preferredUp) return baseUp;

  const candidates: Vector3[] = [];
  if (
    [normal.x, normal.y, normal.z].every((value) => Math.abs(value) > 1e-10)
  ) {
    // At a corner, any cube axis may be the vertical isometric edge.
    for (let axis = 0; axis < 3; axis++) {
      const up = new Vector3().setComponent(axis, 1);
      up.addScaledVector(normal, -up.dot(normal)).normalize();
      candidates.push(up, up.clone().negate());
    }
  } else {
    // Face squares and edge rectangles admit four screen-aligned poses.
    const right = baseUp.clone().cross(normal).normalize();
    candidates.push(
      baseUp,
      right,
      baseUp.clone().negate(),
      right.clone().negate(),
    );
  }
  return candidates.reduce((best, up) =>
    up.dot(preferredUp) > best.dot(preferredUp) + 1e-10 ? up : best,
  );
}

/** Choose one of four face-bound texture orientations, without billboarding. */
export function cubeLabelQuaternion(
  normal: Vector3,
  cameraRotation: Quaternion,
): Quaternion {
  const fixedUp =
    Math.abs(normal.z) > 0.5
      ? new Vector3(0, normal.z, 0)
      : new Vector3(0, 0, 1);
  const fixedRight = fixedUp.clone().cross(normal).normalize();
  const screenUp = new Vector3(0, 1, 0).applyQuaternion(cameraRotation);
  const screenRight = new Vector3(1, 0, 0).applyQuaternion(cameraRotation);
  let bestUp = fixedUp;
  let bestRight = fixedRight;
  let bestScore = -Infinity;
  for (const up of [
    fixedUp,
    fixedRight,
    fixedUp.clone().negate(),
    fixedRight.clone().negate(),
  ]) {
    const right = up.clone().cross(normal).normalize();
    const rightX = right.dot(screenRight);
    const rightY = right.dot(screenUp);
    const upX = up.dot(screenRight);
    const upY = up.dot(screenUp);
    // Visible text must read left-to-right and bottom-to-top on screen.
    if (rightX < -1e-10 || upY < -1e-10) continue;
    const score =
      rightX / Math.max(Math.hypot(rightX, rightY), 1e-10) +
      upY / Math.max(Math.hypot(upX, upY), 1e-10);
    if (score > bestScore) {
      bestScore = score;
      bestUp = up;
      bestRight = right;
    }
  }
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(bestRight, bestUp, normal),
  );
}
