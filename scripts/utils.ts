import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Playlist, Config } from './types';

// import.meta.url is scripts/utils.ts — one level up is the repo root
const ROOT = new URL('..', import.meta.url).pathname;

export function readPlaylist(): Playlist {
  return JSON.parse(readFileSync(join(ROOT, 'playlist.json'), 'utf-8'));
}

export function readConfig(): Config {
  return JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
}

export function writeConfig(config: Config): void {
  writeFileSync(join(ROOT, 'config.json'), JSON.stringify(config, null, 2) + '\n');
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === retries) throw err;
      const retryAfter = err?.retryAfter ?? attempt * 1000;
      console.warn(`Attempt ${attempt} failed, retrying in ${retryAfter}ms...`);
      await sleep(retryAfter);
    }
  }
  throw new Error('unreachable');
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}
