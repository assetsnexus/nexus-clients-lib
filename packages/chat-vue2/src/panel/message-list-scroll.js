/**
 * Sticky message-list autoscroll.
 *
 * Pin to the bottom on open / thread switch. Follow new content only while
 * the viewport is still pinned. A user scroll away from the bottom (including
 * during streaming) unpins so the list does not jump.
 */

export const MESSAGE_LIST_BOTTOM_THRESHOLD_PX = 72

export function isMessageListAtBottom(el, thresholdPx = MESSAGE_LIST_BOTTOM_THRESHOLD_PX) {
  if (!el) return true
  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
  return remaining <= thresholdPx
}

export function scrollMessageListToBottom(el) {
  if (!el) return
  el.scrollTop = el.scrollHeight
}

/**
 * @param {{ thresholdPx?: number, getEl: () => ({ scrollTop: number, scrollHeight: number, clientHeight: number } | null | undefined) }} opts
 */
export function createMessageListAutoScroll(opts) {
  const thresholdPx = opts && opts.thresholdPx != null ? opts.thresholdPx : MESSAGE_LIST_BOTTOM_THRESHOLD_PX
  const getEl = opts && opts.getEl
  let pinned = true
  let programmatic = 0

  function releaseProgrammatic() {
    programmatic = Math.max(0, programmatic - 1)
  }

  function markProgrammatic() {
    programmatic += 1
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        requestAnimationFrame(releaseProgrammatic)
      })
    } else {
      releaseProgrammatic()
    }
  }

  return {
    isPinned() {
      return pinned
    },
    pin() {
      pinned = true
    },
    onUserScroll() {
      if (programmatic > 0) return
      const el = getEl ? getEl() : null
      pinned = isMessageListAtBottom(el, thresholdPx)
    },
    apply(options) {
      const force = !!(options && options.force)
      const el = getEl ? getEl() : null
      if (!el) return false
      if (!force && !pinned) return false
      markProgrammatic()
      pinned = true
      scrollMessageListToBottom(el)
      return true
    },
  }
}
