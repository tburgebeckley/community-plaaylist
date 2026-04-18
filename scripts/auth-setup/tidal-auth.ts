/**
 * One-time Tidal OAuth setup.
 *
 * Run locally to capture a refresh token for GitHub Actions:
 *   TIDAL_CLIENT_ID=xxx npm run auth:tidal
 *
 * The redirect URI http://localhost:8080/callback must be registered
 * in your Tidal developer app settings at developer.tidal.com.
 */
import { createServer } from 'http';
import { createHash, randomBytes } from 'crypto';
import open from 'open';

const CLIENT_ID = process.env.TIDAL_CLIENT_ID;
const REDIRECT_URI = 'http://localhost:8080/callback';
const PORT = 8080;

if (!CLIENT_ID) {
  console.error('Set TIDAL_CLIENT_ID before running this script');
  process.exit(1);
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const codeVerifier = base64url(randomBytes(32));
const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());

const authUrl = new URL('https://login.tidal.com/authorize');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('scope', 'playlists.read playlists.write');
authUrl.searchParams.set('code_challenge_method', 'S256');
authUrl.searchParams.set('code_challenge', codeChallenge);

const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);
  if (url.pathname !== '/callback') {
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error || !code) {
    res.end(`Authorization failed: ${error ?? 'no code received'}`);
    server.close();
    return;
  }

  const tokenRes = await fetch('https://auth.tidal.com/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID!,
      code_verifier: codeVerifier,
    }),
  });

  const tokens = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
  };

  if (tokens.error || !tokens.refresh_token) {
    res.end(`Token exchange failed: ${JSON.stringify(tokens)}`);
    server.close();
    return;
  }

  res.end('Authorization successful! You can close this tab.');
  server.close();

  console.log('\n✅ Tidal authorization successful!\n');
  console.log('Add the following secret to your GitHub repository:');
  console.log(`  TIDAL_REFRESH_TOKEN=${tokens.refresh_token}\n`);
});

server.listen(PORT, () => {
  console.log('Opening Tidal authorization page...');
  console.log(`If the browser doesn't open, visit:\n  ${authUrl}\n`);
  open(authUrl.toString());
});
