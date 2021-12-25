import { QuickPickItem, window } from "vscode";

export const age = (date: Date) => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

  let interval = Math.floor(seconds / 86400);
  if (interval > 1) {
    return `${interval}d`;
  }
  interval = Math.floor(seconds / 3600);
  if (interval > 1) {
    return `${interval}h`;
  }
  interval = Math.floor(seconds / 60);
  if (interval > 1) {
    return `${interval}m`;
  }
  interval = Math.floor(seconds);
  return `${interval}s`;
};

export const showQuickPick = async ({
  items,
  activeItemLabel,
  placeholder,
}: {
  items: QuickPickItem[];
  activeItemLabel?: string;
  placeholder?: string;
}) => {
  return await new Promise<string | undefined>((resolve, _reject) => {
    const quickPick = window.createQuickPick();
    quickPick.items = items;
    quickPick.placeholder = placeholder;

    if (activeItemLabel) {
      quickPick.activeItems = [
        items[items.findIndex((i) => i.label === activeItemLabel)],
      ];
    }

    quickPick.onDidChangeSelection((e) => {
      resolve(e[0].label);
      quickPick.dispose();
    });

    quickPick.onDidHide(() => {
      resolve(undefined);
    });

    quickPick.show();
  });
};
