import { NexusClient, StaticTokenProvider } from '@nexus/commands-client';
const client = new NexusClient({
  baseUrl: process.env.NEXUS_REGION_URL,
  tokenProvider: new StaticTokenProvider(process.env.NEXUS_API_KEY),
});
const res = await client.send('anx.user.profile.get', {});
console.log(res);
