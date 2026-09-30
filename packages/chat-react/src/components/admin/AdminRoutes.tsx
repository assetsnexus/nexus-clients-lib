import { useState } from 'react';

const PAGES = [
  { id: 'brain', title: 'Brain' },
  { id: 'memory', title: 'Memory' },
  { id: 'automations', title: 'Automations' },
  { id: 'cost', title: 'Cost' },
  { id: 'proxy-key', title: 'Proxy key' },
] as const;

export type AdminPageId = (typeof PAGES)[number]['id'];

export function AdminRoutes() {
  const [page, setPage] = useState<AdminPageId>('brain');
  const current = PAGES.find((p) => p.id === page) || PAGES[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <nav className="nexus-chat__admin-nav" aria-label="Admin">
        {PAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`nexus-chat__btn${p.id === page ? ' nexus-chat__btn--primary' : ''}`}
            onClick={() => setPage(p.id)}
          >
            {p.title}
          </button>
        ))}
      </nav>
      <div className="nexus-chat__admin-page">
        <h2 style={{ marginTop: 0 }}>{current.title}</h2>
        <p style={{ color: 'var(--nx-chat-muted)' }}>
          Placeholder admin surface for {current.title}. Wire portal commands here when embedding in
          management UI.
        </p>
      </div>
    </div>
  );
}
