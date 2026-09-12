/** Browser MediaRecorder helpers for chat mic dictation MVP. */

export const STT_MIN_BLOB_BYTES = 800

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

export function pickMediaRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined') return undefined
  return MIME_CANDIDATES.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type)
    } catch (_) {
      return false
    }
  })
}

export function micAccessErrorCode(err) {
  if (err && err.name === 'NotAllowedError') return 'denied'
  if (err && err.name === 'NotFoundError') return 'not_found'
  if (err && (err.name === 'NotSupportedError' || err.name === 'SecurityError')) return 'unsupported'
  if (err instanceof TypeError && /getUserMedia/i.test(String(err.message || ''))) return 'unsupported'
  return 'unavailable'
}

export async function requestMicrophoneStream(constraints = { audio: true }) {
  if (!navigator?.mediaDevices?.getUserMedia) {
    const err = new Error('Microphone API unavailable')
    err.name = 'NotSupportedError'
    throw err
  }
  return navigator.mediaDevices.getUserMedia(constraints)
}

export function blobToFile(blob, filename = 'voice-note.webm') {
  const type = blob.type || 'audio/webm'
  try {
    return new File([blob], filename, { type })
  } catch (_) {
    // Older engines: File ctor may reject; Blob with name is enough for uploadAttachment.
    const named = blob
    named.name = filename
    return named
  }
}
