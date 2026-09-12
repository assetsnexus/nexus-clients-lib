export function explorerBadgeLabel(item) {
  const limits = Array.isArray(item?.limitations) ? item.limitations : [];
  if (item?.source === 'external_bucket' || limits.includes('provider_limited')) {
    return 'Provider-limited';
  }
  if (item?.viaDataRoomId) return 'In data room';
  return '';
}
