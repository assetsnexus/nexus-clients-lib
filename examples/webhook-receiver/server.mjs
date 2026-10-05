import express from 'express';
import { expressAdapter } from '@nexus/webhooks';
import { NexusClient, StaticTokenProvider } from '@nexus/commands-client';
import { createMemoryPrivacyJobStore, createPrivacyKit, createSectionRegistry } from '@nexus/privacy';

const app = express();
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));

const client = new NexusClient({
  baseUrl: process.env.NEXUS_REGION_URL,
  tokenProvider: new StaticTokenProvider(process.env.NEXUS_APP_TOKEN),
});

const sections = createSectionRegistry();
sections.register({
  id: 'local-profile',
  export: async (ctx) => ({ sub: ctx.sub }),
  erase: async () => ({ deleted: 1, anonymised: 0, retained: [] }),
});

const privacy = createPrivacyKit({
  client,
  store: createMemoryPrivacyJobStore(),
  sections,
});

app.post('/webhooks/nexus', expressAdapter({
  secret: process.env.NEXUS_WEBHOOK_SECRET,
  handlers: {
    async 'privacy_request.created'(payload) {
      await privacy.handleEvent(payload);
    },
    async 'privacy_request.cancelled'(payload) {
      await privacy.handleEvent(payload);
    },
    async 'account.erased'(payload) {
      await privacy.handleEvent(payload);
    },
  },
}));

setInterval(() => {
  privacy.tick().catch((err) => console.error('privacy tick failed', err instanceof Error ? err.message : err));
}, 30_000);

app.listen(4100);
