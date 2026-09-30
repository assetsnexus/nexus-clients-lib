import { useCallback, useEffect, useState } from 'react';
import type { ChatRoomDetail, ChatRoomSummary, NexusChat } from '@nexus/chat-core';

export function RoomsPanel({ chat }: { chat: NexusChat }) {
  const [rooms, setRooms] = useState<ChatRoomSummary[]>([]);
  const [selected, setSelected] = useState<ChatRoomDetail | null>(null);
  const [title, setTitle] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [ttl, setTtl] = useState('');
  const [roomDraft, setRoomDraft] = useState('');
  const [roomSendError, setRoomSendError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await chat.listRooms();
    setRooms(list);
  }, [chat]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createRoom = async () => {
    const { roomId } = await chat.createRoom({
      title: title.trim() || 'New room',
      type: 'group',
    });
    setTitle('');
    await refresh();
    const detail = await chat.getRoom(roomId);
    setSelected(detail);
  };

  const loadDetail = async (room: ChatRoomSummary) => {
    const detail = await chat.getRoom(room.id);
    setSelected(detail);
    await chat.streamInit({ roomId: room.id });
  };

  return (
    <div className="nexus-chat__list" style={{ padding: 8 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          className="nexus-chat__input"
          style={{ minHeight: 36 }}
          placeholder="Room title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="button" className="nexus-chat__btn nexus-chat__btn--primary" onClick={() => void createRoom()}>
          Create
        </button>
      </div>
      {rooms.map((room) => (
        <button
          key={room.id}
          type="button"
          className="nexus-chat__contact"
          onClick={() => void loadDetail(room)}
        >
          <div className="nexus-chat__contact-meta">
            <div className="nexus-chat__contact-name">{room.name || room.title || room.id}</div>
            <div style={{ fontSize: 12, color: 'var(--nx-chat-muted)' }}>
              {room.type || 'group'} · {room.participantCount ?? '?'} members
            </div>
          </div>
        </button>
      ))}
      {selected ? (
        <div style={{ marginTop: 12, fontSize: 13, borderTop: '1px solid var(--nx-chat-border)', paddingTop: 12 }}>
          <strong>{selected.title}</strong>
          <div style={{ marginTop: 6, color: 'var(--nx-chat-muted)' }}>
            {selected.participants?.length ?? 0} participants ·{' '}
            {selected.encryptionMode || 'encryption n/a'}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="nexus-chat__btn"
              onClick={() =>
                void chat.createRoomInvite({ roomId: selected.id }).then((r) => setInviteCode(r.inviteCode))
              }
            >
              Invite
            </button>
            <button
              type="button"
              className="nexus-chat__btn"
              onClick={() =>
                void chat.updateRoomOrchestration({
                  roomId: selected.id,
                  defaultAiResponseMode: 'mention_only',
                })
              }
            >
              Orchestration
            </button>
            <button
              type="button"
              className="nexus-chat__btn"
              onClick={() =>
                void chat.upgradeRoomEncryption({
                  roomId: selected.id,
                  targetMode: 'server_group_v1',
                })
              }
            >
              Encryption
            </button>
          </div>
          {inviteCode ? (
            <div style={{ marginTop: 6 }}>
              Invite code: <code>{inviteCode}</code>
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input
              className="nexus-chat__input"
              style={{ minHeight: 32 }}
              placeholder="Message room…"
              value={roomDraft}
              onChange={(e) => setRoomDraft(e.target.value)}
            />
            <button
              type="button"
              className="nexus-chat__btn nexus-chat__btn--primary"
              onClick={() => {
                const body = roomDraft.trim();
                if (!body) return;
                void chat
                  .sendMessage(body, { roomId: selected.id })
                  .then((res) => {
                    if (res.ok) {
                      setRoomDraft('');
                      setRoomSendError(null);
                    } else {
                      setRoomSendError(res.message || 'Send failed');
                    }
                  })
                  .catch((err: unknown) => {
                    setRoomSendError(err instanceof Error ? err.message : 'Send failed');
                  });
              }}
            >
              Send
            </button>
          </div>
          {roomSendError ? (
            <div style={{ marginTop: 6, color: '#e55353', fontSize: 12 }}>{roomSendError}</div>
          ) : null}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input
              className="nexus-chat__input"
              style={{ minHeight: 32 }}
              placeholder="TTL seconds"
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
            />
            <button
              type="button"
              className="nexus-chat__btn"
              onClick={() =>
                void chat.setRoomRetention({
                  roomId: selected.id,
                  messageTtlSeconds: ttl ? Number(ttl) : null,
                })
              }
            >
              Retention
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
