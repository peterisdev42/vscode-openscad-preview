import {
  Box3,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { CameraProperties } from "../../contexts/SelectedObjectContext";
import { CameraMode } from "../../contexts/ViewOptionsContext";
import { Rig } from "./Rig";
import { DirectPointerNavigation } from "./DirectPointerNavigation";

import { cubeViewUp, cubeViewDirection } from "../widgets/ViewCubeGeometry";

const GIZMO_DISPLAY_DISTANCE = 15;

export class CameraRig extends Rig {
  public readonly id: string;
  private persCamera: PerspectiveCamera;
  private orthCamera: OrthographicCamera;
  private controls: TrackballControls;
  private pointerNavigation: DirectPointerNavigation;
  public activeCamera: PerspectiveCamera | OrthographicCamera;
  private gizmoGroup: Group;
  private gizmoLines: LineSegments;
  private gizmoTriangle: Mesh;
  private _userVisible = true;
  private _isActiveCamera = false;
  private color: Color;
  private orientationTransition?: {
    start: number;
    duration: number;
    offset: Vector3;
    up: Vector3;
    rotation: Quaternion;
    roll: number;
  };

  constructor(
    id: string,
    width: number,
    height: number,
    domElement: HTMLElement,
    color: Color,
  ) {
    super();
    this.id = id;
    this.color = color;

    this.persCamera = new PerspectiveCamera(
      75,
      width / (height || 1),
      0.1,
      1_000_000,
    );
    this.persCamera.position.set(0, -200, 100);

    const aspect = width / (height || 1);
    const viewSize = 100;
    this.orthCamera = new OrthographicCamera(
      -viewSize * aspect,
      viewSize * aspect,
      viewSize,
      -viewSize,
      0.1,
      1_000_000,
    );

    this.activeCamera = this.persCamera;

    this.controls = new TrackballControls(this.persCamera, domElement);
    this.controls.zoomSpeed = 0.5;
    this.controls.staticMoving = true;
    this.controls.rotateSpeed = 1;
    this.controls.keys = ["", "", ""];
    this.controls.addEventListener("start", () => {
      this.orientationTransition = undefined;
    });
    this.controls.addEventListener("change", () => this.syncCameras());
    this.pointerNavigation = new DirectPointerNavigation(
      this.controls,
      this.persCamera,
      () => this.activeCamera,
      domElement,
    );

    this.syncCameras();

    const { lines, tri } = computeGizmoPositions(
      this.persCamera.fov,
      this.persCamera.aspect,
    );

    this.gizmoGroup = new Group();

    const linesGeo = new BufferGeometry();
    linesGeo.setAttribute("position", new Float32BufferAttribute(lines, 3));
    this.gizmoLines = new LineSegments(
      linesGeo,
      new LineBasicMaterial({
        color: this.color,
        transparent: true,
        opacity: Rig.GIZMO_OPACITY_UNSELECTED,
        linewidth: 2,
        depthTest: false,
      }),
    );
    this.gizmoGroup.add(this.gizmoLines);

    const triGeo = new BufferGeometry();
    triGeo.setAttribute("position", new Float32BufferAttribute(tri, 3));
    this.gizmoTriangle = new Mesh(
      triGeo,
      new MeshBasicMaterial({
        color: this.color,
        transparent: true,
        opacity: Rig.GIZMO_OPACITY_UNSELECTED,
        depthTest: false,
        side: DoubleSide,
      }),
    );
    this.gizmoGroup.add(this.gizmoTriangle);

    this.persCamera.add(this.gizmoGroup);
    this.updateGizmoVisibility();
  }

  override get supportsTransform(): boolean {
    return false;
  }

  public getSelectableObjects(): Object3D[] {
    return this.gizmoGroup.visible ? [this.gizmoLines] : [];
  }

  public getTransformTarget(): Object3D {
    return this.persCamera;
  }

  public getSceneRoot(): Object3D {
    return this.persCamera;
  }

  public getPerspectiveCamera(): PerspectiveCamera {
    return this.persCamera;
  }

  public getControls(): TrackballControls {
    return this.controls;
  }

  public setMode(mode: CameraMode): void {
    this.syncCameras();
    this.activeCamera =
      mode === CameraMode.Orthographic ? this.orthCamera : this.persCamera;
  }

  /** Orient the active rig without moving the orbit target or changing zoom. */
  public orientTo(direction: Vector3, duration = 280): void {
    if (!direction.lengthSq()) return;
    const offset = this.persCamera.position.clone().sub(this.controls.target);
    if (!offset.lengthSq()) return;
    const end = cubeViewDirection(direction);
    const start = offset.clone().normalize();
    const rotation =
      start.dot(end) < -1 + 1e-10
        ? new Quaternion().setFromAxisAngle(
            this.persCamera.up.clone().cross(start).normalize(),
            Math.PI,
          )
        : new Quaternion().setFromUnitVectors(start, end);
    const up = new Vector3(0, 1, 0).applyQuaternion(this.persCamera.quaternion);
    const transportedUp = up.clone().applyQuaternion(rotation);
    const viewUp = cubeViewUp(end, transportedUp);
    const roll = Math.atan2(
      end.dot(transportedUp.clone().cross(viewUp)),
      transportedUp.dot(viewUp),
    );
    this.orientationTransition = {
      start: performance.now(),
      duration,
      offset,
      up,
      rotation,
      roll,
    };
    if (duration <= 0) this.update();
  }

  /** Center the complete model and restore the canonical Top (+Z, screen-up +Y) view. */
  public resetView(bounds: Box3): void {
    this.orientationTransition = undefined;
    const center = bounds.isEmpty()
      ? new Vector3()
      : bounds.getCenter(new Vector3());
    const half = bounds.isEmpty()
      ? new Vector3(50, 50, 50)
      : bounds.getSize(new Vector3()).multiplyScalar(0.5);
    const tangent = Math.tan(MathUtils.degToRad(this.persCamera.fov / 2));
    // Keep margin on both screen axes, including portrait-shaped viewports.
    const halfHeight =
      Math.max(half.y, half.x / this.persCamera.aspect, 0.01) * 1.2;
    const distance =
      this.activeCamera === this.orthCamera
        ? Math.max(halfHeight / tangent, half.z + this.persCamera.near * 2)
        : half.z + Math.max(halfHeight / tangent, this.persCamera.near * 2);
    this.controls.target.copy(center);
    this.persCamera.position.copy(center).add(new Vector3(0, 0, distance));
    this.persCamera.up.set(0, 1, 0);
    this.persCamera.zoom = 1;
    this.persCamera.far = Math.max(this.persCamera.far, distance + half.z + 1);
    this.orthCamera.far = this.persCamera.far;
    this.persCamera.updateProjectionMatrix();
    this.persCamera.lookAt(center);
    this.update();
  }

  public update(): void {
    const transition = this.orientationTransition;
    if (transition) {
      const progress =
        transition.duration <= 0
          ? 1
          : Math.min(
              1,
              (performance.now() - transition.start) / transition.duration,
            );
      const eased = progress * progress * (3 - 2 * progress);
      const rotation = new Quaternion().slerp(transition.rotation, eased);
      this.persCamera.position
        .copy(transition.offset)
        .applyQuaternion(rotation)
        .add(this.controls.target);
      this.persCamera.up
        .copy(transition.up)
        .applyQuaternion(rotation)
        .normalize();
      // Correct screen roll to the nearest equivalent pose after transporting up.
      if (transition.roll) {
        const direction = this.persCamera.position
          .clone()
          .sub(this.controls.target)
          .normalize();
        this.persCamera.up.applyAxisAngle(direction, transition.roll * eased);
      }
      if (progress === 1) this.orientationTransition = undefined;
    }
    this.controls.update();
    this.syncCameras();
  }

  public resize(width: number, height: number): void {
    this.persCamera.aspect = width / height;
    this.persCamera.updateProjectionMatrix();

    const viewSize = 100;
    this.orthCamera.left = -viewSize * (width / height);
    this.orthCamera.right = viewSize * (width / height);
    this.orthCamera.top = viewSize;
    this.orthCamera.bottom = -viewSize;
    this.orthCamera.updateProjectionMatrix();

    this.controls.handleResize();
    this.rebuildGizmoGeometry();
  }

  public setIsActiveCamera(active: boolean): void {
    this._isActiveCamera = active;
    if (!active) this.orientationTransition = undefined;
    this.updateGizmoVisibility();
  }

  public getProperties(): CameraProperties {
    const round2 = (v: number) => Math.round(v * 100) / 100;
    return {
      type: "camera",
      fov: Math.round(this.persCamera.fov * 10) / 10,
      positionX: round2(this.persCamera.position.x),
      positionY: round2(this.persCamera.position.y),
      positionZ: round2(this.persCamera.position.z),
      rotationX: round2(MathUtils.radToDeg(this.persCamera.rotation.x)),
      rotationY: round2(MathUtils.radToDeg(this.persCamera.rotation.y)),
      rotationZ: round2(MathUtils.radToDeg(this.persCamera.rotation.z)),
    };
  }

  public setProperty(key: string, value: number): void {
    switch (key) {
      case "fov":
        this.persCamera.fov = value;
        this.persCamera.updateProjectionMatrix();
        this.rebuildGizmoGeometry();
        break;
      case "positionX":
        this.persCamera.position.x = value;
        break;
      case "positionY":
        this.persCamera.position.y = value;
        break;
      case "positionZ":
        this.persCamera.position.z = value;
        break;
      case "rotationX":
      case "rotationY":
      case "rotationZ": {
        const axis =
          key === "rotationX" ? "x" : key === "rotationY" ? "y" : "z";
        this.persCamera.rotation[axis] = MathUtils.degToRad(value);
        // Saved Euler angles must restore free-orbit roll as well as position.
        this.persCamera.up
          .set(0, 1, 0)
          .applyQuaternion(this.persCamera.quaternion);
        break;
      }
    }
  }

  public setSelected(selected: boolean): void {
    const opacity = selected
      ? Rig.GIZMO_OPACITY_SELECTED
      : Rig.GIZMO_OPACITY_UNSELECTED;
    (this.gizmoLines.material as LineBasicMaterial).opacity = opacity;
    (this.gizmoTriangle.material as MeshBasicMaterial).opacity = opacity;
  }

  public get visible(): boolean {
    return this._userVisible;
  }

  public setVisible(visible: boolean): void {
    this._userVisible = visible;
    this.updateGizmoVisibility();
  }

  public dispose(): void {
    this.orientationTransition = undefined;
    this.pointerNavigation.dispose();
    this.controls.dispose();
    this.gizmoLines.geometry.dispose();
    (this.gizmoLines.material as LineBasicMaterial).dispose();
    this.gizmoTriangle.geometry.dispose();
    (this.gizmoTriangle.material as MeshBasicMaterial).dispose();
  }

  private updateGizmoVisibility(): void {
    this.gizmoGroup.visible = this._userVisible && !this._isActiveCamera;
  }

  private rebuildGizmoGeometry(): void {
    const { lines, tri } = computeGizmoPositions(
      this.persCamera.fov,
      this.persCamera.aspect,
    );
    this.gizmoLines.geometry.setAttribute(
      "position",
      new Float32BufferAttribute(lines, 3),
    );
    this.gizmoTriangle.geometry.setAttribute(
      "position",
      new Float32BufferAttribute(tri, 3),
    );
    this.gizmoLines.geometry.attributes.position.needsUpdate = true;
    this.gizmoTriangle.geometry.attributes.position.needsUpdate = true;
  }

  private syncCameras(): void {
    this.orthCamera.position.copy(this.persCamera.position);
    this.orthCamera.quaternion.copy(this.persCamera.quaternion);
    this.orthCamera.up.copy(this.persCamera.up);

    // Translate perspective distance into ortho zoom so "zoom level" stays in sync.
    const distance = this.persCamera.position.distanceTo(this.controls.target);
    const halfHeight =
      distance * Math.tan(MathUtils.degToRad(this.persCamera.fov / 2));
    this.orthCamera.zoom = this.orthCamera.top / halfHeight;

    this.orthCamera.updateProjectionMatrix();
  }
}

function computeGizmoPositions(
  fov: number,
  aspect: number,
): { lines: number[]; tri: number[] } {
  const d = GIZMO_DISPLAY_DISTANCE;
  const halfH = d * Math.tan(MathUtils.degToRad(fov / 2));
  const halfW = halfH * aspect;
  const triHalfW = halfW * 0.25;
  const triHeight = halfH * 0.45;

  // prettier-ignore
  return {
    lines: [
      0, 0, 0,  -halfW,  halfH, -d,
      0, 0, 0,   halfW,  halfH, -d,
      0, 0, 0,   halfW, -halfH, -d,
      0, 0, 0,  -halfW, -halfH, -d,
      -halfW,  halfH, -d,  halfW,  halfH, -d,
       halfW,  halfH, -d,  halfW, -halfH, -d,
       halfW, -halfH, -d, -halfW, -halfH, -d,
      -halfW, -halfH, -d, -halfW,  halfH, -d,
    ],
    tri: [
      -triHalfW, halfH,             -d,
       triHalfW, halfH,             -d,
       0,        halfH + triHeight, -d,
    ],
  };
}
