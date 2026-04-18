/**
 * Tidal API client using direct HTTP calls.
 * Avoids the browser-only @tidal-music/auth SDK (requires localStorage).
 *
 * Endpoints are documented at developer.tidal.com.
 * Items marked NOTE should be verified once you have a developer account.
 */
import { withRetry, chunk } from './utils';
import type { Track } from './types';

const API_BASE = 'https://openapi.tidal.com/v2';
const AUTH_BASE = 'https://auth.tidal.com/v1';
const COUNTRY_CODE = 'US';

// --- Auth ---

export async function getClientToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await tidalTokenRequest(clientId, clientSecret, {
    grant_type: 'client_credentials',
  });
  return res.access_token;
}

export async function refreshUserToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const res = await tidalTokenRequest(clientId, clientSecret, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  return res.access_token;
}

// Auth base URLs confirmed against tidal-sdk-web source:
// - Login: https://login.tidal.com/authorize
// - Token: https://auth.tidal.com/v1/oauth2/token
async function tidalTokenRequest(
  clientId: string,
  clientSecret: string,
  body: Record<string, string>
): Promise<{ access_token: string }> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${AUTH_BASE}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new Error(`Tidal auth error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{ access_token: string }>;
}

// --- API helpers ---

async function tidalFetch<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/vnd.api+json',
      ...options.headers,
    },
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') ?? '1') * 1000;
    throw Object.assign(new Error('Rate limited'), { retryAfter });
  }

  if (!res.ok) {
    throw new Error(`Tidal API error ${res.status}: ${await res.text()}`);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// --- Catalog search (client credentials) ---

export async function searchTrack(token: string, track: Track): Promise<string | null> {
  const query = `${track.artist} ${track.title}${track.album ? ` ${track.album}` : ''}`;

  return withRetry(async () => {
    // NOTE: verify path and params at developer.tidal.com
    const data = await tidalFetch<any>(
      `/searchresults/${encodeURIComponent(query)}?countryCode=${COUNTRY_CODE}&include=tracks&limit=5`,
      token
    );

    const included: any[] = data?.included ?? [];
    const tracks = included.filter(item => item.type === 'tracks');
    if (tracks.length === 0) return null;

    const titleLower = track.title.toLowerCase();
    const artistLower = track.artist.toLowerCase();

    const best = tracks.find(t => {
      const titleMatch = t.attributes?.title?.toLowerCase() === titleLower;
      const artistMatch = (t.attributes?.artists as any[] | undefined)?.some((a: any) =>
        a.name?.toLowerCase().includes(artistLower)
      );
      return titleMatch && artistMatch;
    }) ?? tracks[0];

    return best?.id ?? null;
  });
}

// --- Playlist operations (user token) ---

export async function getOrCreatePlaylist(
  token: string,
  playlistId: string,
  name: string,
  description: string
): Promise<string> {
  if (playlistId) return playlistId;

  // NOTE: verify endpoint and request body shape at developer.tidal.com
  const data = await tidalFetch<any>('/playlists', token, {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'playlists',
        attributes: { name, description, privacy: 'PUBLIC' },
      },
    }),
  });

  const id: string | undefined = data?.data?.id;
  if (!id) throw new Error('Failed to create Tidal playlist — unexpected response shape');

  console.log(`Created Tidal playlist: ${id}`);
  return id;
}

export async function syncPlaylist(
  token: string,
  playlistId: string,
  trackIds: string[]
): Promise<void> {
  // NOTE: verify delete + post endpoints at developer.tidal.com
  // Clear existing tracks
  await tidalFetch(`/playlists/${playlistId}/relationships/items`, token, {
    method: 'DELETE',
  });

  // Tidal's per-request limit for adding items — NOTE: verify this limit
  const BATCH_SIZE = 20;
  for (const batch of chunk(trackIds, BATCH_SIZE)) {
    await withRetry(() =>
      tidalFetch(`/playlists/${playlistId}/relationships/items`, token, {
        method: 'POST',
        body: JSON.stringify({
          data: batch.map(id => ({ type: 'tracks', id })),
        }),
      })
    );
  }
}
