# OpenSCAD Preview

![Interactive 3D Preview Interface](docs/assets/interface.png)

An integrated, interactive 3D preview environment for OpenSCAD (`.scad`) files built for Visual Studio Code. Write your code and instantly visualize your 3D models with robust native UI toolbars, hardware-accelerated rendering, intelligent parameter tweaking, and seamless multi-format slicer integration.

## ✨ Features

### Theme & UI

- **Model Colors:** The default 3D rendering colors dynamically inherit from your active VS Code theme instead of the default OpenSCAD colors, while still respecting custom color declarations from your `.scad` code.
- **UI Theme:** The user interface fully integrates with your active VS Code theme and the recommended standard UI elements.

### 3D Preview

- **Measurements:** Use the button directly below Measure to clear all measurement lines and any unfinished measurement.
- **Reset View:** The reset button beside the projection controls centers and fits the entire model, then restores the Top view (+Z, screen-up +Y), preserving the projection mode.
- **Camera Controls:** Switch between perspective and orthographic camera modes. The bottom-right view cube snaps the camera to six face, twelve edge, and eight corner views with a short transition, preserving the orbit target, distance, and projection mode. Camera dragging uses a free trackball, and all cube clicks calibrate the camera roll: faces and edges align to the nearest screen axes, and corners use the nearest isometric orientation. Clicking preserves orbit continuity across the poles instead of forcing world Z upward. Face labels use high-resolution, anisotropically filtered textures. Its colors follow the VS Code theme; OpenSCAD coordinates remain Z-up (Top +Z, Front −Y, Right +X).
- **Visual Environments:** Toggle between a familiar grid, an accurate 256mm² build plate, or a blank environment.
- **Render Modes:** Swap between solid, x-ray (translucent), and wireframe rendering.
- **Colors:** Although color declarations in your code are respected, you can toggle them globally, allowing you to switch between a colored and monochrome preview.
- **Lighting:** The scene includes both ambient and directional lighting, with togglable dynamic shadows.
- **Cross Section:** Slice through your model with an interactive cutting plane. Click the plane to select it, then use **W** to translate or **E** to rotate. Hold **Ctrl** while dragging to snap to 1 mm / 5° increments. Click anywhere outside the plane to deselect it.

> The preview is rendered using [Three.js](https://threejs.org/), so many additions are possible in the future. [Let me know](https://github.com/thijsdaniels/vscode-openscad-preview/issues) if you have any suggestions!

### Parameters & Presets

- **Live Parameter Controls:** Automatically parses OpenSCAD variables and generates an interactive UI panel. Drag sliders, toggle booleans, and type values while the 3D model hot-reloads instantly.
- **Override Tracking:** Visually track which variables you've overridden in the UI, and click the "Revert" button to instantly fall back to the raw source code value.
- **Save Custom Presets:** Configure your perfect dimensions and save them as named preset groups (stored in local JSON files following the OpenSCAD specification) to seamlessly switch between configurations without code modifications.

### Export & Print

- **1-Click Slicer Handoff:** Fully configured to communicate with external applications. Click the Print button to instantly compile and send your model straight to your preferred software (PrusaSlicer, Bambu Studio, UltiMaker Cura, etc) without the need to store any intermediate files.
- **Format Flexibility:** Supports the universal `STL` format, as well as modern `3MF` files which preserve 3D model color data (requires OpenSCAD Nightly).
  > More formats will be supported in the future.

### CLI Output

- **Dedicated Log UI:** Eliminates terminal spam. The integrated Output panel natively intercepts the OpenSCAD compiler logs.
- **Improved Error Tracing:** Errors and warnings are distinctly highlighted. Multi-line compiler stack traces are grouped into clean collapsible panels for effortless debugging.
- **Auto-Clear Workflow:** Toggle the eraser icon to automatically flush outdated logs when you render a fresh frame.

### Syntax Highlighting & Snippets

- Built-in grammar definitions provide rich syntax highlighting out of the box.
  > This extension does not currently include a language server. For LSP support, I recommend combining this extension with the [OpenSCAD Language Support](https://marketplace.visualstudio.com/items?itemName=Leathong.openscad-language-support) extension by [Leathong](https://marketplace.visualstudio.com/publishers/Leathong).
- Included developer snippets to accelerate your parametric scripting.

## ⚠️ Requirements

- **OpenScad CLI**: A local installation of [OpenSCAD](https://openscad.org/downloads.html#snapshots) must be present on your system path.
  > It is recommended to install a recent nightly build of OpenSCAD to utilize the advanced `3mf` rendering configuration (which preserves `.scad` model colors). The years old stable version (`2021.01`) only supports the monochrome `STL` format.

## 🚀 Getting Started

1. Open any OpenSCAD (`.scad`) file in Visual Studio Code.
2. Click the **Preview Icon** in the top-right editor title bar.
   > Alternatively, trigger `OpenSCAD: Open as Preview` in the Command Palette, or use `Cmd+Shift+V` / `Ctrl+Shift+V`.
3. The current tab switches to the interactive 3D viewer. Click **Reopen as source file** in its title bar, or press the same shortcut, to return to the source in the same tab. Opening a `.scad` file still defaults to the source editor.

Unsaved edits are previewed without saving the file. Relative `include`, `use`, and `import` paths resolve from the source file's directory. Save new untitled documents as `.scad` files before previewing.

The tab switch uses `reopenActiveEditorWith`, the same internal workbench command used by the bundled Markdown extension. Recheck this integration when upgrading Code OSS.

## ⚙️ Configuration

Customize the extension inside VS Code Settings (`Cmd+,`):

- **`openscad.previewFormat`**: The protocol logic used bridging OpenSCAD to VS Code. Options are `3mf` (default) or `stl`.
- **`openscad.slicerExecutable`**: You can optionally provide the absolute system path to your slicing software. If left blank, your OS's default 3D model handler will be invoked.

## 📝 Feedback

- If you have any feedback, feature requests, or bug reports, please open an issue on the [GitHub repository](https://github.com/thijsdaniels/vscode-openscad-preview).
- If you would like to fork this project or contribute to it by creating a pull request, please feel free to do so! This project is provided under the [MIT license](LICENSE.md).
- If you would like to support the development of this extension, please consider [sponsoring me](https://github.com/sponsors/thijsdaniels).

## Development checks

Run `npm run types` and `npm run lint`. To test tab replacement and unsaved text in a real Code OSS extension host:

```sh
VSCODE_EXECUTABLE_PATH=../vscode/scripts/code.sh npm run test:editor
```

The editor test uses an isolated temporary profile and a fake CLI, so it does not require OpenSCAD installed. It checks repeated source/preview switches, tab count, dirty text preservation, stdin and working-directory forwarding, and opening through **Open With**.

On the current Code OSS checkout, the workbench can log `CustomEditorInput.applyOptions` / `selection` errors while reopening custom editors. The editor integration assertions still pass; this workbench issue is outside the preview extension. The test uses a fake CLI and does not validate OpenSCAD geometry generation.

The title-bar preview/source buttons use the same icons and navigation group as Markdown. Code OSS also shows its native editor-type dropdown in the breadcrumbs bar for `.scad` files, listing **Text Editor** and **OpenSCAD Preview**, through the `customEditors` contribution. Its visibility follows `breadcrumbs.enabled`, `breadcrumbs.showEditorType`, and the workbench editor visibility preferences.

Run `npm run test:view-cube` for the 26 view directions, independent face/edge/corner picking, closed geometry, and Z-up pole handling.

`src/test/cameraNavigation.browser.ts` checks all 26 calibrated targets after repeated rolled views in both projection modes, pose restoration, complete horizontal and vertical orbits, and smooth animated calibration across poles, edges and corners.

## Viewport controls and panels

- Left-drag rotates with a free trackball at gain 1.0. Every pointer sample is consumed before the next input event, with no inertial damping. Right-drag (or Shift/Ctrl/Cmd + left-drag) pans one CSS pixel per pointer pixel in perspective and orthographic modes.
- The entire right sidebar starts closed for each new preview. Use **Toggle Side Panel** at the top right to open Scene, Parameters and Preset controls.
- To delete a measurement, open the sidebar, hover its **Measurement** row under **Scene**, and click the trash **Remove** button. This removes both the line and its dimension label.
- Left toolbar: Select; Move, Rotate and Scale the selected scene object; Measure with Vertex, Edge or Face snapping. Right toolbar: camera selection; perspective/orthographic projection; solid/X-Ray/wireframe rendering; shadows; environment; log and sidebar visibility. Hover any icon for its label.
- With **Build Plate** enabled, **Plate origin: center** retains the existing centered layout. **Plate origin: lower-left** places the lower-left of the existing 250 × 250 printable grid at world `(0, 0, 0)`, moving the plate and grid together. Decorative plate tabs may extend outside the printable grid. The model and camera target stay in place.

Run `npm run test:viewport` to check 1:1 screen-space panning across projections, FOVs and distances, and both build plate origins. The browser navigation regression also checks that real input handlers consume rotation samples without waiting for a render frame.
