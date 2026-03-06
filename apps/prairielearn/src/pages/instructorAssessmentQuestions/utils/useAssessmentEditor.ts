import { useReducer, useState } from 'react';

import type {
  EditorAction,
  EditorState,
  QuestionAlternativeForm,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../types.js';

import { alternativeToQuestionBlock, questionBlockToAlternative } from './dataTransform.js';

/**
 * Finds a zone by its trackingId.
 * Returns the zone and its index, or null if not found.
 */
function findZoneByTrackingId(
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
 * Finds an alternative by its trackingId across all zones and question blocks.
 */
function findAlternativeAcrossZones(
  zones: ZoneAssessmentForm[],
  alternativeTrackingId: string,
): {
  alternative: QuestionAlternativeForm;
  alternativeIndex: number;
  question: ZoneQuestionBlockForm;
  questionIndex: number;
  zone: ZoneAssessmentForm;
  zoneIndex: number;
} | null {
  for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex++) {
    const zone = zones[zoneIndex];
    for (let questionIndex = 0; questionIndex < zone.questions.length; questionIndex++) {
      const question = zone.questions[questionIndex];
      if (!question.alternatives) continue;
      const alternativeIndex = question.alternatives.findIndex(
        (a) => a.trackingId === alternativeTrackingId,
      );
      if (alternativeIndex !== -1) {
        return {
          alternative: question.alternatives[alternativeIndex],
          alternativeIndex,
          question,
          questionIndex,
          zone,
          zoneIndex,
        };
      }
    }
  }
  return null;
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

          // Clean up metadata for all alternatives in the group
          const { alternatives } = questionResult.question;
          if (alternatives) {
            for (const alt of alternatives) {
              if (alt.id) delete newQuestionMetadata[alt.id];
            }
          }
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

        // Remove metadata for all deleted questions and alternatives
        const newQuestionMetadata = { ...state.questionMetadata };
        for (const question of zoneResult.zone.questions) {
          if (question.id) delete newQuestionMetadata[question.id];
          if (question.alternatives) {
            for (const alt of question.alternatives) {
              if (alt.id) delete newQuestionMetadata[alt.id];
            }
          }
        }

        newZones.splice(zoneResult.index, 1);

        return {
          ...state,
          zones: newZones,
          questionMetadata: newQuestionMetadata,
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
        const { questionId, oldQuestionId, questionData } = action;
        const newQuestionMetadata = { ...state.questionMetadata };
        // When a question's QID changes (e.g., via the picker), remove the
        // metadata entry keyed by the old QID so it doesn't linger as stale.
        if (oldQuestionId && oldQuestionId !== questionId) {
          delete newQuestionMetadata[oldQuestionId];
        }
        newQuestionMetadata[questionId] = questionData;
        return {
          ...state,
          questionMetadata: newQuestionMetadata,
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

      case 'EXPAND_ALL_GROUPS': {
        return {
          ...state,
          collapsedGroups: new Set<string>(),
        };
      }

      case 'COLLAPSE_ALL_GROUPS': {
        const groupTrackingIds = state.zones.flatMap((z) =>
          z.questions.filter((q) => (q.alternatives?.length ?? 0) > 0).map((q) => q.trackingId),
        );
        return {
          ...state,
          collapsedGroups: new Set<string>(groupTrackingIds),
        };
      }

      case 'ADD_ALTERNATIVE': {
        const { altGroupTrackingId, alternative, questionData } = action;
        const newZones = structuredClone(state.zones);

        const groupResult = findQuestionByTrackingId(newZones, altGroupTrackingId);
        if (!groupResult) {
          throw new Error(
            `ADD_ALTERNATIVE: Alt group with trackingId ${altGroupTrackingId} not found`,
          );
        }

        if (!groupResult.question.alternatives) {
          groupResult.question.alternatives = [];
        }
        groupResult.question.alternatives.push(alternative);

        const newQuestionMetadata =
          questionData && alternative.id
            ? { ...state.questionMetadata, [alternative.id]: questionData }
            : state.questionMetadata;

        return {
          ...state,
          zones: newZones,
          questionMetadata: newQuestionMetadata,
        };
      }

      case 'REORDER_ALTERNATIVE': {
        const { alternativeTrackingId, toAltGroupTrackingId, beforeAlternativeTrackingId } = action;
        const newZones = structuredClone(state.zones);

        // Find the alternative being moved
        const fromResult = findAlternativeAcrossZones(newZones, alternativeTrackingId);
        if (!fromResult) {
          throw new Error(
            `REORDER_ALTERNATIVE: Alternative with trackingId ${alternativeTrackingId} not found`,
          );
        }

        // Find the destination alt group
        const toGroupResult = findQuestionByTrackingId(newZones, toAltGroupTrackingId);
        if (!toGroupResult) {
          throw new Error(
            `REORDER_ALTERNATIVE: Alt group with trackingId ${toAltGroupTrackingId} not found`,
          );
        }

        if (!toGroupResult.question.alternatives) {
          toGroupResult.question.alternatives = [];
        }

        // Remove alternative from source
        const [movedAlt] = fromResult.question.alternatives!.splice(fromResult.alternativeIndex, 1);

        // Find insertion point
        let insertIndex: number;
        if (beforeAlternativeTrackingId === null) {
          insertIndex = toGroupResult.question.alternatives.length;
        } else {
          const beforeIdx = toGroupResult.question.alternatives.findIndex(
            (a) => a.trackingId === beforeAlternativeTrackingId,
          );
          insertIndex = beforeIdx === -1 ? toGroupResult.question.alternatives.length : beforeIdx;
        }

        toGroupResult.question.alternatives.splice(insertIndex, 0, movedAlt);

        return {
          ...state,
          zones: newZones,
        };
      }

      case 'EXTRACT_ALTERNATIVE_TO_QUESTION': {
        const { alternativeTrackingId, toZoneTrackingId, beforeQuestionTrackingId } = action;
        const newZones = structuredClone(state.zones);

        // Find the alternative being extracted
        const fromResult = findAlternativeAcrossZones(newZones, alternativeTrackingId);
        if (!fromResult) {
          throw new Error(
            `EXTRACT_ALTERNATIVE_TO_QUESTION: Alternative with trackingId ${alternativeTrackingId} not found`,
          );
        }

        // Find the destination zone
        const toZoneResult = findZoneByTrackingId(newZones, toZoneTrackingId);
        if (!toZoneResult) {
          throw new Error(
            `EXTRACT_ALTERNATIVE_TO_QUESTION: Zone with trackingId ${toZoneTrackingId} not found`,
          );
        }

        // Remove alternative from source group
        const [removedAlt] = fromResult.question.alternatives!.splice(
          fromResult.alternativeIndex,
          1,
        );

        // Convert to standalone question block, resolving inherited values
        const newQuestion = alternativeToQuestionBlock(removedAlt, fromResult.question);

        // Find insertion point (uses trackingIds, so unaffected by shrinkage)
        let insertIndex: number;
        if (beforeQuestionTrackingId === null) {
          insertIndex = toZoneResult.zone.questions.length;
        } else {
          const beforeResult = findQuestionByTrackingId(newZones, beforeQuestionTrackingId);
          if (beforeResult?.zone.trackingId !== toZoneTrackingId) {
            insertIndex = toZoneResult.zone.questions.length;
          } else {
            insertIndex = beforeResult.questionIndex;
          }
        }

        toZoneResult.zone.questions.splice(insertIndex, 0, newQuestion);

        return {
          ...state,
          zones: newZones,
        };
      }

      case 'MERGE_QUESTION_INTO_ALT_GROUP': {
        const { questionTrackingId, toAltGroupTrackingId, beforeAlternativeTrackingId } = action;
        const newZones = structuredClone(state.zones);

        // Find the standalone question being merged
        const fromResult = findQuestionByTrackingId(newZones, questionTrackingId);
        if (!fromResult) {
          throw new Error(
            `MERGE_QUESTION_INTO_ALT_GROUP: Question with trackingId ${questionTrackingId} not found`,
          );
        }

        // Find the destination alt group
        const toGroupResult = findQuestionByTrackingId(newZones, toAltGroupTrackingId);
        if (!toGroupResult) {
          throw new Error(
            `MERGE_QUESTION_INTO_ALT_GROUP: Alt group with trackingId ${toAltGroupTrackingId} not found`,
          );
        }

        if (!toGroupResult.question.alternatives) {
          toGroupResult.question.alternatives = [];
        }

        // Remove question from source zone
        const [removedQuestion] = fromResult.zone.questions.splice(fromResult.questionIndex, 1);

        // Convert to alternative
        const newAlt = questionBlockToAlternative(removedQuestion);

        // Find insertion point
        let insertIndex: number;
        if (beforeAlternativeTrackingId === null) {
          insertIndex = toGroupResult.question.alternatives.length;
        } else {
          const beforeIdx = toGroupResult.question.alternatives.findIndex(
            (a) => a.trackingId === beforeAlternativeTrackingId,
          );
          insertIndex = beforeIdx === -1 ? toGroupResult.question.alternatives.length : beforeIdx;
        }

        toGroupResult.question.alternatives.splice(insertIndex, 0, newAlt);

        return {
          ...state,
          zones: newZones,
        };
      }

      case 'REMOVE_QUESTION_BY_QID': {
        const { qid } = action;
        const newZones = structuredClone(state.zones);
        const newQuestionMetadata = { ...state.questionMetadata };

        for (const zone of newZones) {
          for (let qi = 0; qi < zone.questions.length; qi++) {
            const q = zone.questions[qi];
            if (q.id === qid) {
              // Remove standalone question
              if (q.alternatives) {
                for (const alt of q.alternatives) {
                  if (alt.id) delete newQuestionMetadata[alt.id];
                }
              }
              delete newQuestionMetadata[qid];
              zone.questions.splice(qi, 1);
              return { ...state, zones: newZones, questionMetadata: newQuestionMetadata };
            }
            for (let ai = 0; ai < (q.alternatives ?? []).length; ai++) {
              if (q.alternatives![ai].id === qid) {
                delete newQuestionMetadata[qid];
                q.alternatives!.splice(ai, 1);
                return { ...state, zones: newZones, questionMetadata: newQuestionMetadata };
              }
            }
          }
        }
        // QID not found — no-op
        return state;
      }

      case 'RESET': {
        return initialState;
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
  const [reducer] = useState(() => createEditorReducer(initialState));
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
