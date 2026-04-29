import { commands, ExtensionContext, Uri, window } from "vscode";
import * as k8s from "@kubernetes/client-node";
import { age, showQuickPick } from "./utils";

type Target =
  | { kind: "pod"; pod: k8s.V1Pod }
  | { kind: "deployment"; namespace: string; name: string };

const settingKey = (target: Target, containerName: string) => {
  if (target.kind === "deployment") {
    return `deployment-${JSON.stringify({
      name: target.name,
      namespace: target.namespace,
      containerName,
    })}`;
  }

  const LABELS_TO_IGNORE = [
    "pod-template-hash",
    "rollouts-pod-template-hash",
    "controller-revision-hash",
  ];

  const labels = Object.entries(target.pod.metadata!.labels!).filter(
    ([k, _]) => !LABELS_TO_IGNORE.includes(k),
  );

  return `pod-${JSON.stringify({
    labels,
    namespace: target.pod.metadata!.namespace,
    containerName,
  })}`;
};

interface Setting {
  path: string;
}

const DEPLOYMENT_PREFIX = "deployment/";

export async function quickAttach(context: ExtensionContext) {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();

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
  const appsApi = kc.makeApiClient(k8s.AppsV1Api);

  const namespaces = (await k8sApi.listNamespace()).body.items.map(
    (i) => i.metadata?.name!,
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

  const [pods, deployments] = await Promise.all([
    k8sApi.listNamespacedPod(targetNamespace).then((r) => r.body.items),
    appsApi.listNamespacedDeployment(targetNamespace).then((r) => r.body.items),
  ]);

  const deploymentItems = deployments
    .filter((d) => (d.status?.availableReplicas ?? 0) > 0)
    .map((d) => ({
      label: `${DEPLOYMENT_PREFIX}${d.metadata!.name!}`,
      description: `available: ${d.status?.availableReplicas ?? 0}/${
        d.spec?.replicas ?? 0
      }, age: ${age(d.metadata?.creationTimestamp!)}`,
    }));

  const podItems = pods
    .filter((i) => i.status?.phase === "Running")
    .map((i) => ({
      label: i.metadata?.name!,
      description: `status: ${i.status?.phase}, age: ${age(
        i.status?.startTime!,
      )}`,
    }));

  const targetLabel = await showQuickPick({
    placeholder: "Select Deployment or Pod",
    items: [...deploymentItems, ...podItems],
  });

  if (!targetLabel) {
    return;
  }

  let target: Target;
  let containerNames: string[];
  let podnameValue: string;

  if (targetLabel.startsWith(DEPLOYMENT_PREFIX)) {
    const name = targetLabel.slice(DEPLOYMENT_PREFIX.length);
    const dep = deployments.find((d) => d.metadata?.name === name)!;
    target = { kind: "deployment", namespace: targetNamespace, name };
    containerNames = dep.spec!.template!.spec!.containers.map((c) => c.name);
    podnameValue = `deployment/${name}`;
  } else {
    const pod = pods.find((p) => p.metadata?.name === targetLabel)!;
    target = { kind: "pod", pod };
    containerNames = pod.spec!.containers.map((c) => c.name);
    podnameValue = targetLabel;
  }

  const targetContainerName =
    containerNames.length === 1
      ? containerNames[0]
      : await window.showQuickPick(containerNames, {
          placeHolder: `Select Container in ${targetLabel}`,
        });

  if (!targetContainerName) {
    return;
  }

  const data = {
    context: targetContextName,
    podname: encodeURIComponent(podnameValue),
    namespace: targetNamespace,
    name: targetContainerName,
    // image: image
  };

  const key = settingKey(target, targetContainerName);
  const { path: lastSelectedPath } = context.globalState.get<Setting>(key) || {
    path: undefined,
  };

  const path = await window.showInputBox({
    value: lastSelectedPath,
    placeHolder: "Input path",
  });

  if (!path) {
    return;
  }

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
