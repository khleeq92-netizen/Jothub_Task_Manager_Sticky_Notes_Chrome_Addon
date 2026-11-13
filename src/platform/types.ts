// Everything browser-specific goes through this interface. The rest of the
// code never touches chrome.* directly, so another browser only needs a new
// implementation of Platform.

export type StorageChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>;

export interface AlarmOptions {
  when?: number;
  delayInMinutes?: number;
  periodInMinutes?: number;
}

export interface MenuItem {
  id: string;
  title: string;
  contexts: ('page' | 'selection')[];
}

export interface MenuClick {
  id: string;
  selectionText?: string;
  pageUrl?: string;
  tabId?: number;
}

export interface Sender {
  tabId?: number;
  url?: string;
}

export interface Platform {
  name: 'chrome' | 'web';
  storage: {
    get(keys: string[] | null): Promise<Record<string, any>>;
    set(items: Record<string, unknown>): Promise<void>;
    remove(keys: string[]): Promise<void>;
    onChanged(cb: (changes: StorageChanges) => void): () => void;
  };
  runtime: {
    send<T = any>(message: unknown): Promise<T>;
    onMessage(handler: (message: any, sender: Sender) => Promise<unknown> | undefined): void;
    url(path: string): string;
    onInstalled(cb: () => void): void;
    onStartup(cb: () => void): void;
  };
  tabs: {
    open(url: string): Promise<void>;
    send(tabId: number, message: unknown): Promise<unknown | null>;
    /** Sends to the active tab of the most recently used normal window. Null when nothing answers. */
    sendToActive(message: unknown): Promise<unknown | null>;
    activeTabId(): Promise<number | undefined>;
  };
  windows: {
    popout(url: string, width: number, height: number): Promise<void>;
    /** Opens a small always-on-top-style window in front of everything and returns its id. */
    alert(url: string, width: number, height: number): Promise<number | undefined>;
    /** Brings an existing window to the front. False when it no longer exists. */
    raise(id: number): Promise<boolean>;
    onRemoved(cb: (id: number) => void): void;
  };
  sound: {
    /** Plays the reminder chime, repeating until stop() or about 30 seconds. */
    play(): Promise<boolean>;
    stop(): Promise<void>;
  };
  sidePanel: {
    supported: boolean;
    /** Call once at page load so open() can run synchronously inside a click. */
    prepare(): void;
    open(): Promise<void>;
  };
  alarms: {
    set(name: string, options: AlarmOptions): Promise<void>;
    clear(name: string): Promise<void>;
    onAlarm(cb: (name: string) => void): void;
  };
  notifications: {
    show(id: string, title: string, message: string): Promise<void>;
    onClick(cb: (id: string) => void): void;
  };
  identity: {
    redirectUrl(): string;
    authFlow(url: string): Promise<string>;
  };
  menus: {
    setup(items: MenuItem[]): Promise<void>;
    onClick(cb: (click: MenuClick) => void): void;
  };
  commands: {
    onCommand(cb: (name: string, tabId?: number) => void): void;
  };
}
