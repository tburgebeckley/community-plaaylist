/**
 * PR validation script — runs on pull_request events.
 *
 * Uses client credentials (no user token needed) to search all tracks
 * in playlist.json against the Tidal catalog. Posts a PR comment listing
 * any tracks that can't be matched. Always exits 0 — advisory only.
 */
import { getClientToken, searchTrack } from './tidal';
import { readPlaylist, getEnv } from './utils';
import type { Track } from './types';

async function validateTracks(token: string, tracks: Track[]): Promise<Track[]> {
  const unmatched: Track[] = [];
  for (const track of tracks) {
    const id = await searchTrack(token, track);
    if (id) {
      console.log(`  ✓ ${track.artist} — ${track.title}`);
    } else {
      console.log(`  ✗ ${track.artist} — ${track.title}`);
      unmatched.push(track);
    }
  }
  return unmatched;
}

async function upsertPRComment(unmatched: Track[]): Promise<void> {
  const githubToken = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const prNumber = process.env.PR_NUMBER;
  if (!githubToken || !repo || !prNumber) return;

  const MARKER = '<!-- community-playlist-validation -->';
  const body =
    unmatched.length === 0
      ? `${MARKER}\n✅ All tracks found on Tidal.`
      : `${MARKER}\n⚠️ **${unmatched.length} track(s) not found on Tidal** — these will be skipped during sync:\n\n${unmatched.map(t => `- ${t.artist} — ${t.title}`).join('\n')}`;

  const [owner, repoName] = repo.split('/');
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const listRes = await fetch(
    `https://api.github.com/repos/${owner}/${repoName}/issues/${prNumber}/comments`,
    { headers }
  );
  const comments = (await listRes.json()) as Array<{ id: number; body: string }>;
  const existing = comments.find(c => c.body?.includes(MARKER));

  if (existing) {
    await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/issues/comments/${existing.id}`,
      { method: 'PATCH', headers, body: JSON.stringify({ body }) }
    );
  } else {
    await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/issues/${prNumber}/comments`,
      { method: 'POST', headers, body: JSON.stringify({ body }) }
    );
  }
}

async function main() {
  const playlist = readPlaylist();
  console.log(`Validating ${playlist.tracks.length} tracks against Tidal...\n`);

  const token = await getClientToken(getEnv('TIDAL_CLIENT_ID'), getEnv('TIDAL_CLIENT_SECRET'));
  const unmatched = await validateTracks(token, playlist.tracks);

  await upsertPRComment(unmatched);

  if (unmatched.length > 0) {
    console.log(`\n⚠️  ${unmatched.length} unmatched track(s) — will be skipped during sync`);
  } else {
    console.log('\n✅ All tracks found');
  }
}

main().catch(err => {
  console.error('Validation error:', err);
  process.exit(1);
});
