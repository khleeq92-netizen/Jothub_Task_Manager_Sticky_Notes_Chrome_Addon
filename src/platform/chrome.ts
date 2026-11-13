import type { Platform } from './types';

// Firefox exposes the same promise-based API as `browser`.
const api: typeof chrome = (globalThis as any).browser ?? (globalThis as any).chrome;

// ---- side panel state (used by the open/close shortcut) ----
const PANELS_KEY = 'jh-panel-windows';
let panelWindows: Set<number> | null = null;

async function loadPanels(): Promise<Set<number>> {
  if (panelWindows) return panelWindows;
  const items: Record<string, unknown> = (await api.storage.session?.get(PANELS_KEY).catch(() => ({}))) ?? {};
  const stored = items[PANELS_KEY];
  panelWindows ??= new Set(Array.isArray(stored) ? stored : []);
  return panelWindows;
}

async function updatePanels(change: (set: Set<number>) => void) {
  const set = await loadPanels();
  change(set);
  await api.storage.session?.set({ [PANELS_KEY]: [...set] }).catch(() => {});
}

/** Whether our panel is open in that window, as known right now (before any new open). */
function panelOpenIn(windowId: number): Promise<boolean> {
  const side = (api as any).sidePanel;
  if (side?.onOpened && side?.onClosed) {
    if (panelWindows) return Promise.resolve(panelWindows.has(windowId)); // snapshot, same tick
    return loadPanels().then((set) => set.has(windowId));
  }
  // Older Chrome: no per-window events. Side panel contexts carry no window id,
  // so this can only tell whether a panel is open somewhere.
  return (api.runtime as any)
    .getContexts({ contextTypes: ['SIDE_PANEL'] })
    .then((contexts: chrome.runtime.ExtensionContext[]) => contexts.length > 0)
    .catch(() => false);
}

export function createChromePlatform(): Platform {
  let panelWindowId: number | undefined;

  const normalTab = async (): Promise<chrome.tabs.Tab | undefined> => {
    const tabs = await api.tabs.query({ active: true, windowType: 'normal' });
    return tabs.sort((a, b) => ((b as any).lastAccessed ?? 0) - ((a as any).lastAccessed ?? 0))[0];
  };

  const sendOnce = async (tabId: number, message: unknown) => {
    try {
      return (await api.tabs.sendMessage(tabId, message)) ?? null;
    } catch {
      return null; // nothing listening on that page
    }
  };

  /**
   * Sends to the page's content script. Tabs that were already open when the
   * extension was installed, updated or reloaded have no live content script
   * until they are refreshed, so add it now and try again. Browser pages
   * (chrome://, the Web Store, PDFs) still refuse.
   */
  const send = async (tabId: number, message: unknown) => {
    const first = await sendOnce(tabId, message);
    if (first != null) return first;
    try {
      await api.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    } catch {
      return null;
    }
    return sendOnce(tabId, message);
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
      async injectAll() {
        const tabs = await api.tabs.query({ url: ['http://*/*', 'https://*/*'] });
        let added = 0;
        for (const tab of tabs) {
          if (tab.id == null || tab.discarded) continue;
          if ((await sendOnce(tab.id, { type: 'jh-ping' })) != null) continue; // already has a live one
          try {
            await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
            added++;
          } catch {
            // a page that refuses scripts (Web Store, error pages)
          }
        }
        return added;
      },
      async activeTabId() {
        return (await normalTab())?.id;
      },
    },
    windows: {
      async popout(url, width, height) {
        await api.windows.create({ url, type: 'popup', width, height });
      },
      async alert(url, width, height) {
        // Centre it over the window the user was last working in.
        const base = await api.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
        const position =
          base?.left != null && base.top != null && base.width && base.height
            ? { left: Math.round(base.left + (base.width - width) / 2), top: Math.round(base.top + Math.max(40, (base.height - height) / 3)) }
            : {};
        const win = await api.windows.create({ url, type: 'popup', width, height, focused: true, ...position });
        if (win?.id != null) await api.windows.update(win.id, { focused: true, drawAttention: true }).catch(() => {});
        return win?.id;
      },
      async raise(id) {
        try {
          await api.windows.update(id, { focused: true, drawAttention: true });
          return true;
        } catch {
          return false;
        }
      },
      onRemoved: (cb) => api.windows.onRemoved.addListener((id) => cb(id)),
    },
    sound: {
      async play() {
        const off = (api as any).offscreen;
        if (!off) return false;
        try {
          await off.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK'], justification: 'Plays the task reminder sound.' });
        } catch {
          // Already open: fine.
        }
        try {
          return !!(await api.runtime.sendMessage({ target: 'jh-offscreen', action: 'play' }));
        } catch {
          return false;
        }
      },
      async stop() {
        try {
          await (api as any).offscreen?.closeDocument();
        } catch {
          // Nothing playing.
        }
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
      watch() {
        const side = (api as any).sidePanel;
        if (!side?.onOpened || !side?.onClosed) return;
        // Which windows have our panel open. Kept in memory and in session
        // storage, so a restarted service worker still knows.
        side.onOpened.addListener((info: { windowId: number }) => void updatePanels((set) => set.add(info.windowId)));
        side.onClosed.addListener((info: { windowId: number }) => void updatePanels((set) => set.delete(info.windowId)));
        api.windows.onRemoved.addListener((id) => void updatePanels((set) => set.delete(id)));
      },
      toggleIn(windowId) {
        const side = (api as any).sidePanel;
        // Read the current state *before* opening, in the same tick: Chrome only
        // lets sidePanel.open() run right after the key press, so it cannot wait
        // for the answer. Opening an already-open panel does nothing.
        const wasOpen = panelOpenIn(windowId);
        const opening: Promise<void> = side.open({ windowId });
        return wasOpen.then(async (open) => {
          if (!open) {
            await opening; // report a failure to open
            return 'opened' as const;
          }
          await opening.catch(() => {});
          try {
            await side.close({ windowId });
          } catch {
            // Older Chrome without sidePanel.close(): ask the panel page to close itself.
            await api.runtime.sendMessage({ type: 'jh-close-panel', windowId }).catch(() => {});
          }
          return 'closed' as const;
        });
      },
      listenForClose() {
        api.runtime.onMessage.addListener((message) => {
          if (message?.type !== 'jh-close-panel') return undefined;
          void api.windows.getCurrent().then((w) => {
            if (message.windowId == null || w.id === message.windowId) window.close();
          });
          return undefined;
        });
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
          requireInteraction: true,
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
      onCommand: (cb) => api.commands?.onCommand.addListener((name, tab) => cb(name, tab?.id, tab?.windowId)),
      async list() {
        const all = (await api.commands?.getAll()) ?? [];
        return all.map((c) => ({ name: c.name ?? '', description: c.name === '_execute_action' ? 'Open the toolbar popup' : (c.description ?? ''), shortcut: c.shortcut ?? '' }));
      },
    },
  };
}
