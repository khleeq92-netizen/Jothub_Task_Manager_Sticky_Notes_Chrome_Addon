import type { Platform } from './types';

// Firefox exposes the same promise-based API as `browser`.
const api: typeof chrome = (globalThis as any).browser ?? (globalThis as any).chrome;

export function createChromePlatform(): Platform {
  let panelWindowId: number | undefined;

  const normalTab = async (): Promise<chrome.tabs.Tab | undefined> => {
    const tabs = await api.tabs.query({ active: true, windowType: 'normal' });
    return tabs.sort((a, b) => ((b as any).lastAccessed ?? 0) - ((a as any).lastAccessed ?? 0))[0];
  };

  const send = async (tabId: number, message: unknown) => {
    try {
      return (await api.tabs.sendMessage(tabId, message)) ?? null;
    } catch {
      return null; // no content script on that page (chrome://, the Web Store, …)
    }
  };

  return {
    name: 'chrome',
    storage: {
      get: (keys) => api.storage.local.get(keys),
      set: (items) => api.storage.local.set(items),
      remove: (keys) => api.storage.local.remove(keys),
      onChanged(cb) {
        const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
          if (area === 'local') cb(changes);
        };
        api.storage.onChanged.addListener(listener);
        return () => api.storage.onChanged.removeListener(listener);
      },
    },
    runtime: {
      async send(message) {
        const reply = await api.runtime.sendMessage(message);
        if (reply && typeof reply === 'object' && '__error' in reply) throw new Error(String(reply.__error));
        return reply;
      },
      onMessage(handler) {
        api.runtime.onMessage.addListener((message, sender, respond) => {
          const result = handler(message, { tabId: sender.tab?.id, url: sender.url });
          if (!result) return undefined;
          result.then(
            (value) => respond(value ?? null),
            (error) => respond({ __error: error?.message ?? String(error) }),
          );
          return true;
        });
      },
      url: (path) => api.runtime.getURL(path),
      onInstalled: (cb) => api.runtime.onInstalled.addListener(() => cb()),
      onStartup: (cb) => api.runtime.onStartup.addListener(() => cb()),
    },
    tabs: {
      async open(url) {
        await api.tabs.create({ url });
      },
      send,
      async sendToActive(message) {
        const tab = await normalTab();
        return tab?.id != null ? send(tab.id, message) : null;
      },
      async activeTabId() {
        return (await normalTab())?.id;
      },
    },
    windows: {
      async popout(url, width, height) {
        await api.windows.create({ url, type: 'popup', width, height });
      },
    },
    sidePanel: {
      supported: !!(api as any).sidePanel?.open,
      prepare() {
        api.windows
          .getLastFocused({ windowTypes: ['normal'] })
          .then((w) => (panelWindowId = w.id))
          .catch(() => {});
      },
      async open() {
        if (panelWindowId == null) throw new Error('No browser window to open the side panel in.');
        await (api as any).sidePanel.open({ windowId: panelWindowId });
      },
    },
    alarms: {
      async set(name, options) {
        await api.alarms.create(name, options);
      },
      async clear(name) {
        await api.alarms.clear(name);
      },
      onAlarm: (cb) => api.alarms.onAlarm.addListener((alarm) => cb(alarm.name)),
    },
    notifications: {
      async show(id, title, message) {
        await api.notifications.create(id, {
          type: 'basic',
          iconUrl: api.runtime.getURL('icons/icon128.png'),
          title,
          message,
          priority: 2,
        });
      },
      onClick: (cb) =>
        api.notifications.onClicked.addListener((id) => {
          api.notifications.clear(id);
          cb(id);
        }),
    },
    identity: {
      redirectUrl: () => api.identity.getRedirectURL(),
      async authFlow(url) {
        const result = await api.identity.launchWebAuthFlow({ url, interactive: true });
        if (!result) throw new Error('Sign-in was cancelled.');
        return result;
      },
    },
    menus: {
      async setup(items) {
        await api.contextMenus.removeAll();
        for (const item of items) api.contextMenus.create(item);
      },
      onClick: (cb) =>
        api.contextMenus.onClicked.addListener((info, tab) =>
          cb({ id: String(info.menuItemId), selectionText: info.selectionText, pageUrl: info.pageUrl, tabId: tab?.id }),
        ),
    },
    commands: {
      onCommand: (cb) => api.commands?.onCommand.addListener((name, tab) => cb(name, tab?.id)),
    },
  };
}
