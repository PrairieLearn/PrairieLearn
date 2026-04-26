import type { Dispatch } from 'react';

import type { EditorQuestionMetadata } from '../../lib/assessment-question.shared.js';
import type {
  Assessment,
  AssessmentSet,
  EnumAssessmentType,
  Question,
  Tag,
  Topic,
} from '../../lib/db-types.js';
import type {
  EnumAssessmentTool,
  QuestionAlternativeJsonInput,
  ZoneAssessmentJsonInput,
  ZoneQuestionBlockJsonInput,
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
export type TrackingId = string & { __brand: 'TrackingId' };

/**
 * Form version of QuestionAlternativeJson - adds trackingId for stable drag-and-drop identity.
 */
export type QuestionAlternativeForm = QuestionAlternativeJsonInput & {
  trackingId: TrackingId;
};

/**
 * Shared fields across both question block variants.
 * Excludes the discriminating `id` and `alternatives` properties.
 */
type ZoneQuestionBlockFormBase = Omit<ZoneQuestionBlockJsonInput, 'id' | 'alternatives'> & {
  trackingId: TrackingId;
  /** Transient flag: set when legacy `points` were pushed to alternatives due to mixed grading methods. Not serialized. */
  pointsDistributedInfoBanner?: boolean;
};

/**
 * A standalone question block — has a QID, no alternatives.
 */
export type StandaloneQuestionBlockForm = ZoneQuestionBlockFormBase & {
  id: string;
  alternatives?: undefined;
};

/**
 * An alternative pool — has alternatives, no direct QID.
 */
export type AltPoolBlockForm = ZoneQuestionBlockFormBase & {
  id?: undefined;
  alternatives: QuestionAlternativeForm[];
};

/**
 * A question block is either a standalone question or an alternative pool.
 * Discriminate via `q.alternatives != null` (alt pool) or `q.id != null` (single question).
 */
export type ZoneQuestionBlockForm = StandaloneQuestionBlockForm | AltPoolBlockForm;

/**
 * A question (standalone or alternative) that is known to have a QID.
 * Used by components that only render individual questions, never alt pools.
 */
export type QuestionWithId = StandaloneQuestionBlockForm | QuestionAlternativeForm;

/**
 * Asserts that a question block is a standalone question (not an alternative pool).
 */
export function assertStandaloneQuestion(
  q: ZoneQuestionBlockForm,
): asserts q is StandaloneQuestionBlockForm {
  if (!q.id) throw new Error('Expected a standalone question block, not an alternative pool');
}

/**
 * Form version of ZoneAssessmentJson - adds trackingId, updates questions type.
 */
export type ZoneAssessmentForm = Omit<ZoneAssessmentJsonInput, 'questions'> & {
  trackingId: TrackingId;
  questions: ZoneQuestionBlockForm[];
};

/**
 * Assessment data for the question picker, including fields needed for grouping.
 */
export interface AssessmentForPicker {
  assessment_id: Assessment['id'];
  label: string;
  color: AssessmentSet['color'];
  assessment_set_abbreviation?: AssessmentSet['abbreviation'];
  assessment_set_name?: AssessmentSet['name'];
  assessment_set_color?: AssessmentSet['color'];
  assessment_number?: Assessment['number'];
}

/**
 * Simplified question data for the question picker modal.
 * Only includes fields needed for display and selection.
 */
export interface CourseQuestionForPicker {
  id: Question['id'];
  qid: string;
  title: Question['title'];
  grading_method: Question['grading_method'];
  topic: Pick<Topic, 'id' | 'name' | 'color'>;
  tags: Pick<Tag, 'id' | 'name' | 'color'>[] | null;
  assessments: AssessmentForPicker[] | null;
}

/**
 * The core editor state containing zones and question metadata.
 * Uses form types with trackingId for stable drag-and-drop identity.
 */
export interface EditorState {
  zones: ZoneAssessmentForm[];
  questionMetadata: Partial<Record<string, EditorQuestionMetadata>>;
  /** Tracks which alternative pools are collapsed by their trackingId */
  collapsedPools: Set<string>;
  /** Tracks which zones are collapsed by their trackingId */
  collapsedZones: Set<string>;
  /** Tracks which points-distributed info banners have been dismissed by trackingId */
  dismissedBanners: Set<string>;
  /** The currently selected item in the split-pane editor */
  selectedItem: SelectedItem;
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
      question: StandaloneQuestionBlockForm;
      questionData: EditorQuestionMetadata;
    }
  | {
      type: 'ADD_QUESTION';
      zoneTrackingId: string;
      question: AltPoolBlockForm;
      questionData?: undefined;
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
      /** Only set when deleting an alternative from an alternative pool */
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
      questionData: EditorQuestionMetadata;
    }
  | {
      type: 'TOGGLE_POOL_COLLAPSE';
      trackingId: string;
    }
  | {
      type: 'TOGGLE_ZONE_COLLAPSE';
      trackingId: string;
    }
  | { type: 'EXPAND_ALL_POOLS' }
  | { type: 'COLLAPSE_ALL_POOLS' }
  | { type: 'DISMISS_BANNER'; trackingId: string }
  | { type: 'RESET' }
  | {
      type: 'ADD_ALTERNATIVE';
      altPoolTrackingId: string;
      alternative: QuestionAlternativeForm;
      questionData?: EditorQuestionMetadata;
    }
  | {
      type: 'REORDER_ALTERNATIVE';
      alternativeTrackingId: string;
      toAltPoolTrackingId: string;
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
      type: 'MERGE_QUESTION_INTO_ALT_POOL';
      questionTrackingId: string;
      toAltPoolTrackingId: string;
      /** trackingId of the alternative to insert before, or null to append at end */
      beforeAlternativeTrackingId: string | null;
    }
  | { type: 'REMOVE_QUESTION_BY_QID'; qid: string }
  | { type: 'SET_SELECTED_ITEM'; selectedItem: SelectedItem }
  | {
      /**
       * Compound action dispatched after fetching question data in the picker.
       * The reducer reads the latest zones and selectedItem to atomically
       * apply all mutations (remove duplicates, update metadata, add/change
       * the question, update selection).
       */
      type: 'QUESTION_PICKED';
      qid: string;
      metadata: EditorQuestionMetadata;
      /** The selectedItem at the time the pick was initiated; used to detect stale picks. */
      expectedSelectedItem: SelectedItem;
    }
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
  | { type: 'altPool'; questionTrackingId: string }
  | { type: 'picker'; zoneTrackingId: string; returnToSelection?: SelectedItem }
  | { type: 'altPoolPicker'; zoneTrackingId: string; altPoolTrackingId?: string }
  | null;

export type ViewType = 'simple' | 'detailed';

/**
 * Describes the parent values from which advanced fields can be inherited.
 */
export type InheritanceSource = 'zone' | 'pool' | 'assessment';

/**
 * Bundles all callbacks passed through the assessment tree hierarchy.
 */
export interface TreeActions {
  onAddQuestion: (zoneTrackingId: string) => void;
  onAddAltPool: (zoneTrackingId: string) => void;
  onAddToAltPool: (altPoolTrackingId: string) => void;
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
  questionMetadata: Partial<Record<string, EditorQuestionMetadata>>;
  collapsedPools: Set<string>;
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
  hasCourseInstancePermissionEdit: boolean;
  assessmentType: EnumAssessmentType;
  constantQuestionValue: boolean;
  assessmentDefaults: AssessmentAdvancedDefaults;
  assessmentToolDefaults: Partial<Record<EnumAssessmentTool, boolean>>;
  courseInstanceId: string;
  courseId: string;
  hasCoursePermissionPreview: boolean;
  dismissedBanners: Set<string>;
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
  onAddToAltPool: (altPoolTrackingId: string) => void;
  onQuestionPicked: (qid: string) => void;
  onPickQuestion: (currentSelection: SelectedItem) => void;
  onRemoveQuestionByQid: (qid: string) => void;
  onResetButtonClick: (assessmentQuestionId: string) => void;
  onFormValidChange: (isValid: boolean) => void;
  onDismissBanner: (trackingId: string) => void;
}
