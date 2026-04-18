# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Community Playlist syncs a single `playlist.json` source-of-truth to Tidal via GitHub Actions.

## Commands

```bash
npm run validate      # search all tracks on Tidal using client credentials (PR check)
npm run sync          # full sync to Tidal using a stored user refresh token
npm run auth:tidal    # one-time OAuth setup to capture the Tidal refresh token
```

## Architecture

**Source of truth:** `playlist.json` — defines the playlist name, description, and track list.
**Platform IDs:** `config.json` — stores the Tidal playlist ID; auto-updated on first sync and committed back by the workflow.

### Scripts (`scripts/`)

| File | Purpose |
|---|---|
| `tidal.ts` | All Tidal API calls: auth, catalog search, playlist create/replace. Uses direct HTTP (no SDK) to avoid the browser-only `@tidal-music/auth` localStorage constraint. |
| `validate.ts` | Searches tracks using client credentials; posts/updates a PR comment listing unmatched tracks; always exits 0. |
| `sync.ts` | Full sync using a stored user refresh token; writes updated `config.json` if a new playlist is created. |
| `utils.ts` | `readPlaylist`, `readConfig`, `writeConfig`, `withRetry`, `chunk`, `getEnv`. |
| `auth-setup/tidal-auth.ts` | PKCE OAuth helper — opens a browser, starts a local callback server on :8080, prints the refresh token to store as a secret. Run locally once. |

### GitHub Actions (`.github/workflows/`)

- **`validate.yml`** — triggers on PRs that modify `playlist.json`; uses `TIDAL_CLIENT_ID` + `TIDAL_CLIENT_SECRET` only (client credentials); posts advisory PR comment.
- **`sync.yml`** — triggers on push to `main` (or manually); uses all three Tidal secrets; commits any `config.json` changes back with `[skip ci]`.

## Required GitHub Secrets

| Secret | Used by |
|---|---|
| `TIDAL_CLIENT_ID` | validate + sync |
| `TIDAL_CLIENT_SECRET` | validate + sync |
| `TIDAL_REFRESH_TOKEN` | sync only |

## First-Time Setup

1. Register an app at [developer.tidal.com](https://developer.tidal.com); add `http://localhost:8080/callback` as a redirect URI.
2. Set `TIDAL_CLIENT_ID` locally and run `npm run auth:tidal` to complete the OAuth flow and capture the refresh token.
3. Add all three secrets to GitHub → Settings → Secrets and variables → Actions.
4. Push a change to `playlist.json` — the sync workflow runs automatically.

## Tidal API Notes

`scripts/tidal.ts` uses `https://openapi.tidal.com/v2` with JSON:API (`application/vnd.api+json`). Lines marked `// NOTE: verify` should be confirmed against the official docs once you have a developer account, as the Tidal API is still evolving.
