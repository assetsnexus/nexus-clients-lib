import { describe, expect, it } from 'vitest';
import { createNexusChat, normalizeHostPageContext } from './index.js';

describe('host page context', () => {
  it('drops an empty project id and keeps a generic project field', () => {
    expect(normalizeHostPageContext(null)).toBeUndefined();
    expect(normalizeHostPageContext({ projectId: '  ' })).toBeUndefined();
    expect(normalizeHostPageContext({ projectId: 'proj-1', projectName: ' Alpha ' })).toEqual({
      projectId: 'proj-1',
      projectName: 'Alpha',
    });
    expect(Object.keys(normalizeHostPageContext({ projectId: 'proj-1' }) || {})).toEqual(['projectId']);
  });

  it('sends the stored project id and omits the field when none is set', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const chat = createNexusChat({
      client: {
        send: async (command: string, payload?: Record<string, unknown>) => {
          sent.push({ command, payload });
          if (command === 'anx.communicate.message.send') {
            return { ok: true, data: { text: 'ok', conversationId: 'c1' } };
          }
          return { ok: true, data: {} };
        },
      },
    });

    await chat.sendMessage('plain', { conversationId: 'c1' });
    const plain = sent.find((entry) => entry.payload && 'text' in (entry.payload ?? {}));
    expect(plain?.payload?.pageContext).toBeUndefined();

    chat.setHostPageContext({ projectId: 'proj-1', projectName: 'Alpha' });
    await chat.sendMessage('with project', { conversationId: 'c1' });
    const withProject = sent.filter((entry) => entry.command === 'anx.communicate.message.send').at(-1);
    expect(withProject?.payload?.pageContext).toEqual({ projectId: 'proj-1', projectName: 'Alpha' });

    chat.setHostPageContext({ projectId: '   ' });
    await chat.sendMessage('cleared', { conversationId: 'c1' });
    const cleared = sent.filter((entry) => entry.command === 'anx.communicate.message.send').at(-1);
    expect(cleared?.payload?.pageContext).toBeUndefined();
  });
});
