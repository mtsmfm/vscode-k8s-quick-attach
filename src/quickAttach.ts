import { commands, ExtensionContext, Uri, window } from "vscode";
import * as cp from "child_process";

interface GetPodResult {
  items: Array<{
    metadata: {
      name: string;
      namespace: string;
      labels: { [key: string]: string };
    };
    spec: {
      containers: Array<{
        name: string;
      }>;
    };
  }>;
}

const settingKey = (pod: GetPodResult["items"][0], containerName: string) => {
  const LABELS_TO_IGNORE = ["pod-template-hash"];

  const labels = Object.entries(pod.metadata.labels).filter(
    ([k, _]) => !LABELS_TO_IGNORE.includes(k)
  );

  return `pod-${JSON.stringify({
    labels,
    namespace: pod.metadata.namespace,
    containerName,
  })}`;
};

interface Setting {
  path: string;
}

export async function quickAttach(context: ExtensionContext) {
  const getPodResult: GetPodResult = JSON.parse(
    cp.execSync("kubectl get pod -o json").toString()
  );

  const podNames = getPodResult.items.map((i) => i.metadata.name);

  const podName = await window.showQuickPick(podNames, {
    placeHolder: "Select Pod",
  });

  if (!podName) {
    return;
  }

  const podData = getPodResult.items.find((i) => i.metadata.name === podName)!;
  const namespace = podData.metadata.namespace;

  const containerNames = podData.spec.containers.map((c) => c.name);
  const containerName =
    containerNames.length === 1
      ? containerNames[0]
      : await window.showQuickPick(containerNames, {
          placeHolder: `Select Container in ${podName}`,
        });

  if (!containerName) {
    return;
  }

  const data = {
    // context: k8sContext,
    podname: podName,
    namespace,
    name: containerName,
    // image: image
  };

  const key = settingKey(podData, containerName);
  const { path: lastSelectedPath } = context.globalState.get<Setting>(key) || {
    path: undefined,
  };

  const path = await window.showInputBox({
    value: lastSelectedPath,
    placeHolder: "Input path",
  });

  context.globalState.update(key, { path });

  const uri = Uri.from({
    scheme: "vscode-remote",
    authority: `k8s-container+${Object.entries(data)
      .map((xs) => xs.join("="))
      .join("+")}`,
    path,
  });

  await commands.executeCommand("vscode.openFolder", uri, {
    forceNewWindow: true,
  });
}
