import type { JoinTicketResponse, SceneKind } from './types.js'

export type FetchSceneJoinTicketOpts = {
  baseUrl: string
  roomId: string
  kind?: SceneKind
  token?: string
  ttlSeconds?: number
  fetchFn?: typeof fetch
}

export async function fetchSceneJoinTicket(
  opts: FetchSceneJoinTicketOpts,
): Promise<JoinTicketResponse> {
  const base = String(opts.baseUrl || '').replace(/\/$/, '')
  const roomId = String(opts.roomId || '')
  if (!base || !roomId) {
    throw new Error('fetchSceneJoinTicket requires baseUrl and roomId')
  }
  const fetchFn =
    opts.fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
  if (!fetchFn) throw new Error('fetch unavailable')

  const kind = opts.kind || 'user'
  const params = new URLSearchParams({ kind })
  if (opts.ttlSeconds != null && Number.isFinite(opts.ttlSeconds)) {
    params.set('ttlSeconds', String(opts.ttlSeconds))
  }
  const url = `${base}/inference/scene/${encodeURIComponent(roomId)}/join-ticket?${params}`

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`

  const res = await fetchFn(url, {
    method: 'GET',
    headers,
    credentials: 'include',
  })
  if (!res?.ok) {
    throw new Error(`join_ticket_http_${res?.status ?? 'error'}`)
  }
  const body = (await res.json()) as Record<string, unknown>
  const token = String(body.token || body.joinTicket || '')
  if (!token) throw new Error('join_ticket_missing_token')

  return {
    token,
    expiresAt: String(body.expiresAt || body.exp || ''),
    jti: String(body.jti || body.jwtId || ''),
    roomId: String(body.roomId || roomId),
    kind: (body.kind as SceneKind) || kind,
  }
}
