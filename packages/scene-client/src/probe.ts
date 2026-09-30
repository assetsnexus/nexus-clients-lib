export type ProbeSceneServerOpts = {
  statusUrl: string
  headers?: Record<string, string>
  fetchFn?: typeof fetch
}

export async function probeSceneServer(opts: ProbeSceneServerOpts): Promise<boolean> {
  if (!opts?.statusUrl) return false
  const fetchFn =
    opts.fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
  if (!fetchFn) return false
  try {
    const res = await fetchFn(opts.statusUrl, {
      method: 'GET',
      headers: opts.headers || {},
      credentials: 'include',
    })
    if (!res?.ok) return false
    const body = (await res.json()) as { ok?: boolean; scene?: string }
    return Boolean(body && body.ok && body.scene === 'available')
  } catch {
    return false
  }
}

export function buildSceneStatusUrl(roomId: string, httpBase: string): string {
  const base = String(httpBase || '').replace(/\/$/, '')
  const rid = encodeURIComponent(String(roomId || ''))
  return `${base}/inference/scene/${rid}/status`
}
