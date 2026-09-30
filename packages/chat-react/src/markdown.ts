import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

export const CHAT_MARKDOWN_ROOT_CLASS = 'nexus-chat-markdown';

function wrapTablesForOverflow(html: string): string {
  if (typeof document === 'undefined' || !html.includes('<table')) return html;
  const container = document.createElement('div');
  container.innerHTML = html;
  container.querySelectorAll('table').forEach((table) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'nexus-chat-markdown-table-wrap';
    table.parentNode?.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });
  return container.innerHTML;
}

export function renderChatMarkdown(text: string): string {
  const raw = marked.parse(String(text || ''), { async: false }) as string;
  const sanitized = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  return wrapTablesForOverflow(sanitized);
}
