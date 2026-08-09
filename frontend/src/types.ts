export type AppStatus =
  | 'loading'
  | 'no-ollama'
  | 'starting-ollama'
  | 'no-model'
  | 'ready';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
}

export interface SaveResponse {
  title: string;
  summary: string;
  timestamp: string;
  new_notes: string[];
  recent_brief: string | null;
}

export interface Note {
  id: string;
  text: string;
  source_session: string;
  created_at: string;
}

export interface Entry {
  timestamp: string;
  title: string;
  summary: string;
  has_chat: boolean;
}

export interface CalendarDay {
  date: string;      // YYYY-MM-DD
  timestamp: string; // full "YYYY-MM-DD HH:MM:SS"
  title: string;
  summary: string;
}

export interface StatsData {
  streak: number;
  total: number;
  this_month: number;
  avg_per_week: number;
  achievements: string[];
}
