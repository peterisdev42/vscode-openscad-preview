import {
  Camera,
  CanvasTexture,
  Color,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  createCubeRegions,
  cubeRegionGeometry,
  cubeLabelQuaternion,
  CubeRegion,
} from "./ViewCubeGeometry";

type RegionMesh = Mesh<
  ReturnType<typeof cubeRegionGeometry>,
  MeshBasicMaterial
>;

/** A Z-up view cube whose bevels are real, separately selectable surfaces. */
export class ViewCubeWidget {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(
    -1.8,
    1.8,
    1.8,
    -1.8,
    0.1,
    20,
  );
  private readonly renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  private readonly raycaster = new Raycaster();
  private readonly regions: RegionMesh[] = [];
  private readonly textures: CanvasTexture[] = [];
  private readonly labels: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly borders: LineSegments<EdgesGeometry, LineBasicMaterial>[] =
    [];
  private hovered: RegionMesh | undefined;
  private pointerDown: { x: number; y: number } | undefined;
  private themeObserver: MutationObserver;
  private faceColor = new Color();
  private edgeColor = new Color();
  private hoverColor = new Color();
  private disposed = false;

  constructor(
    container: HTMLElement,
    private readonly onSelect: (direction: Vector3) => void,
  ) {
    const canvas = this.renderer.domElement;
    this.renderer.setPixelRatio(
      Math.min(Math.max(window.devicePixelRatio || 1, 2), 3),
    );
    this.renderer.setSize(144, 144);
    canvas.classList.add("view-cube");
    canvas.setAttribute(
      "aria-label",
      "View cube. Click a face, edge or corner to orient the camera.",
    );
    canvas.style.cssText =
      "position:absolute;bottom:1rem;right:1rem;width:144px;height:144px;touch-action:none;border-radius:4px;";
    canvas.title = "View cube — select a face, edge or corner";
    container.appendChild(canvas);

    for (const region of createCubeRegions()) {
      const mesh = new Mesh(
        cubeRegionGeometry(region),
        new MeshBasicMaterial(),
      );
      mesh.userData.region = region;
      this.regions.push(mesh);
      this.scene.add(mesh);
      const border = new LineSegments(
        new EdgesGeometry(mesh.geometry),
        new LineBasicMaterial(),
      );
      this.borders.push(border);
      this.scene.add(border);
      if (region.kind === "face") this.addLabel(region);
    }
    this.updateTheme();
    this.themeObserver = new MutationObserver(() => this.updateTheme());
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointercancel", this.onPointerLeave);
    canvas.addEventListener("click", this.onClick);
  }

  private addLabel(region: CubeRegion) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.textures.push(texture);
    const label = new Mesh(
      new PlaneGeometry(1.5, 1.5),
      new MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const normal = region.direction;
    label.position.copy(normal).multiplyScalar(1.002);
    label.userData.region = region;
    this.labels.push(label);
    this.scene.add(label);
  }

  private updateTheme() {
    const style = getComputedStyle(document.body);
    const css = (name: string, fallback: string) =>
      style.getPropertyValue(name).trim() || fallback;
    this.faceColor.set(css("--vscode-editorWidget-background", "#252526"));
    this.edgeColor
      .copy(this.faceColor)
      .lerp(new Color(css("--vscode-foreground", "#cccccc")), 0.15);
    this.hoverColor.set(css("--vscode-focusBorder", "#007fd4"));
    const border = css(
      "--vscode-widget-border",
      css("--vscode-panel-border", "#555555"),
    );
    for (const line of this.borders) line.material.color.set(border);
    this.paintRegions();
    for (const label of this.labels) {
      const region = label.userData.region as CubeRegion;
      const texture = label.material.map as CanvasTexture;
      const canvas = texture.image as HTMLCanvasElement;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.clearRect(0, 0, 1024, 1024);
      ctx.fillStyle = css("--vscode-foreground", "#cccccc");
      ctx.font = `600 256px ${css("--vscode-font-family", "sans-serif")}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(region.label, 512, 512, 928);
      texture.needsUpdate = true;
    }
  }

  private paintRegions() {
    for (const mesh of this.regions)
      mesh.material.color.copy(
        mesh === this.hovered
          ? this.hoverColor
          : (mesh.userData.region as CubeRegion).kind === "face"
            ? this.faceColor
            : this.edgeColor,
      );
  }

  private pick(event: MouseEvent): RegionMesh | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    return this.raycaster.intersectObjects(this.regions, false)[0]?.object as
      | RegionMesh
      | undefined;
  }

  private onPointerMove = (event: PointerEvent) => {
    this.hovered = this.pick(event);
    this.renderer.domElement.style.cursor = this.hovered
      ? "pointer"
      : "default";
    const region = this.hovered?.userData.region as CubeRegion | undefined;
    this.renderer.domElement.title = region
      ? `${region.label} view`
      : "View cube — select a face, edge or corner";
    this.paintRegions();
  };

  private onPointerLeave = () => {
    this.hovered = undefined;
    this.pointerDown = undefined;
    this.renderer.domElement.style.cursor = "default";
    this.paintRegions();
  };

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    this.pointerDown = { x: event.clientX, y: event.clientY };
  };

  private onClick = (event: MouseEvent) => {
    event.stopPropagation();
    const start = this.pointerDown;
    this.pointerDown = undefined;
    if (
      event.button !== 0 ||
      !start ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4
    )
      return;
    const region = this.pick(event)?.userData.region as CubeRegion | undefined;
    if (region) this.onSelect(region.direction.clone());
  };

  update(mainCamera: Camera) {
    // Copy rotation, including roll, instead of lookAt at the Z-up poles.
    this.camera.quaternion.copy(mainCamera.quaternion);
    this.camera.position.set(0, 0, 6).applyQuaternion(mainCamera.quaternion);
    this.camera.updateMatrixWorld();
    const facing = new Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion);
    for (const label of this.labels) {
      const normal = (label.userData.region as CubeRegion).direction;
      // Hide back faces and nearly edge-on text instead of showing slivers.
      label.visible = normal.dot(facing) > 0.03;
      label.quaternion.copy(
        cubeLabelQuaternion(normal, this.camera.quaternion),
      );
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.themeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointercancel", this.onPointerLeave);
    canvas.removeEventListener("click", this.onClick);
    for (const mesh of [...this.regions, ...this.labels]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    for (const line of this.borders) {
      line.geometry.dispose();
      line.material.dispose();
    }
    for (const texture of this.textures) texture.dispose();
    this.renderer.dispose();
    canvas.remove();
  }
}
