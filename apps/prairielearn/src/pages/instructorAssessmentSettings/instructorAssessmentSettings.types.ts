export interface SettingsFormValues {
  aid: string;
  title: string;
  set: string;
  number: string;
  module: string;
  text?: string;
  allow_issue_reporting: boolean;
  allow_personal_notes: boolean;
  multiple_instance: boolean;
  auto_close: boolean;
  require_honor_code: boolean;
  honor_code?: string;
  max_points: number | null;
  max_bonus_points: number | null;
  constant_question_value: boolean;
  shuffle_questions: boolean;
  advance_score_perc: number | null;
  allow_real_time_grading: boolean;
  grade_rate_minutes: number | null;
  tools?: Record<string, boolean>;
}
