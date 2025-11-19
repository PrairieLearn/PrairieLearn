import type { AccessControlJson } from '../../../schemas/accessControl.js';

// Internal form data structure that maintains all field data even when disabled
export interface DateControlFormData {
  enabled: boolean;
  /** These fields are always present in form state, even when the section is disabled */
  releaseDate?: string | null;
  dueDate?: string | null;
  earlyDeadlines?: { date: string; credit: number }[] | null;
  lateDeadlines?: { date: string; credit: number }[] | null;
  afterLastDeadline?: {
    allowSubmissions?: boolean;
    credit?: number;
  };
  durationMinutes?: number | null;
  password?: string | null;
}

export interface PrairieTestControlFormData {
  enabled: boolean;
  exams?: { examUuid: string; readOnly?: boolean }[];
}

export interface AccessControlRuleFormData {
  enabled: boolean;
  blockAccess?: boolean;
  listBeforeRelease?: boolean;
  targets?: string[];
  dateControl: DateControlFormData;
  prairieTestControl: PrairieTestControlFormData;
  afterComplete?: any;
}

// Interface for the form data structure that includes nested paths
export interface AccessControlFormData {
  mainRule: AccessControlRuleFormData;
  overrides: AccessControlRuleFormData[];
}

/** Helper function to transform form data to JSON output */
export function formDataToJson(formData: AccessControlFormData): AccessControlJson[] {
  return [formData.mainRule, ...formData.overrides].map((rule) => transformRule(rule));
}

function transformRule(rule: AccessControlRuleFormData): AccessControlJson {
  const output: AccessControlJson = {
    enabled: rule.enabled,
    blockAccess: rule.blockAccess,
    listBeforeRelease: rule.listBeforeRelease || true,
    targets: rule.targets,
  };

  // Handle dateControl
  if (rule.dateControl.enabled) {
    output.dateControl = {
      enabled: true,
    };

    // Only include fields that are actually set (not undefined)
    if (rule.dateControl.releaseDate !== undefined && rule.dateControl.releaseDate !== null) {
      output.dateControl.releaseDate = rule.dateControl.releaseDate;
    }
    if (rule.dateControl.dueDate !== undefined && rule.dateControl.dueDate !== null) {
      output.dateControl.dueDate = rule.dateControl.dueDate;
    }
    if (
      rule.dateControl.earlyDeadlines !== undefined &&
      rule.dateControl.earlyDeadlines !== null &&
      rule.dateControl.earlyDeadlines.length > 0
    ) {
      output.dateControl.earlyDeadlines = rule.dateControl.earlyDeadlines;
    }
    if (
      rule.dateControl.lateDeadlines !== undefined &&
      rule.dateControl.lateDeadlines !== null &&
      rule.dateControl.lateDeadlines.length > 0
    ) {
      output.dateControl.lateDeadlines = rule.dateControl.lateDeadlines;
    }
    if (rule.dateControl.afterLastDeadline) {
      output.dateControl.afterLastDeadline = rule.dateControl.afterLastDeadline;
    }
    if (
      rule.dateControl.durationMinutes !== undefined &&
      rule.dateControl.durationMinutes !== null
    ) {
      output.dateControl.durationMinutes = rule.dateControl.durationMinutes;
    }
    if (rule.dateControl.password !== undefined && rule.dateControl.password !== null) {
      output.dateControl.password = rule.dateControl.password;
    }
  } else {
    // When disabled, only output { enabled: false }
    output.dateControl = { enabled: false };
  }

  // Handle prairieTestControl
  if (rule.prairieTestControl.enabled) {
    output.prairieTestControl = {
      enabled: true,
      exams: rule.prairieTestControl.exams || [],
    };
  } else {
    // When disabled, only output { enabled: false }
    output.prairieTestControl = { enabled: false };
  }

  // Handle afterComplete (pass through as-is for now)
  if (rule.afterComplete) {
    output.afterComplete = rule.afterComplete;
  }

  return output;
}
