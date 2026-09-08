export function extractUserTranscript(
  event: Record<string, unknown>,
): { text: string; dedupeKey: string } | null {
  const type = String(event.type ?? '');
  if (
    type === 'conversation.item.input_audio_transcription.completed' ||
    type === 'input_audio_transcription.completed'
  ) {
    const transcript = String(event.transcript ?? '').trim();
    if (!transcript) return null;
    const dedupeKey = String(event.item_id ?? event.event_id ?? transcript);
    return { text: transcript, dedupeKey };
  }
  return null;
}

export function extractAssistantTranscript(
  event: Record<string, unknown>,
): { text: string; dedupeKey: string } | null {
  const type = String(event.type ?? '');
  if (
    type === 'response.output_audio_transcript.done' ||
    type === 'response.audio_transcript.done'
  ) {
    const transcript = String(event.transcript ?? '').trim();
    if (!transcript) return null;
    const dedupeKey = String(event.item_id ?? event.response_id ?? transcript);
    return { text: transcript, dedupeKey };
  }
  if (type === 'response.output_text.done') {
    const text = String(event.text ?? '').trim();
    if (!text) return null;
    const dedupeKey = String(event.item_id ?? event.response_id ?? text);
    return { text, dedupeKey };
  }
  return null;
}

export function parseRealtimeDataChannelMessage(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    /* non-json */
  }
  return null;
}
