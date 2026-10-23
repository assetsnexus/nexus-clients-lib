import type { ComponentType } from 'react';

export type ChatSlots = {
  header?: ComponentType<any>;
  /**
   * Extra controls rendered in the chat header, immediately left of the
   * built-in `Config` button. Hosts use this for shell-level affordances that
   * belong beside the thread chrome (e.g. the desktop's "Companion mode").
   */
  headerActions?: ComponentType<any>;
  composer?: ComponentType<any>;
  empty?: ComponentType<any>;
  contactRow?: ComponentType<any>;
};
