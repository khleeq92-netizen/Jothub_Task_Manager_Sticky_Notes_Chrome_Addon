import { getLocal, setLocal } from '../core/db';

// Firebase project details. Nothing is hard-coded in the repository: values
// come from .env.local at build time and/or from Settings → Cloud sync at run
// time (stored only on this device). The runtime values win.

export interface CloudConfig {
  apiKey: string;
  projectId: string;
  googleClientId: string;
}

declare const __FIREBASE_DEFAULTS__: Partial<CloudConfig> | undefined;

const buildDefaults = (): Partial<CloudConfig> => (typeof __FIREBASE_DEFAULTS__ !== 'undefined' && __FIREBASE_DEFAULTS__ ? __FIREBASE_DEFAULTS__ : {});

export async function getCloudConfigRaw(): Promise<CloudConfig> {
  const saved = await getLocal<Partial<CloudConfig>>('cloudConfig', {});
  const d = buildDefaults();
  return {
    apiKey: (saved.apiKey || d.apiKey || '').trim(),
    projectId: (saved.projectId || d.projectId || '').trim(),
    googleClientId: (saved.googleClientId || d.googleClientId || '').trim(),
  };
}

/** Null until an API key and project id have been provided. */
export async function getCloudConfig(): Promise<CloudConfig | null> {
  const config = await getCloudConfigRaw();
  return config.apiKey && config.projectId ? config : null;
}

export const saveCloudConfig = (config: CloudConfig) => setLocal('cloudConfig', config);
