import { z } from 'zod';

import type { StaffAssessmentQuestionRow } from '../../lib/assessment-question.shared.js';
import type { EnumAssessmentType } from '../../lib/db-types.js';
import {
  QuestionAlternativeJsonSchema,
  ZoneAssessmentJsonSchema,
  ZoneQuestionBlockJsonSchema,
} from '../../schemas/infoAssessment.js';

/**
 * Branded UUID type for stable drag-and-drop identity.
 * Using a branded type prevents accidental confusion with question IDs (QIDs).
 */
export const TrackingIdSchema = z.string().uuid().brand<'TrackingId'>();
export type TrackingId = z.infer<typeof TrackingIdSchema>;

/**
 * Form version of QuestionAlternativeJson - adds trackingId for stable drag-and-drop identity.
 */
export const QuestionAlternativeFormSchema = QuestionAlternativeJsonSchema.extend({
  trackingId: TrackingIdSchema,
});
export type QuestionAlternativeForm = z.infer<typeof QuestionAlternativeFormSchema>;

/**
 * Form version of ZoneQuestionBlockJson - adds trackingId, updates alternatives type.
 */
export const ZoneQuestionBlockFormSchema = ZoneQuestionBlockJsonSchema.omit({
  alternatives: true,
}).extend({
  trackingId: TrackingIdSchema,
  alternatives: z.array(QuestionAlternativeFormSchema).min(1).optional(),
});
export type ZoneQuestionBlockForm = z.infer<typeof ZoneQuestionBlockFormSchema>;

/**
 * Form version of ZoneAssessmentJson - adds trackingId, updates questions type.
 */
export const ZoneAssessmentFormSchema = ZoneAssessmentJsonSchema.omit({ questions: true }).extend({
  trackingId: TrackingIdSchema,
  questions: z.array(ZoneQuestionBlockFormSchema),
});
export type ZoneAssessmentForm = z.infer<typeof ZoneAssessmentFormSchema>;

/**
 * Assessment data for the question picker, including fields needed for grouping.
 */
export interface AssessmentForPicker {
  assessment_id: string;
  label: string;
  color: string;
  assessment_set_abbreviation?: string;
  assessment_set_name?: string;
  assessment_set_color?: string;
  assessment_number?: string;
}

/**
 * Simplified question data for the question picker modal.
 * Only includes fields needed for display and selection.
 */
export interface CourseQuestionForPicker {
  id: string;
  qid: string;
  title: string;
  topic: { id: string; name: string; color: string };
  tags: { id: string; name: string; color: string }[] | null;
  assessments: AssessmentForPicker[] | null;
}

/**
 * Shared state passed down through the assessment questions table component tree.
 */
export interface AssessmentState {
  questionMetadata: Record<string, StaffAssessmentQuestionRow>;
  editMode: boolean;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  canEdit: boolean;
  showAdvanceScorePercCol: boolean;
  assessmentType: EnumAssessmentType;
}

/**
 * Computes the number of table columns based on UI state.
 * This is derived from editMode and showAdvanceScorePercCol to avoid synchronization issues.
 */
export function getTableColumnCount(
  state: Pick<AssessmentState, 'editMode' | 'showAdvanceScorePercCol'>,
): number {
  const baseCols = state.showAdvanceScorePercCol ? 10 : 9;
  return baseCols + (state.editMode ? 3 : 0);
}

/**
 * The core editor state containing zones and question metadata.
 * Uses form types with trackingId for stable drag-and-drop identity.
 */
export interface EditorState {
  zones: ZoneAssessmentForm[];
  questionMetadata: Record<string, StaffAssessmentQuestionRow>;
  /** Tracks which alternative groups are collapsed by their trackingId */
  collapsedGroups: Set<string>;
  /** Tracks which zones are collapsed by their trackingId */
  collapsedZones: Set<string>;
}

/**
 * Handler for editing a question or alternative in the assessment editor.
 */
export type HandleEditQuestion = (params: {
  question: ZoneQuestionBlockForm | QuestionAlternativeForm;
  zoneQuestionBlock?: ZoneQuestionBlockForm;
  questionTrackingId: string;
  /** Only set when editing an alternative within a zone question block */
  alternativeTrackingId?: string;
}) => void;

/**
 * Handler for deleting a question or alternative from the assessment.
 */
export type HandleDeleteQuestion = (
  questionTrackingId: string,
  questionId: string,
  alternativeTrackingId?: string,
) => void;

/**
 * All possible actions that can modify the editor state.
 * All actions use trackingIds for stable identity instead of position indices.
 * UNDO and REDO are stubbed for a future PR.
 */
export type EditorAction =
  | {
      type: 'ADD_QUESTION';
      zoneTrackingId: string;
      question: ZoneQuestionBlockForm;
      questionData?: StaffAssessmentQuestionRow;
    }
  | {
      type: 'UPDATE_QUESTION';
      questionTrackingId: string;
      question: Partial<ZoneQuestionBlockForm> | Partial<QuestionAlternativeForm>;
      /** Only set when updating an alternative within an alternative group */
      alternativeTrackingId?: string;
    }
  | {
      type: 'DELETE_QUESTION';
      questionTrackingId: string;
      questionId: string;
      /** Only set when deleting an alternative from an alternative group */
      alternativeTrackingId?: string;
    }
  | {
      type: 'REORDER_QUESTION';
      questionTrackingId: string;
      toZoneTrackingId: string;
      /** trackingId of the question to insert before, or null to append at end */
      beforeQuestionTrackingId: string | null;
    }
  | {
      type: 'ADD_ZONE';
      zone: ZoneAssessmentForm;
    }
  | {
      type: 'UPDATE_ZONE';
      zoneTrackingId: string;
      zone: Partial<ZoneAssessmentForm>;
    }
  | {
      type: 'DELETE_ZONE';
      zoneTrackingId: string;
    }
  | {
      type: 'REORDER_ZONE';
      zoneTrackingId: string;
      /** Zone to insert before, or null to append at end */
      beforeZoneTrackingId: string | null;
    }
  | {
      type: 'UPDATE_QUESTION_METADATA';
      questionId: string;
      oldQuestionId?: string;
      questionData: StaffAssessmentQuestionRow;
    }
  | {
      type: 'TOGGLE_GROUP_COLLAPSE';
      trackingId: string;
    }
  | {
      type: 'TOGGLE_ZONE_COLLAPSE';
      trackingId: string;
    }
  | { type: 'EXPAND_ALL' }
  | { type: 'COLLAPSE_ALL' }
  | { type: 'RESET' }
  // Stubbed for future PR - will implement history tracking
  | { type: 'UNDO' }
  | { type: 'REDO' };
