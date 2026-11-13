// Single place that answers "is this feature available?". Everything is
// unlocked today (personal use). A future licensing or subscription system
// only needs to change what currentPlan() returns — the app already asks
// here before using a gated capability.

export type Feature = 'cloudSync' | 'cloudBackup' | 'templates' | 'pageNotes' | 'unlimitedNotes';

export interface Plan {
  id: 'personal' | 'free' | 'pro';
  label: string;
  features: Record<Feature, boolean>;
}

const PERSONAL: Plan = {
  id: 'personal',
  label: 'Personal — all features',
  features: { cloudSync: true, cloudBackup: true, templates: true, pageNotes: true, unlimitedNotes: true },
};

export const currentPlan = (): Plan => PERSONAL;
export const can = (feature: Feature): boolean => currentPlan().features[feature];
