import { describe, expect, it } from 'vitest';
import {
  mapConversationListItem,
  sessionBadgeFieldsFromSummary,
  applySessionSummaryToPanel,
} from './session-summary.js';
import type { PanelState } from '../state.js';

describe('mapConversationListItem', () => {
  it('maps subagent session badge fields with safe defaults', () => {
    const summary = mapConversationListItem({
      conversationId: 'c1',
      unreadCount: 2,
      activeSubAgentCount: 3,
      backgroundSubAgentCompleted: true,
      generationInProgress: true,
      parentConversationId: 'parent-1',
      subAgentRunId: 'run-9',
    });
    expect(summary).toMatchObject({
      conversationId: 'c1',
      unreadCount: 2,
      activeSubAgentCount: 3,
      backgroundSubAgentCompleted: true,
      generationInProgress: true,
      isStreaming: true,
      conversationRole: 'subagent',
      parentConversationId: 'parent-1',
      subAgentRunId: 'run-9',
    });
    expect(sessionBadgeFieldsFromSummary(summary!).activeSubAgentCount).toBe(3);
  });

  it('defaults missing fields', () => {
    const summary = mapConversationListItem({ id: 'c2' });
    expect(summary).toMatchObject({
      conversationId: 'c2',
      unreadCount: 0,
      activeSubAgentCount: 0,
      backgroundSubAgentCompleted: false,
      generationInProgress: false,
    });
  });

  it('accepts backend dual-field aliases (streaming / activeSubagentCount / agentRunId)', () => {
    const summary = mapConversationListItem({
      id: 'c-backend',
      streaming: true,
      activeSubagentCount: 2,
      subagentCount: 4,
      agentRunId: 'run-backend',
      conversationRole: 'subagent',
      parentConversationId: 'parent-x',
    });
    expect(summary).toMatchObject({
      conversationId: 'c-backend',
      generationInProgress: true,
      isStreaming: true,
      activeSubAgentCount: 2,
      subAgentRunId: 'run-backend',
      conversationRole: 'subagent',
      parentConversationId: 'parent-x',
    });
  });

  it('applies summary onto panel state', () => {
    const panel = {
      id: 'p1',
      contactId: 'a',
      contactType: 'agent',
      conversationId: null,
      turns: [],
      streaming: false,
      queuedMessages: [],
      unreadCount: 0,
    } as PanelState;
    const next = applySessionSummaryToPanel(
      panel,
      mapConversationListItem({
        conversationId: 'c3',
        activeSubAgentCount: 1,
        isStreaming: true,
      })!,
    );
    expect(next.conversationId).toBe('c3');
    expect(next.streaming).toBe(true);
    expect(next.activeSubAgentCount).toBe(1);
  });
});
