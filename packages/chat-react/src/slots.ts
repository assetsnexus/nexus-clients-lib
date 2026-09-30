import type { ComponentType } from 'react';

export type ChatSlots = {
  header?: ComponentType<any>;
  composer?: ComponentType<any>;
  empty?: ComponentType<any>;
  contactRow?: ComponentType<any>;
};
