import type { PrivacySection, PrivacySectionRegistry } from './types.js';

export function createSectionRegistry(): PrivacySectionRegistry {
  const sections = new Map<string, PrivacySection>();
  return {
    register(section: PrivacySection) {
      if (!section.id) throw new Error('privacy section id is required');
      if (sections.has(section.id)) throw new Error(`privacy section already registered: ${section.id}`);
      sections.set(section.id, section);
    },
    ids() {
      return [...sections.keys()];
    },
    list() {
      return [...sections.values()];
    },
  };
}

/** Every declared inventory id must be registered, and every registration must be declared. */
export function assertSectionCoverage(registered: string[], declaredInventory: string[]): void {
  const registeredSet = new Set(registered);
  const declaredSet = new Set(declaredInventory);
  const missing = declaredInventory.filter((id) => !registeredSet.has(id));
  const extra = registered.filter((id) => !declaredSet.has(id));
  if (missing.length || extra.length) {
    throw new Error(`privacy section coverage mismatch missing=${missing.join(',') || '-'} extra=${extra.join(',') || '-'}`);
  }
}
