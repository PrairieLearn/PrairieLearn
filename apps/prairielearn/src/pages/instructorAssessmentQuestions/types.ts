import type { StaffAssessmentQuestionRow } from '../../lib/assessment-question.js';
import type { EnumAssessmentType } from '../../lib/db-types.js';

import type {
  QuestionAlternativeForm,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from './instructorAssessmentQuestions.shared.js';

/**
 * Simplified question data for the question picker modal.
 * Only includes fields needed for display and selection.
 */
export interface CourseQuestionForPicker {
  qid: string;
  title: string;
  topic: { id: string; name: string; color: string };
  tags: { id: string; name: string; color: string }[] | null;
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
  | {
      type: 'ADD_ALTERNATIVE_GROUP';
      zoneTrackingId: string;
      group: ZoneQuestionBlockForm;
    }
  | {
      type: 'ADD_TO_ALTERNATIVE_GROUP';
      questionTrackingId: string;
      targetGroupTrackingId: string;
    }
  | {
      type: 'EXTRACT_FROM_ALTERNATIVE_GROUP';
      groupTrackingId: string;
      alternativeTrackingId: string;
      toZoneTrackingId: string;
      beforeQuestionTrackingId: string | null;
    }
  // Stubbed for future PR - will implement history tracking
  | { type: 'UNDO' }
  | { type: 'REDO' };

/**
 * Drag data types for dnd-kit drag-and-drop.
 * Attached to draggable items via useSortable data prop.
 */
export interface ZoneDragData {
  type: 'zone';
}

export interface QuestionDragData {
  type: 'question';
}

export interface AlternativeDragData {
  type: 'alternative';
  groupTrackingId: string;
}

export interface GroupDropData {
  type: 'group-drop';
  groupTrackingId: string;
}

export type DragData = ZoneDragData | QuestionDragData | AlternativeDragData;
export type DropData = DragData | GroupDropData;

/**
 * Parsed drag event context extracted from dnd-kit Active and Over objects.
 * Provides typed access to drag/drop identifiers and type information.
 */
export interface ParsedDragEvent {
  activeId: string;
  overId: string;
  activeType: 'zone' | 'question' | 'alternative' | undefined;
  overType: 'zone' | 'question' | 'alternative' | 'group-drop' | undefined;
  /** Set when activeType is 'alternative' */
  activeGroupTrackingId?: string;
  /** Set when overType is 'group-drop' */
  overGroupTrackingId?: string;
}
