import type { Dispatch } from 'react';
import { z } from 'zod';

import type { StaffAssessmentQuestionRow } from '../../lib/assessment-question.shared.js';
import type { EnumAssessmentType } from '../../lib/db-types.js';
import {
  QuestionAlternativeJsonSchema,
  ZoneAssessmentJsonSchema,
  ZoneQuestionBlockJsonSchema,
} from '../../schemas/infoAssessment.js';

import type { AssessmentAdvancedDefaults } from './utils/formHelpers.js';

/**
 * Describes which items are new vs modified compared to the initial state.
 * Used to show colored dot indicators in the tree view.
 */
export interface ChangeTrackingResult {
  newIds: Set<string>;
  modifiedIds: Set<string>;
}

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
 * The core editor state containing zones and question metadata.
 * Uses form types with trackingId for stable drag-and-drop identity.
 */
export interface EditorState {
  zones: ZoneAssessmentForm[];
  questionMetadata: Partial<Record<string, StaffAssessmentQuestionRow>>;
  /** Tracks which alternative groups are collapsed by their trackingId */
  collapsedGroups: Set<string>;
  /** Tracks which zones are collapsed by their trackingId */
  collapsedZones: Set<string>;
}

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
      question: Partial<ZoneQuestionBlockForm>;
      alternativeTrackingId?: undefined;
    }
  | {
      type: 'UPDATE_QUESTION';
      questionTrackingId: string;
      question: Partial<QuestionAlternativeForm>;
      alternativeTrackingId: string;
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
  | { type: 'EXPAND_ALL_GROUPS' }
  | { type: 'COLLAPSE_ALL_GROUPS' }
  | { type: 'RESET' }
  | {
      type: 'ADD_ALTERNATIVE';
      altGroupTrackingId: string;
      alternative: QuestionAlternativeForm;
      questionData?: StaffAssessmentQuestionRow;
    }
  | {
      type: 'REORDER_ALTERNATIVE';
      alternativeTrackingId: string;
      toAltGroupTrackingId: string;
      /** trackingId of the alternative to insert before, or null to append at end */
      beforeAlternativeTrackingId: string | null;
    }
  | {
      type: 'EXTRACT_ALTERNATIVE_TO_QUESTION';
      alternativeTrackingId: string;
      toZoneTrackingId: string;
      /** trackingId of the question to insert before, or null to append at end */
      beforeQuestionTrackingId: string | null;
    }
  | {
      type: 'MERGE_QUESTION_INTO_ALT_GROUP';
      questionTrackingId: string;
      toAltGroupTrackingId: string;
      /** trackingId of the alternative to insert before, or null to append at end */
      beforeAlternativeTrackingId: string | null;
    }
  | { type: 'REMOVE_QUESTION_BY_QID'; qid: string }
  // Stubbed for future PR - will implement history tracking
  | { type: 'UNDO' }
  | { type: 'REDO' };

/**
 * Represents the currently selected item in the split-pane editor.
 * The detail panel renders based on this selection.
 */
export type SelectedItem =
  | { type: 'zone'; zoneTrackingId: string }
  | { type: 'question'; questionTrackingId: string }
  | { type: 'alternative'; questionTrackingId: string; alternativeTrackingId: string }
  | { type: 'altGroup'; questionTrackingId: string }
  | { type: 'picker'; zoneTrackingId: string; returnToSelection?: SelectedItem }
  | { type: 'altGroupPicker'; zoneTrackingId: string; altGroupTrackingId?: string }
  | null;

export type ViewType = 'simple' | 'detailed';

/**
 * Describes the parent values from which advanced fields can be inherited.
 */
export type InheritanceSource = 'zone' | 'group' | 'assessment';

/**
 * Bundles all callbacks passed through the assessment tree hierarchy.
 */
export interface TreeActions {
  onAddQuestion: (zoneTrackingId: string) => void;
  onAddAltGroup: (zoneTrackingId: string) => void;
  onAddToAltGroup: (altGroupTrackingId: string) => void;
  onDeleteQuestion: (
    questionTrackingId: string,
    questionId: string,
    alternativeTrackingId?: string,
  ) => void;
  onDeleteZone: (zoneTrackingId: string) => void;
  setSelectedItem: (item: SelectedItem) => void;
  dispatch: Dispatch<EditorAction>;
}

/**
 * Bundles shared read-only state passed through the assessment tree hierarchy.
 */
export interface TreeState {
  editMode: boolean;
  viewType: ViewType;
  selectedItem: SelectedItem;
  questionMetadata: Partial<Record<string, StaffAssessmentQuestionRow>>;
  collapsedGroups: Set<string>;
  collapsedZones: Set<string>;
  changeTracking: ChangeTrackingResult;
  courseInstanceId: string;
  hasCoursePermissionPreview: boolean;
  assessmentType: EnumAssessmentType;
}

/**
 * Bundles shared read-only state passed through the detail panel hierarchy.
 */
export interface DetailState {
  editMode: boolean;
  assessmentType: EnumAssessmentType;
  constantQuestionValue: boolean;
  assessmentDefaults: AssessmentAdvancedDefaults;
  courseInstanceId: string;
  courseId: string;
  hasCoursePermissionPreview: boolean;
}

/**
 * Bundles all callbacks used by the detail panel hierarchy.
 */
export interface DetailActions {
  onUpdateZone: (zoneTrackingId: string, zone: Partial<ZoneAssessmentForm>) => void;
  onUpdateQuestion: (
    questionTrackingId: string,
    question: Partial<ZoneQuestionBlockForm> | Partial<QuestionAlternativeForm>,
    alternativeTrackingId?: string,
  ) => void;
  onDeleteQuestion: (
    questionTrackingId: string,
    questionId: string,
    alternativeTrackingId?: string,
  ) => void;
  onDeleteZone: (zoneTrackingId: string) => void;
  onAddToAltGroup: (altGroupTrackingId: string) => void;
  onQuestionPicked: (qid: string) => void;
  onPickQuestion: (currentSelection: SelectedItem) => void;
  onRemoveQuestionByQid: (qid: string) => void;
  onResetButtonClick: (assessmentQuestionId: string) => void;
}
