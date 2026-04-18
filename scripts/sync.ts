/**
 * Sync script — runs on push to main when playlist.json changes.
 *
 * Uses a stored user refresh token to create/update the Tidal playlist.
 * If config.tidal.playlistId is empty, creates a new playlist and
 * writes the ID back to config.json (committed by the workflow).
 */
import { appendFileSync } from 'fs';
import { refreshUserToken, searchTrack, getOrCreatePlaylist, syncPlaylist } from './tidal';
import { readPlaylist, readConfig, writeConfig, getEnv } from './utils';
import type { Track, SyncReport } from './types';

async function resolveTracks(
  token: string,
  tracks: Track[]
): Promise<{ ids: string[]; unmatched: Track[] }> {
  const ids: string[] = [];
  const unmatched: Track[] = [];

  for (const track of tracks) {
    const id = await searchTrack(token, track);
    if (id) {
      ids.push(id);
      console.log(`  ✓ ${track.artist} — ${track.title}`);
    } else {
      unmatched.push(track);
      console.log(`  ✗ ${track.artist} — ${track.title} (not found, skipping)`);
    }
  }

  return { ids, unmatched };
}

function writeJobSummary(report: SyncReport): void {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) return;

  let summary = '## Playlist Sync Results\n\n';
  summary += `- **Synced:** ${report.synced} tracks\n`;

  if (report.unmatched.length > 0) {
    summary += `- **Skipped (not found):** ${report.unmatched.length} tracks\n\n`;
    summary += '**Skipped tracks:**\n';
    report.unmatched.forEach(t => {
      summary += `- ${t.artist} — ${t.title}\n`;
    });
  }

  appendFileSync(summaryFile, summary);
}

async function main() {
  const playlist = readPlaylist();
  const config = readConfig();

  console.log(`Syncing "${playlist.name}" (${playlist.tracks.length} tracks)\n`);

  const token = await refreshUserToken(
    getEnv('TIDAL_CLIENT_ID'),
    getEnv('TIDAL_CLIENT_SECRET'),
    getEnv('TIDAL_REFRESH_TOKEN')
  );

  console.log('Resolving tracks...');
  const { ids, unmatched } = await resolveTracks(token, playlist.tracks);

  const playlistId = await getOrCreatePlaylist(
    token,
    config.tidal.playlistId,
    playlist.name,
    playlist.description
  );

  if (playlistId !== config.tidal.playlistId) {
    config.tidal.playlistId = playlistId;
    writeConfig(config);
    console.log('Updated config.json with new playlist ID');
  }

  await syncPlaylist(token, playlistId, ids);

  const report: SyncReport = { synced: ids.length, unmatched };
  writeJobSummary(report);

  console.log(`\n✓ Synced ${ids.length} tracks to Tidal`);
  if (unmatched.length > 0) {
    console.log(`⚠️  ${unmatched.length} track(s) skipped — not found on Tidal`);
  }
}

main().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
