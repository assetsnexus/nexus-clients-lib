/**
 * Meeting view tab gating (@nexus/meetings-core).
 *
 * The set of meaningful tabs for a meeting is derived purely from the card's
 * capability `surfaces`, so every adapter (React, Vue 2, Vue 3, native) shows
 * the same tabs for the same meeting. Kept in core so adapters never re-implement
 * the rule.
 */

import type { MeetingCardModel } from './card.js';

export type MeetingViewTab = 'video' | 'participants' | 'scene' | 'screenshare';

/** Capability-gated tabs for a meeting, in display order. */
export function meetingViewTabs(card: MeetingCardModel): MeetingViewTab[] {
  const tabs: MeetingViewTab[] = ['participants'];
  if (card.surfaces.video) tabs.unshift('video');
  if (card.surfaces.screenshare) tabs.push('screenshare');
  if (card.surfaces.scene) tabs.push('scene');
  return tabs;
}
