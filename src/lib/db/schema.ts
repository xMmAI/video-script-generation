export const CREATE_JOBS_TABLE = `
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    title TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    input_file TEXT,
    script_path TEXT,
    audio_path TEXT,
    avatar_intro_path TEXT,
    avatar_outro_path TEXT,
    final_video_path TEXT,
    youtube_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;
