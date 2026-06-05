import type { AssessmentModule } from '../../lib/db-types.js';

// Internal form state. `id` and `course_id` are null for modules that haven't
// been created yet, and `trackingId` is a stable client-only key used for React
// keys and to identify rows while editing (a module's name can change).
export type AssessmentModuleFormRow = Omit<AssessmentModule, 'id' | 'course_id'> & {
  trackingId: string;
  id: string | null;
  course_id: string | null;
};
