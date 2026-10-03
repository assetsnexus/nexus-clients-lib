import { describe, expect, it } from 'vitest';
import { auditCatalog, classifyInbox } from './audit.js';
import { KNOWN_ROUTE_GAP_COUNT, KNOWN_ROUTE_GAPS, NOTIFICATION_EVENT_KEYS } from './catalog.snapshot.js';

describe('auditCatalog', () => {
  it('prints the gap list and asserts the current known-gap count', () => {
    const report = auditCatalog(NOTIFICATION_EVENT_KEYS);
    console.info(`notification route gaps (${report.none.length}): ${report.none.join(', ')}`);

    expect(report.detail).toEqual([]);
    expect(report.none).toEqual([...KNOWN_ROUTE_GAPS]);
    expect(report.none).toHaveLength(28);
    expect(KNOWN_ROUTE_GAP_COUNT).toBe(28);
    expect(report.detail.length + report.section.length + report.none.length).toBe(NOTIFICATION_EVENT_KEYS.length);
    expect(report.section).toContain('assets.lifecycle.offline');
    expect(report.section).toContain('messages.inbox.received');
    expect(report.section).toContain('finance.accounting.proof_required');
    expect(report.section).toContain('crm.stage_changed');
    expect(report.section).toContain('org.membership.joined');
    expect(report.section).not.toContain('tasks.assigned');
  });

  it('classifies inbox rows by grade', () => {
    const classified = classifyInbox([
      { id: 'detail', eventKey: 'crm.stage_changed', data: { leadId: 'L1' } },
      { id: 'section', eventKey: 'assets.lifecycle.offline', data: { assetId: 'a1' } },
      { id: 'none', title: 'Hello' },
    ], { surface: 'portal' });
    expect(classified.counts).toEqual({ detail: 1, section: 1, none: 1 });
    expect(classified.detail.map((row) => row.id)).toEqual(['detail']);
    expect(classified.section.map((row) => row.id)).toEqual(['section']);
    expect(classified.none.map((row) => row.id)).toEqual(['none']);
  });
});
