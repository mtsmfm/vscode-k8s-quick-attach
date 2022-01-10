import { commands, ExtensionContext, window } from "vscode";
import { quickAttach } from "./quickAttach";

export function activate(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand(
      "vscode-k8s-quick-attach.quickAttach",
      async () => {
        try {
          await quickAttach(context);
        } catch (e) {
          if (typeof e === "string") {
            window.showErrorMessage(e);
          } else if (e instanceof Error) {
            window.showErrorMessage(e.message);
          } else {
            console.error(e);
          }
        }
      }
    )
  );
}
