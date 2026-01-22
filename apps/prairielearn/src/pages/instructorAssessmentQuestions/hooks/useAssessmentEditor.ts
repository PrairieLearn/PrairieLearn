import { useReducer } from 'react';

import type { EditorAction, EditorState } from '../types.js';

/**
 * Reducer for managing assessment editor state.
 * Handles all CRUD operations for zones and questions.
 * UNDO/REDO are stubbed for a future PR with history tracking.
 */
function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'ADD_QUESTION': {
      const { zoneIndex, question, questionData } = action;
      const newZones = structuredClone(state.zones);
      newZones[zoneIndex].questions.push(question);

      const newQuestionMap = questionData
        ? { ...state.questionMap, [question.id!]: questionData }
        : state.questionMap;

      return {
        zones: newZones,
        questionMap: newQuestionMap,
      };
    }

    case 'UPDATE_QUESTION': {
      const { zoneIndex, questionIndex, question, alternativeIndex } = action;
      const newZones = structuredClone(state.zones);
      const zone = newZones.at(zoneIndex);
      if (!zone) {
        console.error(`UPDATE_QUESTION: Invalid zone index ${zoneIndex}`);
        return state;
      }
      const existingQuestion = zone.questions.at(questionIndex);
      if (!existingQuestion) {
        console.error(
          `UPDATE_QUESTION: Invalid question index ${questionIndex} in zone ${zoneIndex}`,
        );
        return state;
      }

      if (alternativeIndex !== undefined) {
        // Updating an alternative within an alternative group
        if (!existingQuestion.alternatives) {
          console.error(
            `UPDATE_QUESTION: Question at zone ${zoneIndex}, index ${questionIndex} has no alternatives array`,
          );
          return state;
        }
        existingQuestion.alternatives[alternativeIndex] = {
          ...existingQuestion.alternatives[alternativeIndex],
          ...question,
        };
      } else {
        // Updating a regular question or alternative group itself
        zone.questions[questionIndex] = {
          ...existingQuestion,
          ...question,
        };
      }

      return {
        ...state,
        zones: newZones,
      };
    }

    case 'DELETE_QUESTION': {
      const { zoneIndex, questionIndex, questionId, alternativeIndex } = action;
      const newZones = structuredClone(state.zones);
      const zone = newZones.at(zoneIndex);
      if (!zone) {
        console.error(`DELETE_QUESTION: Invalid zone index ${zoneIndex}`);
        return state;
      }
      let newQuestionMap = { ...state.questionMap };

      // Remove from question map
      delete newQuestionMap[questionId];

      if (alternativeIndex !== undefined) {
        // Deleting an alternative from an alternative group
        const alternativeGroup = zone.questions[questionIndex];
        alternativeGroup.alternatives?.splice(alternativeIndex, 1);

        // If only one alternative remains, convert back to a regular question
        if (alternativeGroup.alternatives?.length === 1) {
          const remainingAlternative = alternativeGroup.alternatives[0];
          const { alternatives: _alternatives, ...groupWithoutAlternatives } = alternativeGroup;
          zone.questions[questionIndex] = {
            ...groupWithoutAlternatives,
            ...remainingAlternative,
          };

          // Update the question map for the remaining alternative
          const alternativeId = remainingAlternative.id;
          if (alternativeId && alternativeId in newQuestionMap) {
            newQuestionMap = {
              ...newQuestionMap,
              [alternativeId]: {
                ...newQuestionMap[alternativeId],
                alternative_group_size: 1,
              },
            };
          }
        }
      } else {
        // Deleting a regular question or entire alternative group
        zone.questions.splice(questionIndex, 1);
      }

      return {
        zones: newZones,
        questionMap: newQuestionMap,
      };
    }

    case 'REORDER_QUESTION': {
      const { fromZoneIndex, fromQuestionIndex, toZoneIndex, toQuestionIndex } = action;
      const newZones = structuredClone(state.zones);

      const fromZone = newZones.at(fromZoneIndex);
      const toZone = newZones.at(toZoneIndex);
      if (!fromZone || !toZone) {
        console.error(
          `REORDER_QUESTION: Invalid zone index (from: ${fromZoneIndex}, to: ${toZoneIndex})`,
        );
        return state;
      }

      // Remove question from source
      const movedQuestion = fromZone.questions.at(fromQuestionIndex);
      if (!movedQuestion) {
        console.error(
          `REORDER_QUESTION: Invalid question index ${fromQuestionIndex} in zone ${fromZoneIndex}`,
        );
        return state;
      }
      fromZone.questions.splice(fromQuestionIndex, 1);

      // When moving within the same zone, adjust target index since removal shifts indices
      const adjustedToIndex =
        fromZoneIndex === toZoneIndex && fromQuestionIndex < toQuestionIndex
          ? toQuestionIndex - 1
          : toQuestionIndex;

      // Insert at destination
      toZone.questions.splice(adjustedToIndex, 0, movedQuestion);

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
      const { zoneIndex, zone } = action;
      if (zoneIndex < 0 || zoneIndex >= state.zones.length) {
        console.error(`UPDATE_ZONE: Invalid zone index ${zoneIndex}`);
        return state;
      }
      const newZones = structuredClone(state.zones);
      newZones[zoneIndex] = {
        ...newZones[zoneIndex],
        ...zone,
      };
      return {
        ...state,
        zones: newZones,
      };
    }

    case 'DELETE_ZONE': {
      const { zoneIndex } = action;
      if (zoneIndex < 0 || zoneIndex >= state.zones.length) {
        console.error(`DELETE_ZONE: Invalid zone index ${zoneIndex}`);
        return state;
      }
      const newZones = structuredClone(state.zones);
      newZones.splice(zoneIndex, 1);
      return {
        ...state,
        zones: newZones,
      };
    }

    case 'UPDATE_QUESTION_MAP': {
      const { questionId, questionData } = action;
      return {
        ...state,
        questionMap: {
          ...state.questionMap,
          [questionId]: questionData,
        },
      };
    }

    case 'UNDO':
    case 'REDO':
      // TODO: Implement in future PR with history tracking
      return state;

    default:
      return state;
  }
}

/**
 * Custom hook for managing assessment editor state with useReducer.
 * Provides clean dispatch-based state updates and stubs for future undo/redo.
 */
export function useAssessmentEditor(initialState: EditorState) {
  const [state, dispatch] = useReducer(editorReducer, initialState);

  return {
    zones: state.zones,
    questionMap: state.questionMap,
    // Stubbed - always false until history tracking is added in future PR
    canUndo: false,
    canRedo: false,
    dispatch,
  };
}
