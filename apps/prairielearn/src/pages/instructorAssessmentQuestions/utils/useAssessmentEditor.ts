import { useMemo, useReducer } from 'react';

import type {
  QuestionAlternativeForm,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../instructorAssessmentQuestions.shared.js';
import type { EditorAction, EditorState } from '../types.js';

export {
  addTrackingIds,
  createQuestionWithTrackingId,
  createZoneWithTrackingId,
  stripTrackingIds,
} from './dataTransform.js';

/**
 * Calculates the `beforeId` for reordering within a flat list.
 * Used for both zone and question reordering to determine insertion point.
 *
 * @param items - The list of items with trackingId
 * @param fromIndex - Current index of the item being moved
 * @param toIndex - Target index the item is being moved to
 * @returns trackingId of item to insert before, or null to append at end
 */
export function getInsertBeforeId<T extends { trackingId: string }>(
  items: T[],
  fromIndex: number,
  toIndex: number,
): string | null {
  const isDraggingDown = fromIndex < toIndex;
  if (isDraggingDown) {
    // When dragging down, insert after the target (use next item's trackingId or null)
    return items[toIndex + 1]?.trackingId ?? null;
  }
  // When dragging up, insert before the target
  return items[toIndex].trackingId;
}

/**
 * Finds a zone by its trackingId.
 * Returns the zone and its index, or null if not found.
 */
export function findZoneByTrackingId(
  zones: ZoneAssessmentForm[],
  trackingId: string,
): { zone: ZoneAssessmentForm; index: number } | null {
  const index = zones.findIndex((z) => z.trackingId === trackingId);
  if (index === -1) return null;
  return { zone: zones[index], index };
}

/**
 * Finds a question by its trackingId across all zones.
 * Returns the question, zone, and their indices, or null if not found.
 */
export function findQuestionByTrackingId(
  zones: ZoneAssessmentForm[],
  trackingId: string,
): {
  question: ZoneQuestionBlockForm;
  questionIndex: number;
  zone: ZoneAssessmentForm;
  zoneIndex: number;
} | null {
  for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex++) {
    const zone = zones[zoneIndex];
    const questionIndex = zone.questions.findIndex((q) => q.trackingId === trackingId);
    if (questionIndex !== -1) {
      return { question: zone.questions[questionIndex], questionIndex, zone, zoneIndex };
    }
  }
  return null;
}

/**
 * Finds an alternative by its trackingId within a question.
 * Returns the alternative and its index, or null if not found.
 */
function findAlternativeByTrackingId(
  question: ZoneQuestionBlockForm,
  trackingId: string,
): { alternative: QuestionAlternativeForm; index: number } | null {
  if (!question.alternatives) return null;
  const index = question.alternatives.findIndex((a) => a.trackingId === trackingId);
  if (index === -1) return null;
  return { alternative: question.alternatives[index], index };
}

/**
 * Creates a reducer for managing assessment editor state.
 * The initialState is captured in closure for the RESET action.
 * All operations use trackingIds for stable identity instead of position indices.
 */
function createEditorReducer(initialState: EditorState) {
  return function editorReducer(state: EditorState, action: EditorAction): EditorState {
    switch (action.type) {
      case 'ADD_QUESTION': {
        const { zoneTrackingId, question, questionData } = action;
        const newZones = structuredClone(state.zones);

        const zoneResult = findZoneByTrackingId(newZones, zoneTrackingId);
        if (!zoneResult) {
          throw new Error(`ADD_QUESTION: Zone with trackingId ${zoneTrackingId} not found`);
        }

        zoneResult.zone.questions.push(question);

        const newQuestionMetadata = questionData
          ? { ...state.questionMetadata, [question.id!]: questionData }
          : state.questionMetadata;

        return {
          ...state,
          zones: newZones,
          questionMetadata: newQuestionMetadata,
        };
      }

      case 'UPDATE_QUESTION': {
        const { questionTrackingId, question, alternativeTrackingId } = action;
        const newZones = structuredClone(state.zones);

        const questionResult = findQuestionByTrackingId(newZones, questionTrackingId);
        if (!questionResult) {
          throw new Error(
            `UPDATE_QUESTION: Question with trackingId ${questionTrackingId} not found`,
          );
        }

        if (alternativeTrackingId !== undefined) {
          // Updating an alternative within an alternative group
          const altResult = findAlternativeByTrackingId(
            questionResult.question,
            alternativeTrackingId,
          );
          if (!altResult) {
            throw new Error(
              `UPDATE_QUESTION: Alternative with trackingId ${alternativeTrackingId} not found in question ${questionTrackingId}`,
            );
          }
          questionResult.question.alternatives![altResult.index] = {
            ...altResult.alternative,
            ...question,
          };
        } else {
          // Updating a regular question or alternative group itself
          questionResult.zone.questions[questionResult.questionIndex] = {
            ...questionResult.question,
            ...question,
          };
        }

        return {
          ...state,
          zones: newZones,
        };
      }

      case 'DELETE_QUESTION': {
        const { questionTrackingId, questionId, alternativeTrackingId } = action;
        const newZones = structuredClone(state.zones);

        const questionResult = findQuestionByTrackingId(newZones, questionTrackingId);
        if (!questionResult) {
          throw new Error(
            `DELETE_QUESTION: Question with trackingId ${questionTrackingId} not found`,
          );
        }

        const newQuestionMetadata = { ...state.questionMetadata };
        // Remove from question metadata
        delete newQuestionMetadata[questionId];

        if (alternativeTrackingId !== undefined) {
          // Deleting an alternative from an alternative group
          const altResult = findAlternativeByTrackingId(
            questionResult.question,
            alternativeTrackingId,
          );
          if (!altResult) {
            throw new Error(
              `DELETE_QUESTION: Alternative with trackingId ${alternativeTrackingId} not found in question ${questionTrackingId}`,
            );
          }

          questionResult.question.alternatives!.splice(altResult.index, 1);
        } else {
          // Deleting a regular question or entire alternative group
          questionResult.zone.questions.splice(questionResult.questionIndex, 1);
        }

        return {
          ...state,
          zones: newZones,
          questionMetadata: newQuestionMetadata,
        };
      }

      case 'REORDER_QUESTION': {
        const { questionTrackingId, toZoneTrackingId, beforeQuestionTrackingId } = action;
        const newZones = structuredClone(state.zones);

        // Find the question being moved
        const fromResult = findQuestionByTrackingId(newZones, questionTrackingId);
        if (!fromResult) {
          throw new Error(
            `REORDER_QUESTION: Question with trackingId ${questionTrackingId} not found`,
          );
        }

        // Find the destination zone
        const toZoneResult = findZoneByTrackingId(newZones, toZoneTrackingId);
        if (!toZoneResult) {
          throw new Error(`REORDER_QUESTION: Zone with trackingId ${toZoneTrackingId} not found`);
        }

        // Remove question from source
        const [movedQuestion] = fromResult.zone.questions.splice(fromResult.questionIndex, 1);

        // Find insertion point
        let insertIndex: number;
        if (beforeQuestionTrackingId === null) {
          // Append at end
          insertIndex = toZoneResult.zone.questions.length;
        } else {
          // Insert before the specified question
          const beforeResult = findQuestionByTrackingId(newZones, beforeQuestionTrackingId);
          if (beforeResult?.zone.trackingId !== toZoneTrackingId) {
            // If not found or in wrong zone, append at end
            insertIndex = toZoneResult.zone.questions.length;
          } else {
            insertIndex = beforeResult.questionIndex;
          }
        }

        toZoneResult.zone.questions.splice(insertIndex, 0, movedQuestion);

        return {
          ...state,
          zones: newZones,
        };
      }

      case 'ADD_ZONE': {
        const { zone } = action;
        return {
          ...state,
          zones: [...state.zones, zone],
        };
      }

      case 'UPDATE_ZONE': {
        const { zoneTrackingId, zone } = action;
        const newZones = structuredClone(state.zones);

        const zoneResult = findZoneByTrackingId(newZones, zoneTrackingId);
        if (!zoneResult) {
          throw new Error(`UPDATE_ZONE: Zone with trackingId ${zoneTrackingId} not found`);
        }

        newZones[zoneResult.index] = {
          ...zoneResult.zone,
          ...zone,
        };

        return {
          ...state,
          zones: newZones,
        };
      }

      case 'DELETE_ZONE': {
        const { zoneTrackingId } = action;
        const newZones = structuredClone(state.zones);

        const zoneResult = findZoneByTrackingId(newZones, zoneTrackingId);
        if (!zoneResult) {
          throw new Error(`DELETE_ZONE: Zone with trackingId ${zoneTrackingId} not found`);
        }

        newZones.splice(zoneResult.index, 1);

        return {
          ...state,
          zones: newZones,
        };
      }

      case 'REORDER_ZONE': {
        const { zoneTrackingId, beforeZoneTrackingId } = action;
        const newZones = structuredClone(state.zones);

        // Find the zone being moved
        const fromResult = findZoneByTrackingId(newZones, zoneTrackingId);
        if (!fromResult) {
          throw new Error(`REORDER_ZONE: Zone with trackingId ${zoneTrackingId} not found`);
        }

        // Remove zone from current position
        const [movedZone] = newZones.splice(fromResult.index, 1);

        // Find insertion point
        let insertIndex: number;
        if (beforeZoneTrackingId === null) {
          // Append at end
          insertIndex = newZones.length;
        } else {
          // Insert before the specified zone
          const beforeResult = findZoneByTrackingId(newZones, beforeZoneTrackingId);
          if (!beforeResult) {
            // If not found, append at end
            insertIndex = newZones.length;
          } else {
            insertIndex = beforeResult.index;
          }
        }

        newZones.splice(insertIndex, 0, movedZone);

        return {
          ...state,
          zones: newZones,
        };
      }

      case 'UPDATE_QUESTION_METADATA': {
        const { questionId, questionData } = action;
        return {
          ...state,
          questionMetadata: {
            ...state.questionMetadata,
            [questionId]: questionData,
          },
        };
      }

      case 'TOGGLE_GROUP_COLLAPSE': {
        const { trackingId } = action;
        const newCollapsedGroups = new Set(state.collapsedGroups);
        if (newCollapsedGroups.has(trackingId)) {
          newCollapsedGroups.delete(trackingId);
        } else {
          newCollapsedGroups.add(trackingId);
        }
        return {
          ...state,
          collapsedGroups: newCollapsedGroups,
        };
      }

      case 'TOGGLE_ZONE_COLLAPSE': {
        const { trackingId } = action;
        const newCollapsedZones = new Set(state.collapsedZones);
        if (newCollapsedZones.has(trackingId)) {
          newCollapsedZones.delete(trackingId);
        } else {
          newCollapsedZones.add(trackingId);
        }
        return {
          ...state,
          collapsedZones: newCollapsedZones,
        };
      }

      case 'EXPAND_ALL': {
        return {
          ...state,
          collapsedGroups: new Set<string>(),
          collapsedZones: new Set<string>(),
        };
      }

      case 'COLLAPSE_ALL': {
        const zoneTrackingIds = state.zones.map((z) => z.trackingId);
        const groupTrackingIds = state.zones.flatMap((z) =>
          z.questions.filter((q) => (q.alternatives?.length ?? 0) > 1).map((q) => q.trackingId),
        );
        return {
          ...state,
          collapsedZones: new Set<string>(zoneTrackingIds),
          collapsedGroups: new Set<string>(groupTrackingIds),
        };
      }

      case 'RESET': {
        return initialState;
      }

      case 'ADD_ALTERNATIVE_GROUP': {
        const { zoneTrackingId, group } = action;
        const newZones = structuredClone(state.zones);

        const zoneResult = findZoneByTrackingId(newZones, zoneTrackingId);
        if (!zoneResult) {
          throw new Error(
            `ADD_ALTERNATIVE_GROUP: Zone with trackingId ${zoneTrackingId} not found`,
          );
        }

        zoneResult.zone.questions.push(group);

        return {
          ...state,
          zones: newZones,
        };
      }

      case 'ADD_TO_ALTERNATIVE_GROUP': {
        const { questionTrackingId, targetGroupTrackingId } = action;
        const newZones = structuredClone(state.zones);

        // Find source question (must be a single question, not a group)
        const sourceResult = findQuestionByTrackingId(newZones, questionTrackingId);
        if (!sourceResult) {
          throw new Error(
            `ADD_TO_ALTERNATIVE_GROUP: Source question with trackingId ${questionTrackingId} not found`,
          );
        }
        if (sourceResult.question.alternatives) {
          throw new Error(
            'ADD_TO_ALTERNATIVE_GROUP: Source must be a single question, not a group',
          );
        }

        // Find target group
        const targetResult = findQuestionByTrackingId(newZones, targetGroupTrackingId);
        if (!targetResult) {
          throw new Error(
            `ADD_TO_ALTERNATIVE_GROUP: Target group with trackingId ${targetGroupTrackingId} not found`,
          );
        }
        if (!targetResult.question.alternatives) {
          throw new Error('ADD_TO_ALTERNATIVE_GROUP: Target must be an alternative group');
        }

        // Remove from source zone
        sourceResult.zone.questions.splice(sourceResult.questionIndex, 1);

        // Convert to alternative and add to target group
        const { trackingId, id, points, autoPoints, maxPoints, maxAutoPoints, manualPoints } =
          sourceResult.question;
        const newAlternative: QuestionAlternativeForm = {
          id: id!,
          trackingId,
          points,
          autoPoints,
          maxPoints,
          maxAutoPoints,
          manualPoints,
        };
        targetResult.question.alternatives.push(newAlternative);

        return {
          ...state,
          zones: newZones,
        };
      }

      case 'EXTRACT_FROM_ALTERNATIVE_GROUP': {
        const {
          groupTrackingId,
          alternativeTrackingId,
          toZoneTrackingId,
          beforeQuestionTrackingId,
        } = action;
        const newZones = structuredClone(state.zones);

        // Find group and alternative
        const groupResult = findQuestionByTrackingId(newZones, groupTrackingId);
        if (!groupResult?.question.alternatives) {
          throw new Error(
            `EXTRACT_FROM_ALTERNATIVE_GROUP: Group with trackingId ${groupTrackingId} not found`,
          );
        }

        const altIndex = groupResult.question.alternatives.findIndex(
          (a) => a.trackingId === alternativeTrackingId,
        );
        if (altIndex === -1) {
          throw new Error(
            `EXTRACT_FROM_ALTERNATIVE_GROUP: Alternative with trackingId ${alternativeTrackingId} not found`,
          );
        }

        // Remove from group
        const [removed] = groupResult.question.alternatives.splice(altIndex, 1);

        // Convert to standalone question
        const newQuestion: ZoneQuestionBlockForm = {
          id: removed.id,
          trackingId: removed.trackingId,
          points: removed.points,
          autoPoints: removed.autoPoints,
          maxPoints: removed.maxPoints,
          maxAutoPoints: removed.maxAutoPoints,
          manualPoints: removed.manualPoints,
          canSubmit: [],
          canView: [],
        };

        // Find target zone
        const targetZone = findZoneByTrackingId(newZones, toZoneTrackingId);
        if (!targetZone) {
          throw new Error(
            `EXTRACT_FROM_ALTERNATIVE_GROUP: Zone with trackingId ${toZoneTrackingId} not found`,
          );
        }

        // Find insertion point - insert AFTER the hovered question for intuitive UX
        let insertIndex = targetZone.zone.questions.length;
        if (beforeQuestionTrackingId) {
          const beforeResult = findQuestionByTrackingId(newZones, beforeQuestionTrackingId);
          if (beforeResult?.zone.trackingId === toZoneTrackingId) {
            // Insert after the hovered item, not before
            insertIndex = beforeResult.questionIndex + 1;
          }
        }
        targetZone.zone.questions.splice(insertIndex, 0, newQuestion);

        return {
          ...state,
          zones: newZones,
        };
      }

      case 'UNDO':
      case 'REDO':
        // TODO: Implement in future PR with history tracking
        return state;

      default:
        return state;
    }
  };
}

/**
 * Custom hook for managing assessment editor state with useReducer.
 * Provides clean dispatch-based state updates and stubs for future undo/redo.
 */
export function useAssessmentEditor(initialState: EditorState) {
  // Memoize the reducer so it captures the initial state for RESET
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reducer = useMemo(() => createEditorReducer(initialState), []);
  const [state, dispatch] = useReducer(reducer, initialState);

  return {
    zones: state.zones,
    questionMetadata: state.questionMetadata,
    collapsedGroups: state.collapsedGroups,
    collapsedZones: state.collapsedZones,
    canUndo: false,
    canRedo: false,
    dispatch,
  };
}
