import type { StaffAssessmentQuestionRow } from '../../lib/assessment-question.js';
import type { EnumAssessmentType } from '../../lib/db-types.js';

import type {
  QuestionAlternativeForm,
  ZoneAssessmentForm,
  ZoneQuestionForm,
} from './instructorAssessmentQuestions.shared.js';

/**
 * Shared state passed down through the assessment questions table component tree.
 */
export interface AssessmentState {
  nTableCols: number;
  questionMap: Record<string, StaffAssessmentQuestionRow>;
  editMode: boolean;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  canEdit: boolean;
  showAdvanceScorePercCol: boolean;
  assessmentType: EnumAssessmentType;
}

/**
 * The core editor state containing zones and question metadata.
 * Uses form types with trackingId for stable drag-and-drop identity.
 */
export interface EditorState {
  zones: ZoneAssessmentForm[];
  questionMap: Record<string, StaffAssessmentQuestionRow>;
}

/**
 * Handler for editing a question or alternative in the assessment editor.
 */
export type HandleEditQuestion = (params: {
  question: ZoneQuestionForm | QuestionAlternativeForm;
  alternativeGroup?: ZoneQuestionForm;
  zoneNumber: number;
  alternativeGroupNumber: number;
  alternativeNumber?: number;
}) => void;

/**
 * Handler for deleting a question or alternative from the assessment.
 */
export type HandleDeleteQuestion = (
  zoneNumber: number,
  alternativeGroupNumber: number,
  questionId: string,
  numberInAlternativeGroup?: number,
) => void;

/**
 * All possible actions that can modify the editor state.
 * UNDO and REDO are stubbed for a future PR.
 */
export type EditorAction =
  | {
      type: 'ADD_QUESTION';
      zoneIndex: number;
      question: ZoneQuestionForm;
      questionData?: StaffAssessmentQuestionRow;
    }
  | {
      type: 'UPDATE_QUESTION';
      zoneIndex: number;
      questionIndex: number;
      question: Partial<ZoneQuestionForm> | Partial<QuestionAlternativeForm>;
      alternativeIndex?: number;
    }
  | {
      type: 'DELETE_QUESTION';
      zoneIndex: number;
      questionIndex: number;
      questionId: string;
      alternativeIndex?: number;
    }
  | {
      type: 'REORDER_QUESTION';
      fromZoneIndex: number;
      fromQuestionIndex: number;
      toZoneIndex: number;
      toQuestionIndex: number;
    }
  | {
      type: 'ADD_ZONE';
      zone: ZoneAssessmentForm;
    }
  | {
      type: 'UPDATE_ZONE';
      zoneIndex: number;
      zone: Partial<ZoneAssessmentForm>;
    }
  | {
      type: 'DELETE_ZONE';
      zoneIndex: number;
    }
  | {
      type: 'UPDATE_QUESTION_MAP';
      questionId: string;
      questionData: StaffAssessmentQuestionRow;
    }
  // Stubbed for future PR - will implement history tracking
  | { type: 'UNDO' }
  | { type: 'REDO' };
