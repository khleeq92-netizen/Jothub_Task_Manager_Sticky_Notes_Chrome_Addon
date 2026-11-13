import { getRecords } from './db';
import { defaultSettings, type Settings } from './types';

export async function loadSettings(): Promise<Settings> {
  const [stored] = await getRecords(['settings']);
  return stored && stored.type === 'settings' && !stored.purged ? { ...defaultSettings(), ...stored } : defaultSettings();
}
