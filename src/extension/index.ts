import { ExtensionContext, window } from "vscode";
import {
  previewEditorViewType,
  registerShowPanelCommand,
} from "./commands/showPanel";
import { ScadSessionManager } from "./core/ScadSessionManager";
import { ScadClient } from "./services/ScadClient";

import { ScadPreviewEditorProvider } from "./views/ScadPreviewEditorProvider";

let sessionManager: ScadSessionManager | undefined;

export function activate(context: ExtensionContext) {
  context.subscriptions.push(ScadClient.outputChannel);

  sessionManager = new ScadSessionManager();

  context.subscriptions.push(
    sessionManager,
    registerShowPanelCommand(),
    window.registerCustomEditorProvider(
      previewEditorViewType,
      new ScadPreviewEditorProvider(context, sessionManager),
      {
        webviewOptions: { enableFindWidget: true },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
  );
}

export function deactivate() {
  if (sessionManager) {
    sessionManager.dispose();
  }
}
