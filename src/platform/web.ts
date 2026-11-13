import type { Platform, StorageChanges } from './types';

// A plain-web implementation: used when the app is opened as a normal page
// during development, and (with the in-memory backing) by the unit tests.

interface Backing {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

const PREFIX = 'jh:';

function memoryBacking(): Backing {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}

function localStorageBacking(): Backing {
  return {
    getItem: (k) => localStorage.getItem(PREFIX + k),
    setItem: (k, v) => localStorage.setItem(PREFIX + k, v),
    removeItem: (k) => localStorage.removeItem(PREFIX + k),
    keys: () =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith(PREFIX))
        .map((k) => k.slice(PREFIX.length)),
  };
}

export function createWebPlatform(persist = typeof localStorage !== 'undefined'): Platform {
  const backing = persist ? localStorageBacking() : memoryBacking();
  const storageListeners = new Set<(c: StorageChanges) => void>();
  const messageHandlers: ((message: any, sender: object) => Promise<unknown> | undefined)[] = [];
  const alarmListeners: ((name: string) => void)[] = [];
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const read = (key: string) => {
    const raw = backing.getItem(key);
    return raw == null ? undefined : JSON.parse(raw);
  };
  const emit = (changes: StorageChanges) => storageListeners.forEach((cb) => cb(changes));

  if (persist && typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (!event.key?.startsWith(PREFIX)) return;
      emit({
        [event.key.slice(PREFIX.length)]: {
          oldValue: event.oldValue ? JSON.parse(event.oldValue) : undefined,
          newValue: event.newValue ? JSON.parse(event.newValue) : undefined,
        },
      });
    });
  }

  return {
    name: 'web',
    storage: {
      async get(keys) {
        const out: Record<string, any> = {};
        for (const key of keys ?? backing.keys()) {
          const value = read(key);
          if (value !== undefined) out[key] = value;
        }
        return out;
      },
      async set(items) {
        const changes: StorageChanges = {};
        for (const [key, value] of Object.entries(items)) {
          changes[key] = { oldValue: read(key), newValue: value };
          backing.setItem(key, JSON.stringify(value));
        }
        emit(changes);
      },
      async remove(keys) {
        const changes: StorageChanges = {};
        for (const key of keys) {
          changes[key] = { oldValue: read(key) };
          backing.removeItem(key);
        }
        emit(changes);
      },
      onChanged(cb) {
        storageListeners.add(cb);
        return () => storageListeners.delete(cb);
      },
    },
    runtime: {
      async send(message) {
        for (const handler of messageHandlers) {
          const result = handler(message, {});
          if (result) return (await result) as any;
        }
        return null as any;
      },
      onMessage: (handler) => void messageHandlers.push(handler),
      url: (path) => path,
      onInstalled: (cb) => void setTimeout(cb, 0),
      onStartup: () => {},
    },
    tabs: {
      async open(url) {
        if (typeof window !== 'undefined') window.open(url, '_blank');
      },
      send: async () => null,
      sendToActive: async () => null,
      activeTabId: async () => undefined,
    },
    windows: {
      async popout(url, width, height) {
        if (typeof window !== 'undefined') window.open(url, '_blank', `popup,width=${width},height=${height}`);
      },
      async alert(url, width, height) {
        if (typeof window !== 'undefined') window.open(url, '_blank', `popup,width=${width},height=${height}`);
        return undefined;
      },
      raise: async () => false,
      onRemoved: () => {},
    },
    sound: { play: async () => false, stop: async () => {} },
    sidePanel: { supported: false, prepare() {}, async open() {}, async openIn() {} },
    alarms: {
      async set(name, options) {
        clearTimeout(timers.get(name));
        clearInterval(timers.get(name));
        const fire = () => alarmListeners.forEach((cb) => cb(name));
        if (options.periodInMinutes) timers.set(name, setInterval(fire, options.periodInMinutes * 60000));
        else {
          const delay = options.when != null ? options.when - Date.now() : (options.delayInMinutes ?? 0) * 60000;
          timers.set(name, setTimeout(fire, Math.max(0, delay)));
        }
      },
      async clear(name) {
        clearTimeout(timers.get(name));
        clearInterval(timers.get(name));
        timers.delete(name);
      },
      onAlarm: (cb) => void alarmListeners.push(cb),
    },
    notifications: {
      async show(_id, title, message) {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body: message });
      },
      onClick: () => {},
    },
    identity: {
      redirectUrl: () => (typeof location !== 'undefined' ? location.origin + '/' : 'http://localhost/'),
      async authFlow() {
        throw new Error('Google sign-in only works inside the installed extension.');
      },
    },
    menus: { async setup() {}, onClick: () => {} },
    commands: { onCommand: () => {}, list: async () => [] },
  };
}
