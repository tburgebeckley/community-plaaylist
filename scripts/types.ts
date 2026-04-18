export interface Track {
  title: string;
  artist: string;
  album?: string; // optional, improves search accuracy
}

export interface Playlist {
  name: string;
  description: string;
  tracks: Track[];
}

export interface Config {
  tidal: { playlistId: string };
}

export interface SyncReport {
  synced: number;
  unmatched: Track[];
}
