/**
 * Session-row action matrix (portal parity).
 *
 * Lives next to the pure matrix module rather than the React inbox so the test
 * never reaches for the optional `@nexus/character-kit` avatar peer.
 */
import { describe, expect, it } from 'vitest';
import { rowActionsFor } from '../inbox/rowActions.js';

describe('session row actions', () => {
  it('offers group actions for a group row', () => {
    expect(rowActionsFor({ kind: 'group' })).toEqual([
      'rename',
      'archive',
      'leave_group',
      'room_settings',
    ]);
  });

  it('offers agent actions for an agent row', () => {
    expect(rowActionsFor({ kind: 'agent' })).toEqual(['rename', 'archive', 'delete', 'reset']);
  });

  it('offers the human subset for a person and a two-person room', () => {
    expect(rowActionsFor({ kind: 'human' })).toEqual(['rename', 'archive', 'delete']);
    expect(rowActionsFor({ kind: 'room' })).toEqual(['rename', 'archive', 'delete']);
  });
});
