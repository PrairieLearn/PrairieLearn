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
  tools?: Record<string, boolean>;
}
