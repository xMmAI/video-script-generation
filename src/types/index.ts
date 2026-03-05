export type JobStatus =
  | 'pending'
  | 'transcribing'
  | 'review'
  | 'approved'
  | 'synthesizing'
  | 'done'
  | 'rendering'
  | 'rendered'
  | 'failed';

export type ScriptSegment = {
  start: number;
  end: number;
  text: string;
};

export type Job = {
  id: string;
  title: string | null;
  status: JobStatus;
  input_file: string | null;
  script_path: string | null;
  audio_path: string | null;
  avatar_intro_path: string | null;
  avatar_outro_path: string | null;
  final_video_path: string | null;
  youtube_url: string | null;
  created_at: string;
  updated_at: string;
};
