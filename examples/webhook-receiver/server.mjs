import express from 'express';
import { expressAdapter, completePrivacyRequest } from '@nexus/webhooks';
import { NexusClient, StaticTokenProvider } from '@nexus/commands-client';

const app = express();
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));
const client = new NexusClient({
  baseUrl: process.env.NEXUS_REGION_URL,
  tokenProvider: new StaticTokenProvider(process.env.NEXUS_APP_TOKEN),
});
app.post('/webhooks/nexus', expressAdapter({
  secret: process.env.NEXUS_WEBHOOK_SECRET,
  handlers: {
    async 'privacy.erasure_requested'(payload) {
      // delete local rows for payload.data.userId
      await completePrivacyRequest(client, String(payload.data.requestId), { status: 'completed' });
    },
  },
}));
app.listen(4100);
