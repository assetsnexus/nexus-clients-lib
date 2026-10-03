import { resolveNotificationTarget } from './resolve.js';
import type {
  NotificationAction,
  NotificationRouteInput,
  ResolveNotificationOptions,
  ResolvedNotificationTarget,
} from './types.js';

function isOnceCallback(action: NotificationAction): boolean {
  return action.kind === 'callback' && action.once !== false;
}

/**
 * Hides a once-callback while it is in flight or finished.
 * `failed` stays visible so the user can retry. `once` defaults to true.
 */
function onceCallbackConsumed(status: string | undefined): boolean {
  return status === 'claimed' || status === 'delivered' || status === 'handled';
}

/** Hides once-callbacks that this user has already completed or claimed. `once` defaults to true for callbacks. */
export function visibleActions(
  input: NotificationRouteInput,
  opts: { userId: string },
): NotificationAction[] {
  const actions = Array.isArray(input.presentation?.actions) ? input.presentation.actions : [];
  const results = Array.isArray(input.actionResults) ? input.actionResults : [];
  return actions.filter((action) => {
    if (!isOnceCallback(action)) return true;
    return !results.some(
      (result) =>
        result.actionId === action.id &&
        result.userId === opts.userId &&
        onceCallbackConsumed(result.status),
    );
  });
}

/** Resolves an `open` action through the same precedence as the row, with the action link first. */
export function actionTarget(
  action: NotificationAction,
  input: NotificationRouteInput,
  opts: ResolveNotificationOptions,
): ResolvedNotificationTarget {
  if (action.kind !== 'open') {
    return { kind: 'none', value: '', grade: 'none', missingParams: [] };
  }
  if (!action.link) return resolveNotificationTarget(input, opts);
  return resolveNotificationTarget(
    {
      ...input,
      presentation: { ...input.presentation, link: action.link },
    },
    opts,
  );
}
