import type { StaffAssessmentQuestionRow } from '../../lib/assessment-question.js';
import type {
  QuestionAlternativeJson,
  ZoneAssessmentJson,
  ZoneQuestionJson,
} from '../../schemas/infoAssessment.js';

/**
 * The core editor state containing zones and question metadata.
 */
export interface EditorState {
  zones: ZoneAssessmentJson[];
  questionMap: Record<string, StaffAssessmentQuestionRow>;
}

/**
 * Handler for editing a question or alternative in the assessment editor.
 */
export type HandleEditQuestion = (params: {
  question: ZoneQuestionJson | QuestionAlternativeJson;
  alternativeGroup?: ZoneQuestionJson;
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
      question: ZoneQuestionJson;
      questionData?: StaffAssessmentQuestionRow;
    }
  | {
      type: 'UPDATE_QUESTION';
      zoneIndex: number;
      questionIndex: number;
      question: ZoneQuestionJson | QuestionAlternativeJson;
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
      zone: ZoneAssessmentJson;
    }
  | {
      type: 'UPDATE_ZONE';
      zoneIndex: number;
      zone: Partial<ZoneAssessmentJson>;
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
