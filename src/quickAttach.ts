import * as fs from "fs";
import * as path from "path";
import { commands, ExtensionContext, Uri, window } from "vscode";
import * as k8s from "@kubernetes/client-node";
import { age, showQuickPick } from "./utils";

const settingKey = (pod: k8s.V1Pod, containerName: string) => {
  const LABELS_TO_IGNORE = [
    "pod-template-hash",
    "rollouts-pod-template-hash",
    "controller-revision-hash",
  ];

  const labels = Object.entries(pod.metadata!.labels!).filter(
    ([k, _]) => !LABELS_TO_IGNORE.includes(k)
  );

  return `pod-${JSON.stringify({
    labels,
    namespace: pod.metadata!.namespace,
    containerName,
  })}`;
};

interface Setting {
  path: string;
}

export async function quickAttach(context: ExtensionContext) {
  const kubeDir = path.join(process.env.HOME || "", ".kube");
  const configFiles = fs
    .readdirSync(kubeDir)
    .filter((f) => f.startsWith("config"));

  const selectedConfig = await showQuickPick({
    placeholder: "Select kubeconfig file",
    items: configFiles.map((f) => ({ label: f })),
    activeItemLabel: "config",
  });

  if (!selectedConfig) return;

  const kc = new k8s.KubeConfig();
  kc.loadFromFile(path.join(kubeDir, selectedConfig));

  const targetContextName = await showQuickPick({
    placeholder: "Select Context",
    items: kc.contexts.map((c) => ({
      label: c.name,
    })),
    activeItemLabel: kc.currentContext,
  });

  if (!targetContextName) {
    return;
  }

  kc.setCurrentContext(targetContextName);
  const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

  const namespaces = (await k8sApi.listNamespace()).body.items.map(
    (i) => i.metadata?.name!
  );

  const defaultNamespace =
    kc.contexts.find((c) => c.name === targetContextName)!.namespace ||
    namespaces.find((n) => n === "default");

  const targetNamespace = await showQuickPick({
    placeholder: "Select Namespace",
    items: namespaces.map((n) => ({ label: n })),
    activeItemLabel: defaultNamespace,
  });

  if (!targetNamespace) {
    return;
  }

  const pods = (await k8sApi.listNamespacedPod(targetNamespace)).body.items;

  const targetPodname = await showQuickPick({
    placeholder: "Select Pod",
    items: pods
      .filter((i) => i.status?.phase === "Running")
      .map((i) => ({
        label: i.metadata?.name!,
        description: `status: ${i.status?.phase}, age: ${age(
          i.status?.startTime!
        )}`,
      })),
    activeItemLabel: defaultNamespace,
  });

  if (!targetPodname) {
    return;
  }

  const targetPod = pods.find((p) => p.metadata?.name === targetPodname)!;
  const containerNames = targetPod.spec!.containers.map((c) => c.name);
  const targetContainerName =
    containerNames.length === 1
      ? containerNames[0]
      : await window.showQuickPick(containerNames, {
          placeHolder: `Select Container in ${targetPodname}`,
        });

  if (!targetContainerName) {
    return;
  }

  const data = {
    context: targetContextName,
    podname: targetPodname,
    namespace: targetNamespace,
    name: targetContainerName,
    // image: image
  };

  const key = settingKey(targetPod, targetContainerName);
  const { path: lastSelectedPath } = context.globalState.get<Setting>(key) || {
    path: undefined,
  };

  const targetPath = await window.showInputBox({
    value: lastSelectedPath,
    placeHolder: "Input path",
  });
  
  if (!targetPath) {
    return;
  }
  
  context.globalState.update(key, { path: targetPath });
  
  const uri = Uri.from({
    scheme: "vscode-remote",
    authority: `k8s-container+${Object.entries(data)
      .map((xs) => xs.join("="))
      .join("+")}`,
    path: targetPath,
  });

  await commands.executeCommand("vscode.openFolder", uri, {
    forceNewWindow: true,
  });
}
