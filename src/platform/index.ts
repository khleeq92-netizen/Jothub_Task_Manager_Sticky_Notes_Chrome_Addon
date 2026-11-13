import { createChromePlatform } from './chrome';
import { createWebPlatform } from './web';
import type { Platform } from './types';

export type { Platform } from './types';

const g = globalThis as any;
const hasExtensionApi = !!(g.browser?.storage?.local ?? g.chrome?.storage?.local);

export let platform: Platform = hasExtensionApi ? createChromePlatform() : createWebPlatform();

/** Tests swap in a fresh in-memory platform. */
export function setPlatform(next: Platform) {
  platform = next;
}
