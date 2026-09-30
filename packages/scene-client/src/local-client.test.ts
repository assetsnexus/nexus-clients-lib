import { describe, expect, it } from 'vitest'
import { createLocalSceneClient } from './local-client.js'
import { createSceneClient } from './factory.js'

describe('createLocalSceneClient', () => {
  it('joins, applies move intents, and exposes local transport', async () => {
    const client = createSceneClient()
    expect(client.transport).toBe('local-fallback')
    const snap = await client.join([{ id: 'e1', kind: 'asset', pose: { x: 0, y: 0, z: 0 } }])
    expect(snap.entities).toHaveLength(1)
    const deltas: unknown[] = []
    client.on('delta', (d) => deltas.push(d))
    const res = client.sendIntent({ op: 'move', entityId: 'e1', x: 2, y: 0, z: 1 })
    expect(res).toMatchObject({ ok: true })
    expect((deltas[0] as { op: string }).op).toBe('move')
    expect(client.getSnapshot().entities[0].pose?.x).toBe(2)
    client.dispose()
  })

  it('createLocalSceneClient standalone', async () => {
    const client = createLocalSceneClient({ roomId: 'r1' })
    await client.join([])
    expect(client.getSnapshot().mode).toBe('local')
    client.dispose()
  })
})
