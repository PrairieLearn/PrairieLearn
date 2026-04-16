import { useReducer, useState } from 'react';

import {
  type EditorAction,
  type EditorState,
  type QuestionAlternativeForm,
  type SelectedItem,
  type StandaloneQuestionBlockForm,
  type ZoneAssessmentForm,
  type ZoneQuestionBlockForm,
  assertStandaloneQuestion,
} from '../types.js';

import {
  alternativeToQuestionBlock,
  createAltPoolWithTrackingId,
  createAlternativeWithTrackingId,
  createQuestionWithTrackingId,
  getDefaultPointFieldsForNewQuestion,
  questionBlockToAlternative,
} from './dataTransform.js';
import { sanitizeSelectedItem, selectedItemsEqual } from './selectedItem.js';
import { findQuestionByTrackingId, isQidInAssessment } from './zoneLookup.js';

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
 * Removes a question/alternative with the given QID from the zones array.
 * Also cleans up the corresponding metadata entries.
 */
function removeQid(
  zones: ZoneAssessmentForm[],
  questionMetadata: EditorState['questionMetadata'],
  qid: string,
): void {
  for (const zone of zones) {
    for (let qi = 0; qi < zone.questions.length; qi++) {
      const q = zone.questions[qi];
      if (q.id === qid) {
        delete questionMetadata[qid];
        zone.questions.splice(qi, 1);
        return;
      }
      for (let ai = 0; ai < (q.alternatives ?? []).length; ai++) {
        if (q.alternatives![ai].id === qid) {
          delete questionMetadata[qid];
          q.alternatives!.splice(ai, 1);
          return;
        }
      }
    }
  }
}

/**
 * Handles the QUESTION_PICKED compound action.
 */
function handleQuestionPicked(
  state: EditorState,
  action: Extract<EditorAction, { type: 'QUESTION_PICKED' }>,
): EditorState {
  const { qid, metadata, expectedSelectedItem } = action;
  const gradingMethod = metadata.question.grading_method;

  // Bail if the selection changed during the async fetch — the user navigated
  // away, so this pick is stale.
  if (!selectedItemsEqual(state.selectedItem, expectedSelectedItem)) {
    return state;
  }

  const selectedItem = state.selectedItem;

  if (selectedItem?.type === 'altPoolPicker') {
    const newZones = structuredClone(state.zones);
    const newQuestionMetadata = { ...state.questionMetadata };
    let newSelectedItem: SelectedItem = selectedItem;

    // Remove from current location if already in assessment (move behavior)
    if (isQidInAssessment(newZones, qid)) {
      removeQid(newZones, newQuestionMetadata, qid);
    }

    if (selectedItem.altPoolTrackingId) {
      // Adding to existing alt pool
      const altPoolResult = findQuestionByTrackingId(newZones, selectedItem.altPoolTrackingId);
      if (!altPoolResult) return state;

      // Empty pools start neutral; seed point defaults from the first picked question.
      const shouldInitializeAltPoolPoints =
        altPoolResult.question.alternatives?.length === 0 &&
        altPoolResult.question.autoPoints == null &&
        altPoolResult.question.maxAutoPoints == null &&
        altPoolResult.question.manualPoints == null;

      if (shouldInitializeAltPoolPoints) {
        const pointFields = getDefaultPointFieldsForNewQuestion(gradingMethod);
        Object.assign(altPoolResult.question, pointFields);
      }

      if (!altPoolResult.question.alternatives) return state;

      const newAlt = { ...createAlternativeWithTrackingId(), id: qid } as QuestionAlternativeForm;
      altPoolResult.question.alternatives.push(newAlt);
      newQuestionMetadata[qid] = metadata;
    } else {
      // Creating new alt pool: first question picked creates the pool
      const newAltPool = {
        ...createAltPoolWithTrackingId(),
        ...getDefaultPointFieldsForNewQuestion(gradingMethod),
      };
      const firstAlt = { ...createAlternativeWithTrackingId(), id: qid } as QuestionAlternativeForm;
      newAltPool.alternatives = [firstAlt];

      const zoneResult = findZoneByTrackingId(newZones, selectedItem.zoneTrackingId);
      if (!zoneResult) return state;
      zoneResult.zone.questions.push(newAltPool);
      newQuestionMetadata[qid] = metadata;

      // Update selection so subsequent picks add to this pool
      newSelectedItem = {
        type: 'altPoolPicker',
        zoneTrackingId: selectedItem.zoneTrackingId,
        altPoolTrackingId: newAltPool.trackingId,
      };
    }

    return {
      ...state,
      zones: newZones,
      questionMetadata: newQuestionMetadata,
      selectedItem: newSelectedItem,
    };
  }

  if (selectedItem?.type === 'picker') {
    if (selectedItem.returnToSelection) {
      // Changing a question's QID via the picker
      const returnTo = selectedItem.returnToSelection;
      if (returnTo.type !== 'question' && returnTo.type !== 'alternative') return state;

      const newZones = structuredClone(state.zones);
      const newQuestionMetadata = { ...state.questionMetadata };

      const found = findQuestionByTrackingId(newZones, returnTo.questionTrackingId);
      if (!found) return state;

      // Remove from current location if already in assessment (move behavior),
      // but skip if the question being removed is the one we're about to update.
      if (isQidInAssessment(newZones, qid)) {
        const currentQid =
          returnTo.type === 'alternative'
            ? found.question.alternatives?.find(
                (a) => a.trackingId === returnTo.alternativeTrackingId,
              )?.id
            : found.question.id;
        if (currentQid !== qid) {
          removeQid(newZones, newQuestionMetadata, qid);
        }
      }

      // Re-find after potential removal (indices may have shifted)
      const updatedFound = findQuestionByTrackingId(newZones, returnTo.questionTrackingId);
      if (!updatedFound) return state;

      // Get old QID for metadata cleanup
      const oldId =
        returnTo.type === 'alternative'
          ? updatedFound.question.alternatives?.find(
              (a) => a.trackingId === returnTo.alternativeTrackingId,
            )?.id
          : updatedFound.question.id;

      // Update metadata
      if (oldId && oldId !== qid) {
        delete newQuestionMetadata[oldId];
      }
      newQuestionMetadata[qid] = metadata;

      // Update QID on the question/alternative
      if (returnTo.type === 'alternative') {
        const alt = updatedFound.question.alternatives?.find(
          (a) => a.trackingId === returnTo.alternativeTrackingId,
        );
        if (alt) {
          alt.id = qid;
          alt.preferences = undefined;
        }
      } else {
        updatedFound.zone.questions[updatedFound.questionIndex] = {
          ...updatedFound.question,
          id: qid,
          preferences: undefined,
        } as ZoneQuestionBlockForm;
      }

      return {
        ...state,
        zones: newZones,
        questionMetadata: newQuestionMetadata,
        selectedItem: returnTo,
      };
    }

    // Adding a new question to a zone
    const newZones = structuredClone(state.zones);
    const newQuestionMetadata = { ...state.questionMetadata };

    // Remove from current location if already in assessment (move behavior)
    if (isQidInAssessment(newZones, qid)) {
      removeQid(newZones, newQuestionMetadata, qid);
    }

    const zoneResult = findZoneByTrackingId(newZones, selectedItem.zoneTrackingId);
    if (!zoneResult) return state;

    const newQuestion: StandaloneQuestionBlockForm = {
      ...createQuestionWithTrackingId(),
      id: qid,
      ...getDefaultPointFieldsForNewQuestion(gradingMethod),
    };

    zoneResult.zone.questions.push(newQuestion);
    newQuestionMetadata[qid] = metadata;

    return {
      ...state,
      zones: newZones,
      questionMetadata: newQuestionMetadata,
    };
  }

  return state;
}

/**
 * Creates a reducer for managing assessment editor state.
 * The initialState is captured in closure for the RESET action.
 * All operations use trackingIds for stable identity instead of position indices.
 */
export function createEditorReducer(initialState: EditorState) {
  function coreReducer(state: EditorState, action: EditorAction): EditorState {
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
          ? { ...state.questionMetadata, [question.id]: questionData }
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
          // Updating an alternative within an alternative pool
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
          // Updating a regular question or alternative pool itself
          questionResult.zone.questions[questionResult.questionIndex] = {
            ...questionResult.question,
            ...question,
          } as ZoneQuestionBlockForm;
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
          // Deleting an alternative from an alternative pool
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
          // Deleting a regular question or entire alternative pool

          // Clean up metadata for all alternatives in the pool
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

      case 'TOGGLE_POOL_COLLAPSE': {
        const { trackingId } = action;
        const newCollapsedPools = new Set(state.collapsedPools);
        if (newCollapsedPools.has(trackingId)) {
          newCollapsedPools.delete(trackingId);
        } else {
          newCollapsedPools.add(trackingId);
        }
        return {
          ...state,
          collapsedPools: newCollapsedPools,
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

      case 'DISMISS_BANNER': {
        const newDismissedBanners = new Set(state.dismissedBanners);
        newDismissedBanners.add(action.trackingId);
        return {
          ...state,
          dismissedBanners: newDismissedBanners,
        };
      }

      case 'EXPAND_ALL_POOLS': {
        return {
          ...state,
          collapsedPools: new Set<string>(),
        };
      }

      case 'COLLAPSE_ALL_POOLS': {
        const poolTrackingIds = state.zones.flatMap((z) =>
          z.questions.filter((q) => (q.alternatives?.length ?? 0) > 0).map((q) => q.trackingId),
        );
        return {
          ...state,
          collapsedPools: new Set<string>(poolTrackingIds),
        };
      }

      case 'ADD_ALTERNATIVE': {
        const { altPoolTrackingId, alternative, questionData } = action;
        const newZones = structuredClone(state.zones);

        const poolResult = findQuestionByTrackingId(newZones, altPoolTrackingId);
        if (!poolResult?.question.alternatives) {
          throw new Error(
            `ADD_ALTERNATIVE: Alt pool with trackingId ${altPoolTrackingId} not found`,
          );
        }

        poolResult.question.alternatives.push(alternative);

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
        const { alternativeTrackingId, toAltPoolTrackingId, beforeAlternativeTrackingId } = action;
        const newZones = structuredClone(state.zones);

        // Find the alternative being moved
        const fromResult = findAlternativeAcrossZones(newZones, alternativeTrackingId);
        if (!fromResult) {
          throw new Error(
            `REORDER_ALTERNATIVE: Alternative with trackingId ${alternativeTrackingId} not found`,
          );
        }

        // Find the destination alt pool
        const toPoolResult = findQuestionByTrackingId(newZones, toAltPoolTrackingId);
        if (!toPoolResult?.question.alternatives) {
          throw new Error(
            `REORDER_ALTERNATIVE: Alt pool with trackingId ${toAltPoolTrackingId} not found`,
          );
        }

        // Remove alternative from source
        const [movedAlt] = fromResult.question.alternatives!.splice(fromResult.alternativeIndex, 1);

        // Find insertion point
        let insertIndex: number;
        if (beforeAlternativeTrackingId === null) {
          insertIndex = toPoolResult.question.alternatives.length;
        } else {
          const beforeIdx = toPoolResult.question.alternatives.findIndex(
            (a) => a.trackingId === beforeAlternativeTrackingId,
          );
          insertIndex = beforeIdx === -1 ? toPoolResult.question.alternatives.length : beforeIdx;
        }

        toPoolResult.question.alternatives.splice(insertIndex, 0, movedAlt);

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

        // Remove alternative from source pool
        const [removedAlt] = fromResult.question.alternatives!.splice(
          fromResult.alternativeIndex,
          1,
        );

        // Convert to standalone question block, inheriting any point fields
        // from the parent alt pool so the extracted question is valid.
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

      case 'MERGE_QUESTION_INTO_ALT_POOL': {
        const { questionTrackingId, toAltPoolTrackingId, beforeAlternativeTrackingId } = action;
        const newZones = structuredClone(state.zones);

        // Find the standalone question being merged
        const fromResult = findQuestionByTrackingId(newZones, questionTrackingId);
        if (!fromResult) {
          throw new Error(
            `MERGE_QUESTION_INTO_ALT_POOL: Question with trackingId ${questionTrackingId} not found`,
          );
        }

        // Find the destination alt pool
        const toPoolResult = findQuestionByTrackingId(newZones, toAltPoolTrackingId);
        if (!toPoolResult?.question.alternatives) {
          throw new Error(
            `MERGE_QUESTION_INTO_ALT_POOL: Alt pool with trackingId ${toAltPoolTrackingId} not found`,
          );
        }

        // Remove question from source zone
        const [removedQuestion] = fromResult.zone.questions.splice(fromResult.questionIndex, 1);
        assertStandaloneQuestion(removedQuestion);

        // Convert to alternative
        const newAlt = questionBlockToAlternative(removedQuestion);

        // Find insertion point
        let insertIndex: number;
        if (beforeAlternativeTrackingId === null) {
          insertIndex = toPoolResult.question.alternatives.length;
        } else {
          const beforeIdx = toPoolResult.question.alternatives.findIndex(
            (a) => a.trackingId === beforeAlternativeTrackingId,
          );
          insertIndex = beforeIdx === -1 ? toPoolResult.question.alternatives.length : beforeIdx;
        }

        toPoolResult.question.alternatives.splice(insertIndex, 0, newAlt);

        // If the merged question was selected, follow it to its new location
        // as an alternative. sanitizeSelectedItem can't handle this because a
        // question trackingId becoming an alternative trackingId is a type change.
        let mergeSelectedItem = state.selectedItem;
        if (
          state.selectedItem?.type === 'question' &&
          state.selectedItem.questionTrackingId === questionTrackingId
        ) {
          mergeSelectedItem = {
            type: 'alternative',
            questionTrackingId: toAltPoolTrackingId,
            alternativeTrackingId: questionTrackingId,
          };
        }

        return {
          ...state,
          zones: newZones,
          selectedItem: mergeSelectedItem,
        };
      }

      case 'REMOVE_QUESTION_BY_QID': {
        const { qid } = action;
        if (!isQidInAssessment(state.zones, qid)) return state;

        const newZones = structuredClone(state.zones);
        const newQuestionMetadata = { ...state.questionMetadata };
        removeQid(newZones, newQuestionMetadata, qid);
        return { ...state, zones: newZones, questionMetadata: newQuestionMetadata };
      }

      case 'SET_SELECTED_ITEM': {
        return {
          ...state,
          selectedItem: action.selectedItem,
        };
      }

      case 'QUESTION_PICKED': {
        return handleQuestionPicked(state, action);
      }

      case 'RESET': {
        // Resolve transient picker states to persisted selections so the
        // post-reducer sanitizer can validate against initialState.zones.
        const currentItem = state.selectedItem;
        let resolved: SelectedItem = null;
        if (currentItem?.type === 'picker') {
          resolved = currentItem.returnToSelection ?? null;
        } else if (currentItem?.type === 'altPoolPicker') {
          resolved = currentItem.altPoolTrackingId
            ? { type: 'altPool', questionTrackingId: currentItem.altPoolTrackingId }
            : null;
        } else {
          resolved = currentItem;
        }
        return { ...initialState, selectedItem: resolved };
      }

      case 'UNDO':
      case 'REDO':
        // TODO: Implement in future PR with history tracking
        return state;

      default:
        return state;
    }
  }

  // Wrap the core reducer with automatic selection sanitization.
  // When zones change, the current selection may point at a removed or
  // restructured item. sanitizeSelectedItem resolves it to a valid selection
  // or null. selectedItemsEqual preserves referential identity so that
  // autosave-driven zone changes don't produce a new object reference when
  // the selection is logically unchanged.
  return function editorReducer(state: EditorState, action: EditorAction): EditorState {
    const nextState = coreReducer(state, action);

    if (nextState.zones !== state.zones && nextState.selectedItem != null) {
      const sanitized = sanitizeSelectedItem(nextState.selectedItem, nextState.zones);
      if (!selectedItemsEqual(nextState.selectedItem, sanitized)) {
        return { ...nextState, selectedItem: sanitized };
      }
    }

    return nextState;
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
    collapsedPools: state.collapsedPools,
    collapsedZones: state.collapsedZones,
    dismissedBanners: state.dismissedBanners,
    selectedItem: state.selectedItem,
    canUndo: false,
    canRedo: false,
    dispatch,
  };
}
