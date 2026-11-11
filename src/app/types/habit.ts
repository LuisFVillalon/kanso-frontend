export interface Habit {
  id: number;
  title: string;
  user_id?: string | null;
  current_streak: number;
  max_streak: number;
  logged_today: boolean;
  tags: { id: number; name: string; color?: string | null }[];
  estimated_time?: number | null;
  /** Its usual time of day ("HH:MM"), held for it each day; null or absent when it has none. */
  planned_time?: string | null;
  /** When the habit was archived; null while active. */
  archived_at?: string | null;
}

export interface HabitHistoryEntry {
  date: string;   // YYYY-MM-DD
  logged: boolean;
}
