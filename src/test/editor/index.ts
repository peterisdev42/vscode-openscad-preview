import * as assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

const viewType = "openscad.preview.editor";

async function waitFor(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("Timed out waiting for preview editor");
}

export async function run() {
  const directory = await realpath(
    await mkdtemp(path.join(tmpdir(), "scad-editor-test-")),
  );
  const uri = vscode.Uri.file(path.join(directory, "model.scad"));
  const trace = path.join(directory, "render.json");
  const cli = path.join(directory, "openscad.cjs");
  const config = vscode.workspace.getConfiguration("openscad");
  const oldExecutable = config.inspect("executablePath")?.globalValue;
  const oldFormat = config.inspect("previewFormat")?.globalValue;
  try {
    // Exercise the real extension host and subprocess boundary without needing
    // OpenSCAD installed. Record stdin/cwd and produce a minimal STL fixture.
    await writeFile(
      cli,
      `#!/bin/sh
/bin/cat > '${trace}'
/bin/pwd > '${trace}.cwd'
for arg in "$@"; do /usr/bin/printf '%s\\n' "$arg"; done > '${trace}.args'
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then shift; output="$1"; fi
  shift
done
/usr/bin/printf 'solid test\\nfacet normal 0 0 1\\nouter loop\\nvertex 0 0 0\\nvertex 1 0 0\\nvertex 0 1 0\\nendloop\\nendfacet\\nendsolid test\\n' > "$output"
`,
      { mode: 0o755 },
    );
    await writeFile(uri.fsPath, "cube(1);\n");
    await config.update(
      "executablePath",
      cli,
      vscode.ConfigurationTarget.Global,
    );
    await config.update(
      "previewFormat",
      "stl",
      vscode.ConfigurationTarget.Global,
    );
    const extension = vscode.extensions.getExtension(
      "thijsdaniels.vscode-openscad-preview",
    );
    assert.ok(extension);
    await extension.activate();
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: false });
    const group = vscode.window.tabGroups.activeTabGroup;
    const count = group.tabs.length;
    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, new vscode.Position(0, 0), "// unsaved source\n");
    await vscode.workspace.applyEdit(edit);
    assert.equal(document.isDirty, true);

    for (let i = 0; i < 3; i++) {
      await rm(trace, { force: true });
      await vscode.commands.executeCommand("openscad.togglePreview");
      await waitFor(() => {
        const input = group.activeTab?.input;
        return (
          input instanceof vscode.TabInputCustom && input.viewType === viewType
        );
      });
      assert.equal(
        group.tabs.length,
        count,
        "Preview must replace the source tab",
      );
      assert.equal(vscode.window.tabGroups.activeTabGroup, group);
      await waitFor(async () => {
        try {
          return (
            (await readFile(trace, "utf8")) === document.getText() &&
            (await readFile(trace + ".cwd", "utf8")).trim() === directory &&
            (await readFile(trace + ".args", "utf8")).trim().endsWith("\n-")
          );
        } catch {
          return false;
        }
      });
      await vscode.commands.executeCommand("openscad.togglePreview");
      await waitFor(
        () =>
          vscode.window.activeTextEditor?.document.uri.toString() ===
          uri.toString(),
      );
      assert.equal(
        group.tabs.length,
        count,
        "Source must replace the preview tab",
      );
      assert.equal(
        document.isDirty,
        true,
        "Switching must preserve unsaved edits",
      );
      assert.equal(await readFile(uri.fsPath, "utf8"), "cube(1);\n");
    }
    await document.save();
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    await vscode.commands.executeCommand("vscode.openWith", uri, viewType);
    await waitFor(
      () => group.activeTab?.input instanceof vscode.TabInputCustom,
    );
    await vscode.commands.executeCommand("openscad.showSource");
    await waitFor(
      () =>
        vscode.window.activeTextEditor?.document.uri.toString() ===
        uri.toString(),
    );
    console.log(
      "PASS: tab replacement, repeated toggles, dirty text, CLI stdin/cwd, Open With and return to source",
    );
  } catch (error) {
    for (const file of [trace, trace + ".cwd", trace + ".args"]) {
      console.error(file, await readFile(file, "utf8").catch(String));
    }
    throw error;
  } finally {
    await config.update(
      "executablePath",
      oldExecutable,
      vscode.ConfigurationTarget.Global,
    );
    await config.update(
      "previewFormat",
      oldFormat,
      vscode.ConfigurationTarget.Global,
    );
    await vscode.commands.executeCommand("workbench.action.files.revert");
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await rm(directory, { recursive: true, force: true });
  }
}
