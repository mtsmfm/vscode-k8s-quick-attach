import { commands, ExtensionContext } from "vscode";
import { quickAttach } from "./quickAttach";

export function activate(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand(
      "vscode-k8s-quick-attach.quickAttach",
      async () => {
        quickAttach(context);
      }
    )
  );
}
