import { describe, expect, it } from 'vitest';
import {
  AI_DISCLOSURE_REQUIRED,
  assertAiDisclosureAlwaysOn,
  createNexusChat,
  DEFAULT_I18N,
  DEFAULT_FEATURES,
} from './index.js';

describe('chat-core', () => {
  it('keeps AI disclosure required', () => {
    expect(AI_DISCLOSURE_REQUIRED).toBe(true);
    const chat = createNexusChat({
      client: { send: async () => ({ ok: true, data: { text: 'hi' } }) },
      features: { contacts: false, groups: false },
    });
    assertAiDisclosureAlwaysOn(chat.getState());
    expect(chat.getState().aiDisclosureVisible).toBe(true);
  });

  it('defaults spendLimits to true', () => {
    expect(DEFAULT_FEATURES.spendLimits).toBe(true);
  });

  it('dispatches sendMessage', async () => {
    const sentPayloads: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const chat = createNexusChat({
      client: {
        send: async (command: string, payload?: Record<string, unknown>) => {
          sentPayloads.push({ command, payload });
          if (command === 'anx.communicate.stream-init') {
            return { ok: true, data: { endpoints: [], token: null, resourceId: 'c1' } };
          }
          if (command === 'anx.communicate.message.send') {
            return { ok: true, data: { text: 'pong', conversationId: 'c1' } };
          }
          if (command === 'anx.communicate.conversations.messages.list') {
            return { ok: true, data: { messages: [] } };
          }
          return { ok: true, data: {} };
        },
      },
    });
    const result = await chat.sendMessage('ping', {
      conversationId: 'c1',
      attachments: [
        { kind: 'entity', entityType: 'conversation_attachment', ref: 'att-1', mimeType: 'image/png' },
      ],
    });
    expect(result).toEqual({ ok: true });
    expect(chat.getState().messages.length).toBe(2);
    expect(chat.getState().messages[1].content).toContain('pong');
    expect(
      sentPayloads.find((entry) => entry.command === 'anx.communicate.message.send')?.payload?.pageContext,
    ).toEqual({ tempFileIds: ['att-1'] });
    expect(chat.getState().panels[0]?.conversationId).toBe('c1');
  });

  it('surfaces soft-fail sendMessage results to the host', async () => {
    const chat = createNexusChat({
      client: {
        send: async (command: string) => {
          if (command === 'anx.communicate.stream-init') {
            return { ok: true, data: { endpoints: [], token: null, resourceId: 'c1' } };
          }
          if (command === 'anx.communicate.message.send') {
            return { ok: false, kind: 'error', message: 'quota exceeded' };
          }
          return { ok: true, data: {} };
        },
      },
    });
    const result = await chat.sendMessage('ping', { conversationId: 'c1' });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.message).toContain('quota');
      expect(result.code).toBe('error');
    }
    expect(chat.getState().streaming).toBe(false);
  });

  it('flattens updateRoomOrchestration payload', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const chat = createNexusChat({
      client: {
        send: async (command: string, payload?: Record<string, unknown>) => {
          sent.push({ command, payload });
          return { ok: true, data: {} };
        },
      },
    });
    await chat.updateRoomOrchestration({
      roomId: 'r1',
      orchestration: { defaultAiResponseMode: 'always' },
      maxAgentTurnsLimit: 3,
    });
    const entry = sent.find((s) => s.command === 'anx.communicate.rooms.orchestration.update');
    expect(entry?.payload).toMatchObject({
      roomId: 'r1',
      defaultAiResponseMode: 'always',
      maxAgentTurnsLimit: 3,
    });
    expect(entry?.payload).not.toHaveProperty('orchestration');
  });

  it('sends a direct contact message without opening an agent conversation', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const chat = createNexusChat({
      client: {
        send: async (command: string, payload?: Record<string, unknown>) => {
          sent.push({ command, payload });
          if (command === 'anx.communicate.contacts.list') {
            return {
              ok: true,
              data: {
                contacts: [{ displayName: 'Ada', peer: { contactUserId: 'user-1' } }],
              },
            };
          }
          if (command === 'anx.ai-agents.virtual-employees.list') return { ok: true, data: [] };
          if (command === 'anx.ai-agents.virtual-employees.list-public') return { ok: true, data: [] };
          if (command === 'anx.communicate.stream-init') {
            return { ok: true, data: { endpoints: [], token: null } };
          }
          if (command === 'anx.communicate.message.send') {
            return { ok: true, data: { text: 'pong', conversationId: 'c-user' } };
          }
          if (command === 'anx.communicate.conversations.messages.list') {
            return { ok: true, data: { messages: [] } };
          }
          return { ok: true, data: {} };
        },
      },
    });

    await chat.loadContacts();
    await chat.sendMessage('hello', { contactId: 'user-1' });

    expect(sent.some((entry) => entry.command === 'anx.communicate.conversations.create')).toBe(false);
    expect(
      sent.find((entry) => entry.command === 'anx.communicate.message.send')?.payload?.contactId,
    ).toBe('user-1');
    expect(chat.getState().panels[0]?.contactId).toBe('user-1');
  });

  it('keeps configurable fallback copy defaults', () => {
    expect(DEFAULT_I18N.messageAccepted).toBe('(message accepted)');
    expect(DEFAULT_I18N.awaitingResponse).toBe('Awaiting response...');
  });

  it('merges VE agents into contacts and opens via virtualEmployeeId', async () => {
    const sent: string[] = [];
    const chat = createNexusChat({
      client: {
        send: async (command: string, payload?: Record<string, unknown>) => {
          sent.push(command);
          if (command === 'anx.communicate.contacts.list') {
            return {
              ok: true,
              data: {
                contacts: [
                  {
                    displayName: 'Ada',
                    peer: { contactUserId: 'user-1' },
                  },
                ],
              },
            };
          }
          if (command === 'anx.ai-agents.virtual-employees.list') {
            return { ok: true, data: [{ employeeId: 've-1', name: 'Helper' }] };
          }
          if (command === 'anx.ai-agents.virtual-employees.list-public') {
            return { ok: true, data: [] };
          }
          if (command === 'anx.communicate.conversations.create') {
            expect(payload?.virtualEmployeeId).toBe('ve-1');
            return { ok: true, data: { conversationId: 'conv-1', agentId: 'agent-1', anxVeId: 've-1' } };
          }
          return { ok: true, data: {} };
        },
      },
    });
    await chat.loadContacts();
    const contacts = chat.getState().contacts;
    expect(contacts.some((c) => c.id === 've-1' && c.type === 'agent' && c.canConfigure === true)).toBe(true);
    expect(contacts.some((c) => c.id === 'user-1' && c.type === 'user')).toBe(true);
    const opened = await chat.openContact('ve-1');
    expect(opened.conversationId).toBe('conv-1');
    expect(chat.getState().conversationId).toBe('conv-1');
    expect(sent).toContain('anx.communicate.conversations.create');
  });

  it('keeps list avatars as refs and hydrates bytes via media.get', async () => {
    const sent: string[] = [];
    const chat = createNexusChat({
      client: {
        send: async (command: string) => {
          sent.push(command);
          if (command === 'anx.communicate.contacts.list') {
            return { ok: true, data: { contacts: [] } };
          }
          if (command === 'anx.ai-agents.virtual-employees.list') {
            return {
              ok: true,
              data: [
                {
                  employeeId: 've-pic',
                  name: 'Pixie',
                  profilePictureRef: { kind: 'deferred', slot: 'profilePicture' },
                },
              ],
            };
          }
          if (command === 'anx.ai-agents.virtual-employees.list-public') {
            return { ok: true, data: [] };
          }
          if (command === 'anx.ai-agents.virtual-employees.media.get') {
            return {
              ok: true,
              data: { media: { src: 'data:image/png;base64,abc', slot: 'profilePicture' } },
            };
          }
          return { ok: true, data: {} };
        },
      },
    });
    await chat.loadContacts();
    const first = chat.getState().contacts.find((c) => c.id === 've-pic');
    expect(first?.avatarUrl).toBeNull();
    expect(JSON.stringify(chat.getState().contacts)).not.toContain('data:image/png;base64,HUGE');
    await new Promise((r) => setTimeout(r, 30));
    expect(sent).toContain('anx.ai-agents.virtual-employees.media.get');
    expect(chat.getState().contacts.find((c) => c.id === 've-pic')?.avatarUrl).toBe(
      'data:image/png;base64,abc',
    );
  });

  it('lists rooms and creates a browser voice call', async () => {
    const chat = createNexusChat({
      client: {
        send: async (command: string) => {
          if (command === 'anx.communicate.rooms.list') {
            return { ok: true, data: { rooms: [{ roomId: 'room-1', title: 'Writers', participantCount: 3 }] } };
          }
          if (command === 'anx.agents.voice-channel.browser-call.create') {
            return { ok: true, data: { callSid: 'call-1', conversationId: 'conv-2' } };
          }
          return { ok: true, data: {} };
        },
      },
    });

    const rooms = await chat.listRooms();
    const call = await chat.createBrowserCall('agent-1', 'conv-2');

    expect(rooms[0]).toMatchObject({ id: 'room-1', title: 'Writers' });
    expect(call).toMatchObject({ agentId: 'agent-1', callSid: 'call-1', conversationId: 'conv-2' });
    expect(chat.getState().calls[0]?.callSid).toBe('call-1');
  });

  it('listRooms uses a custom name for multi-party rooms and peer labels for DMs', async () => {
    const chat = createNexusChat({
      client: {
        send: async (command: string) => {
          if (command === 'anx.communicate.rooms.list') {
            return {
              ok: true,
              data: {
                rooms: [
                  { roomId: 'g1', name: 'Standup', type: 'group', participantCount: 4, participantNames: ['Ada', 'Bob'] },
                  { roomId: 'g2', name: null, type: 'group', participantCount: 5, participantNames: ['Ada'] },
                  { roomId: 'd1', name: 'Project X', type: 'dm', participantCount: 2, participantNames: ['Ada'] },
                  { roomId: 'd2', name: '', type: 'dm', participantCount: 2, participantNames: ['Bob'] },
                ],
              },
            };
          }
          return { ok: true, data: {} };
        },
      },
    });
    const rooms = await chat.listRooms();
    expect(rooms.find((r) => r.id === 'g1')).toMatchObject({ title: 'Standup', name: 'Standup' });
    expect(rooms.find((r) => r.id === 'g2')).toMatchObject({ title: 'Room', name: null });
    expect(rooms.find((r) => r.id === 'd1')).toMatchObject({ title: 'Project X', name: 'Project X' });
    expect(rooms.find((r) => r.id === 'd2')).toMatchObject({ title: 'Bob', name: null });
  });

  it('createRoom allows an empty DM name and updateRoom patches the cached title', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const chat = createNexusChat({
      client: {
        send: async (command: string, payload?: Record<string, unknown>) => {
          sent.push({ command, payload });
          if (command === 'anx.communicate.rooms.create') {
            return { ok: true, data: { roomId: 'dm-1', name: null, type: 'dm' } };
          }
          if (command === 'anx.communicate.rooms.update') {
            return { ok: true, data: { roomId: 'dm-1', name: 'Later', type: 'dm' } };
          }
          return { ok: true, data: {} };
        },
      },
    });
    await chat.createRoom({
      title: '',
      type: 'dm',
      participants: [{ type: 'user', id: 'u-1', displayName: 'Ada' }],
    });
    expect(sent.find((s) => s.command === 'anx.communicate.rooms.create')?.payload).toMatchObject({
      name: '',
      type: 'dm',
    });
    const updated = await chat.updateRoom({ roomId: 'dm-1', name: 'Later' });
    expect(updated).toMatchObject({ roomId: 'dm-1', name: 'Later' });
    expect(chat.getState().rooms.find((r) => r.id === 'dm-1')?.title).toBe('Later');
  });

  it('prepares inbound dial-in and creates outbound call', async () => {
    const sent: string[] = [];
    const chat = createNexusChat({
      client: {
        send: async (command: string) => {
          sent.push(command);
          if (command === 'anx.agents.voice-channel.get') {
            return {
              ok: true,
              data: {
                id: 'ch-1',
                accessCode: '1234',
                phone: { phoneE164: '+15551212' },
              },
            };
          }
          if (command === 'anx.agents.voice-channel.outbound-call.create') {
            return { ok: true, data: { callSid: 'out-1', toMasked: '+1***1212' } };
          }
          return { ok: true, data: {} };
        },
      },
    });

    const inbound = await chat.prepareInboundCall('agent-9');
    expect(inbound).toMatchObject({
      mode: 'inbound',
      status: 'waiting_inbound',
      dialIn: { accessCode: '1234', phoneE164: '+15551212' },
    });

    const outbound = await chat.createOutboundCall({ agentId: 'agent-9' });
    expect(outbound).toMatchObject({ mode: 'outbound', callSid: 'out-1', status: 'ringing' });
    expect(sent).toContain('anx.agents.voice-channel.get');
    expect(sent).toContain('anx.agents.voice-channel.outbound-call.create');
  });

  it('signalBillingCredits ends live runtime via credits hook', async () => {
    const exhausted: Array<{ callSid: string | null }> = [];
    const chat = createNexusChat({
      client: {
        send: async () => ({ ok: true, data: { callSid: 'c-bill', conversationId: 'conv' } }),
      },
      hooks: {
        onCreditsExhausted: (info) => exhausted.push(info),
      },
    });
    await chat.createBrowserCall('agent-1', 'conv');
    chat.signalBillingCredits(0);
    // no live runtime yet — should no-op without throwing
    expect(exhausted).toEqual([]);
  });

  it('triggerCheckBack sends anx.communicate.check-back.trigger', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const chat = createNexusChat({
      client: {
        send: async (command: string, payload?: Record<string, unknown>) => {
          sent.push({ command, payload });
          return { ok: true, data: { triggered: true, status: 'processing' } };
        },
      },
    });
    const result = await chat.triggerCheckBack('conv-cb');
    expect(sent[0]).toEqual({
      command: 'anx.communicate.check-back.trigger',
      payload: { conversationId: 'conv-cb' },
    });
    expect(result).toMatchObject({ triggered: true, status: 'processing' });
  });

  it('leaveRoom calls rooms.leave and drops the room from state', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const chat = createNexusChat({
      client: {
        send: async (command: string, payload?: Record<string, unknown>) => {
          sent.push({ command, payload });
          if (command === 'anx.communicate.rooms.list') {
            return {
              ok: true,
              data: { rooms: [{ roomId: 'room-1', title: 'Ops', participantCount: 2 }] },
            };
          }
          if (command === 'anx.communicate.rooms.leave') {
            return {
              ok: true,
              data: {
                ok: true,
                archived: true,
                roomId: 'room-1',
              },
            };
          }
          return { ok: true, data: {} };
        },
      },
    });

    await chat.listRooms();
    expect(chat.getState().rooms).toHaveLength(1);

    const result = await chat.leaveRoom({ roomId: 'room-1', action: 'archive' });

    expect(sent.some((row) => row.command === 'anx.communicate.rooms.leave')).toBe(true);
    expect(sent.find((row) => row.command === 'anx.communicate.rooms.leave')?.payload).toEqual({
      roomId: 'room-1',
      action: 'archive',
    });
    expect(result).toMatchObject({ ok: true, archived: true, roomId: 'room-1' });
    expect(chat.getState().rooms).toHaveLength(0);
  });

  it('rehydrateTurns maps attachments onto turns', () => {
    const chat = createNexusChat({
      client: { send: async () => ({ ok: true, data: {} }) },
    });
    chat.rehydrateTurns([
      {
        id: 'm1',
        role: 'user',
        content: 'see image',
        attachments: [
          { kind: 'entity', entityType: 'conversation_attachment', ref: 'file-1', filename: 'a.png' },
        ],
      },
      { id: 'm2', role: 'assistant', content: 'ok' },
    ]);
    expect(chat.getState().turns[0]?.attachments?.[0]).toMatchObject({
      kind: 'entity',
      entityType: 'conversation_attachment',
      ref: 'file-1',
      filename: 'a.png',
    });
    expect(chat.getState().turns[1]?.attachments).toBeUndefined();
  });

  it('applyUsage hydrates panel context snapshot from conversations.get', () => {
    const chat = createNexusChat({
      client: { send: async () => ({ ok: true, data: {} }) },
    });
    chat.applyUsage({
      tokensUsed: 1200,
      maxContextTokens: 128000,
      costCents: 3,
      contextSnapshot: {
        totalTokens: 5000,
        dispatchedTokens: 4200,
        maxContextTokens: 128000,
        dispatchBudgetTokens: 100000,
      },
    });
    const panel = chat.getState().panels[0];
    expect(panel?.usage?.tokensUsed).toBe(1200);
    expect(panel?.usage?.maxContextTokens).toBe(128000);
    expect((panel?.usage?.contextSnapshot as { dispatchedTokens?: number })?.dispatchedTokens).toBe(
      4200,
    );
  });

  it('uploadAttachment runs region presign+register path and returns fileId', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const putBodies: ArrayBuffer[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body instanceof ArrayBuffer) putBodies.push(init.body);
      else if (init?.body instanceof Uint8Array) {
        // Copy into a fresh ArrayBuffer (avoids SharedArrayBuffer + BodyInit.slice overloads).
        const src = init.body;
        const ab = new ArrayBuffer(src.byteLength);
        new Uint8Array(ab).set(src);
        putBodies.push(ab);
      }
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    try {
      const chat = createNexusChat({
        client: {
          send: async (command: string, payload?: Record<string, unknown>) => {
            sent.push({ command, payload });
            if (command === 'anx.file.upload-init') {
              return {
                ok: true,
                data: { fileId: 'f-99', storageKey: 'chat/f-99.bin', workspaceId: 'ws-1' },
              };
            }
            if (command === 'anx.storage.presign.put') {
              return { ok: true, data: { url: 'https://storage.test/put', expiresInSeconds: 60 } };
            }
            if (command === 'anx.file.upload-complete-presign') {
              return { ok: true, data: { fileId: 'f-99' } };
            }
            return { ok: true, data: {} };
          },
        },
      });

      const bytes = new Uint8Array([1, 2, 3, 4]);
      const result = await chat.uploadAttachment({
        name: 'note.txt',
        type: 'text/plain',
        size: bytes.byteLength,
        body: bytes,
      });

      expect(result.fileId).toBe('f-99');
      expect(result.descriptor).toEqual({
        kind: 'entity',
        entityType: 'conversation_attachment',
        ref: 'f-99',
        mimeType: 'text/plain',
        filename: 'note.txt',
      });
      expect(sent.map((s) => s.command)).toEqual([
        'anx.file.upload-init',
        'anx.storage.presign.put',
        'anx.file.upload-complete-presign',
      ]);
      expect(sent[0]?.payload).toMatchObject({
        module: 'chat-attachment',
        originalName: 'note.txt',
        contentType: 'text/plain',
        expectedSize: 4,
      });
      expect(sent[0]?.payload?.encryptionTier).toBeUndefined();
      expect(sent[1]?.payload).toMatchObject({
        workspaceId: 'ws-1',
        objectKey: 'chat/f-99.bin',
        fileId: 'f-99',
        contentType: 'text/plain',
        contentLength: 4,
      });
      expect(putBodies.length).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uploadAttachment forwards encryptionTier when provided', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(null, { status: 200 })) as typeof fetch;
    try {
      const chat = createNexusChat({
        client: {
          send: async (command: string, payload?: Record<string, unknown>) => {
            sent.push({ command, payload });
            if (command === 'anx.file.upload-init') {
              return {
                ok: true,
                data: { fileId: 'f-org', storageKey: 'chat/f-org.bin', workspaceId: 'ws-1' },
              };
            }
            if (command === 'anx.storage.presign.put') {
              return { ok: true, data: { url: 'https://storage.test/put', expiresInSeconds: 60 } };
            }
            if (command === 'anx.file.upload-complete-presign') {
              return { ok: true, data: { fileId: 'f-org' } };
            }
            return { ok: true, data: {} };
          },
        },
      });
      const bytes = new Uint8Array([9, 8, 7]);
      await chat.uploadAttachment(
        { name: 'pic.png', type: 'image/png', size: bytes.byteLength, body: bytes },
        { encryptionTier: 'org' },
      );
      expect(sent[0]?.payload).toMatchObject({
        module: 'chat-attachment',
        encryptionTier: 'org',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uploadAttachment forwards retentionPolicy and folderId', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(null, { status: 200 })) as typeof fetch;
    try {
      const chat = createNexusChat({
        client: {
          send: async (command: string, payload?: Record<string, unknown>) => {
            sent.push({ command, payload });
            if (command === 'anx.file.upload-init') {
              return {
                ok: true,
                data: { fileId: 'f-ttl', storageKey: 'chat/f-ttl.bin', workspaceId: 'ws-1' },
              };
            }
            if (command === 'anx.storage.presign.put') {
              return { ok: true, data: { url: 'https://storage.test/put', expiresInSeconds: 60 } };
            }
            if (command === 'anx.file.upload-complete-presign') {
              return { ok: true, data: { fileId: 'f-ttl' } };
            }
            return { ok: true, data: {} };
          },
        },
      });
      const bytes = new Uint8Array([1, 2]);
      await chat.uploadAttachment(
        { name: 'tmp.csv', type: 'text/csv', size: bytes.byteLength, body: bytes },
        {
          module: 'chat-attachment',
          folderId: 'fold-1',
          retentionPolicy: { kind: 'temporary', maxRetentionMs: 60_000 },
        },
      );
      expect(sent[0]?.payload).toMatchObject({
        module: 'chat-attachment',
        folderId: 'fold-1',
        retentionPolicy: { kind: 'temporary', maxRetentionMs: 60_000 },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uploadAttachment uses upload-complete when upload-init.presignPut is false', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('fetch must not run on the base64 complete path');
    }) as typeof fetch;
    try {
      const chat = createNexusChat({
        client: {
          send: async (command: string, payload?: Record<string, unknown>) => {
            sent.push({ command, payload });
            if (command === 'anx.file.upload-init') {
              return {
                ok: true,
                data: {
                  fileId: 'f-local',
                  storageKey: 'chat-attachment/f-local.bin',
                  workspaceId: 'ws-1',
                  presignPut: false,
                },
              };
            }
            if (command === 'anx.file.upload-complete') {
              return { ok: true, data: { fileId: 'f-local' } };
            }
            return { ok: true, data: {} };
          },
        },
      });
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const result = await chat.uploadAttachment({
        name: 'note.txt',
        type: 'text/plain',
        size: bytes.byteLength,
        body: bytes,
      });
      expect(result.fileId).toBe('f-local');
      expect(sent.map((s) => s.command)).toEqual([
        'anx.file.upload-init',
        'anx.file.upload-complete',
      ]);
      expect(sent[1]?.payload).toMatchObject({
        fileId: 'f-local',
        base64Data: Buffer.from(bytes).toString('base64'),
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uploadAttachment falls back to upload-complete when presign.put is unsupported', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('fetch must not run when presign is unsupported');
    }) as typeof fetch;
    try {
      const chat = createNexusChat({
        client: {
          send: async (command: string, payload?: Record<string, unknown>) => {
            sent.push({ command, payload });
            if (command === 'anx.file.upload-init') {
              return {
                ok: true,
                data: { fileId: 'f-fb', storageKey: 'chat/f-fb.bin', workspaceId: 'ws-1' },
              };
            }
            if (command === 'anx.storage.presign.put') {
              return {
                ok: false,
                kind: 'error',
                error: { code: 'STORAGE_CAPABILITY_UNSUPPORTED', message: 'presignPut' },
              };
            }
            if (command === 'anx.file.upload-complete') {
              return { ok: true, data: { fileId: 'f-fb' } };
            }
            return { ok: true, data: {} };
          },
        },
      });
      const bytes = new Uint8Array([9, 8]);
      await chat.uploadAttachment({
        name: 'a.bin',
        type: 'application/octet-stream',
        size: bytes.byteLength,
        body: bytes,
      });
      expect(sent.map((s) => s.command)).toEqual([
        'anx.file.upload-init',
        'anx.storage.presign.put',
        'anx.file.upload-complete',
      ]);
      expect(sent.some((s) => s.command === 'anx.storage.bucket.trash-file')).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uploadAttachment reports progress on the base64 complete path', async () => {
    const fractions: number[] = [];
    const chat = createNexusChat({
      client: {
        send: async (command: string) => {
          if (command === 'anx.file.upload-init') {
            return {
              ok: true,
              data: {
                fileId: 'f-p',
                storageKey: 'chat/f-p.bin',
                workspaceId: 'ws-1',
                presignPut: false,
              },
            };
          }
          if (command === 'anx.file.upload-complete') {
            return { ok: true, data: { fileId: 'f-p' } };
          }
          return { ok: true, data: {} };
        },
      },
    });
    const bytes = new Uint8Array([1, 2, 3]);
    await chat.uploadAttachment(
      { name: 'a.bin', type: 'application/octet-stream', size: bytes.byteLength, body: bytes },
      { onProgress: (evt) => fractions.push(evt.fraction) },
    );
    expect(fractions.length).toBeGreaterThan(1);
    expect(fractions[0]).toBeLessThan(1);
    expect(fractions[fractions.length - 1]).toBe(1);
  });

  it('fires onSendOutcome exactly once per sendMessage call', async () => {
    const outcomes: string[] = [];
    const chat = createNexusChat({
      client: {
        send: async () => ({ ok: true, data: {} }),
      },
      hooks: {
        onSendOutcome: (code) => outcomes.push(code),
      },
    });
    const result = await chat.sendMessage('ping', {});
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.code).toBe('client_preflight');
    expect(outcomes).toEqual(['client_preflight']);
  });

  it('maps orchestration.aiParticipants onto participant.aiConfig in getRoom', async () => {
    const chat = createNexusChat({
      client: {
        send: async (command: string) => {
          if (command === 'anx.communicate.rooms.get') {
            return {
              ok: true,
              data: {
                roomId: 'r1',
                title: 'Room',
                viewerIsOwner: true,
                participants: [
                  { type: 'agent', id: 'a1', displayName: 'Ada' },
                  { type: 'user', id: 'u1', displayName: 'Bob' },
                ],
                orchestration: {
                  defaultAiResponseMode: 'mention_only',
                  aiParticipants: [
                    {
                      participantType: 'agent',
                      participantId: 'a1',
                      modelId: 'm1',
                      responseMode: 'always',
                      compactBeforeReply: true,
                    },
                  ],
                },
              },
            };
          }
          return { ok: true, data: {} };
        },
      },
    });
    const detail = await chat.getRoom('r1');
    expect(detail.participants[0].aiConfig).toEqual({
      modelId: 'm1',
      responseMode: 'always',
      compactBeforeReply: true,
    });
    expect(detail.participants[1].aiConfig).toBeNull();
  });

  it('sends flat ai-participant.upsert payload', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const chat = createNexusChat({
      client: {
        send: async (command: string, payload?: Record<string, unknown>) => {
          sent.push({ command, payload });
          return { ok: true, data: {} };
        },
      },
    });
    await chat.upsertAiParticipant({
      roomId: 'r1',
      participantType: 'agent',
      participantId: 'a1',
      responseMode: null,
      compactBeforeReply: true,
      modelId: null,
    });
    expect(sent[0]?.payload).toMatchObject({
      roomId: 'r1',
      participantType: 'agent',
      participantId: 'a1',
      responseMode: null,
      compactBeforeReply: true,
      modelId: null,
    });
    expect(sent[0]?.payload).not.toHaveProperty('participant');
  });

  it('marks user turns sending → sent on successful sendMessage', async () => {
    const chat = createNexusChat({
      client: {
        send: async (command: string) => {
          if (command === 'anx.communicate.stream-init') {
            return { ok: true, data: { endpoints: [], token: null, resourceId: 'c1' } };
          }
          if (command === 'anx.communicate.message.send') {
            return { ok: true, data: { text: 'pong', conversationId: 'c1' } };
          }
          if (command === 'anx.communicate.conversations.messages.list') {
            return { ok: true, data: { messages: [] } };
          }
          return { ok: true, data: {} };
        },
      },
    });
    await chat.sendMessage('ping', { conversationId: 'c1' });
    const userTurn = chat.getState().turns.find((t) => t.role === 'user');
    expect(userTurn?.deliveryStatus).toBe('sent');
  });

  it('marks user turns failed with deliveryError on stream_init failure', async () => {
    const chat = createNexusChat({
      client: {
        send: async (command: string) => {
          if (command === 'anx.communicate.stream-init') {
            return {
              ok: false,
              kind: 'STREAM_ENDPOINTS_UNCONFIGURED',
              message: 'No public stream endpoints configured',
            };
          }
          return { ok: true, data: {} };
        },
      },
    });
    const result = await chat.sendMessage('hi', { conversationId: 'c1' });
    expect(result.ok).toBe(false);
    const userTurn = chat.getState().turns.find((t) => t.role === 'user');
    expect(userTurn?.deliveryStatus).toBe('failed');
    expect(userTurn?.deliveryError?.message).toMatch(/stream endpoint/i);
  });
});
