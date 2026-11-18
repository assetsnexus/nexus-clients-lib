/**
 * Fallback chat for "Nexus is down / the grant was revoked".
 *
 * Deliberately limited: a plain OpenAI-compatible completion with no tools, no
 * memory and no subagents. That is Nexus's job when it is reachable. The point
 * is that the app never dead-ends.
 *
 * With no provider configured the app answers from a local function, so a fresh
 * clone works offline. A broken provider degrades to the local answer instead of
 * surfacing a dead end.
 */

export type FallbackMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type FallbackCompletion = {
  choices: Array<{ message: { role: 'assistant'; content: string } }>;
  /** Which path answered, so the UI can label it honestly. */
  source: 'provider' | 'local';
};

export type FallbackChatOptions = {
  /** OpenAI-compatible base URL, e.g. `https://openrouter.ai/api/v1`. */
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  /** Prepended as a system message when a provider is used. */
  systemPrompt?: string;
  /** The offline answer. Receives the last user message. */
  localAnswer: (question: string) => string;
  fetchImpl?: typeof fetch;
};

export type FallbackChat = {
  complete: (input: { messages?: FallbackMessage[]; model?: string }) => Promise<FallbackCompletion>;
};

function lastUserMessage(messages: FallbackMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') return String(messages[i].content || '');
  }
  return '';
}

export function createFallbackChat(opts: FallbackChatOptions): FallbackChat {
  const fetchImpl = opts.fetchImpl || fetch;
  const base = (opts.baseUrl || '').replace(/\/+$/, '');

  return {
    async complete(input) {
      const messages = Array.isArray(input.messages) ? input.messages : [];
      const question = lastUserMessage(messages);

      if (!base) {
        return {
          source: 'local',
          choices: [{ message: { role: 'assistant', content: opts.localAnswer(question) } }],
        };
      }

      const body = {
        model: input.model || opts.model || 'openai/gpt-4o-mini',
        messages: [
          ...(opts.systemPrompt ? [{ role: 'system', content: opts.systemPrompt }] : []),
          ...messages,
        ],
      };
      try {
        const res = await fetchImpl(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`provider returned HTTP ${res.status}`);
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string | null } }>;
        };
        const content = json.choices?.[0]?.message?.content;
        if (!content) throw new Error('provider returned no content');
        return { source: 'provider', choices: [{ message: { role: 'assistant', content } }] };
      } catch (err) {
        // A broken provider must not break the fallback: degrade to the local
        // answer and say so, rather than surfacing a dead end.
        const detail = err instanceof Error ? err.message : 'provider error';
        return {
          source: 'local',
          choices: [
            {
              message: {
                role: 'assistant',
                content: `${opts.localAnswer(question)}\n\n_(The configured fallback provider failed: ${detail})_`,
              },
            },
          ],
        };
      }
    },
  };
}
