# A Coder's Paradise

A community-curated playlist synced to Tidal via GitHub Actions. Edit a JSON file, open a PR — the rest is automatic.

## How it works

- **`playlist.json`** is the source of truth. It defines the playlist name, description, and track list.
- When a PR modifies `playlist.json`, a GitHub Actions workflow searches for each track on Tidal and posts a comment listing any that couldn't be matched.
- When a PR is merged to `main`, a second workflow syncs the playlist to Tidal automatically.

## Contributing a track

1. Fork the repo and create a branch
2. Edit `playlist.json` — add, remove, or reorder tracks:
   ```json
   { "title": "Track Name", "artist": "Artist Name" }
   ```
   An optional `"album"` field can be added to improve search accuracy for tracks with common names.
3. Open a PR — the validation workflow will comment with any tracks it can't find on Tidal
4. Once approved and merged, the playlist updates automatically

## Repository structure

```
playlist.json                   # edit this to manage the playlist
config.json                     # stores the Tidal playlist ID (auto-managed)
scripts/
  tidal.ts                      # Tidal API client
  sync.ts                       # syncs playlist.json to Tidal (runs on merge)
  validate.ts                   # checks tracks exist on Tidal (runs on PR)
  auth-setup/tidal-auth.ts      # one-time OAuth helper for maintainers
.github/
  CODEOWNERS                    # @tburgebeckley
  workflows/
    validate.yml                # PR check
    sync.yml                    # post-merge sync
```

## Maintainer setup

These steps only need to be done once when setting up a new environment.

### 1. Register a Tidal developer app

Create an app at [developer.tidal.com](https://developer.tidal.com) with:
- Scopes: `playlists.read`, `playlists.write`
- Redirect URI: `http://localhost:8080/callback`

### 2. Capture a refresh token

```bash
npm install
TIDAL_CLIENT_ID=your_id npm run auth:tidal
```

This opens a browser, completes the OAuth flow, and prints a refresh token.

### 3. Add GitHub Actions secrets

In **Settings → Secrets and variables → Actions**, add:

| Secret | Description |
|---|---|
| `TIDAL_CLIENT_ID` | Your Tidal app's client ID |
| `TIDAL_CLIENT_SECRET` | Your Tidal app's client secret |
| `TIDAL_REFRESH_TOKEN` | Captured by `npm run auth:tidal` |

### 4. Trigger the first sync

Push any change to `playlist.json` or manually run the **Sync Playlist** workflow from the Actions tab.
