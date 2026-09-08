import express from 'express';
import {
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  generateOAuthState,
  generatePkce,
} from '@nexus/commands-client';

const app = express();
const sessions = new Map();
const issuer = process.env.NEXUS_ISSUER;
const clientId = process.env.NEXUS_CLIENT_ID;
const clientSecret = process.env.NEXUS_CLIENT_SECRET;
const redirectUri = process.env.NEXUS_REDIRECT_URI || 'http://localhost:4099/callback';

app.get('/login', async (_req, res) => {
  const pkce = await generatePkce();
  const state = generateOAuthState();
  sessions.set(state, pkce);
  res.redirect(buildAuthorizeUrl({ issuer, clientId, redirectUri, state, codeChallenge: pkce.codeChallenge }));
});

app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const pkce = sessions.get(state);
  if (!pkce) return res.status(400).send('bad state');
  const tokens = await exchangeAuthorizationCode({
    issuer, clientId, clientSecret, code: String(code), redirectUri, codeVerifier: pkce.codeVerifier,
  });
  res.json({ ok: true, grant_id: tokens.grant_id, expires_in: tokens.expires_in });
});

app.listen(4099, () => console.log('listening on 4099'));
