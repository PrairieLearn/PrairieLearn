import type { SelectedItem, ZoneAssessmentForm } from '../types.js';

import { findQuestionByTrackingId } from './useAssessmentEditor.js';

function findAlternativeLocation(zones: ZoneAssessmentForm[], alternativeTrackingId: string) {
  for (const zone of zones) {
    for (const question of zone.questions) {
      const alternative = question.alternatives?.find(
        (alt) => alt.trackingId === alternativeTrackingId,
      );
      if (alternative) {
        return {
          questionTrackingId: question.trackingId,
        };
      }
    }
  }
  return null;
}

export function sanitizeSelectedItem(
  selectedItem: SelectedItem,
  zones: ZoneAssessmentForm[],
): SelectedItem {
  if (selectedItem == null) {
    return null;
  }

  switch (selectedItem.type) {
    case 'zone':
      return zones.some((zone) => zone.trackingId === selectedItem.zoneTrackingId)
        ? selectedItem
        : null;

    case 'question': {
      const result = findQuestionByTrackingId(zones, selectedItem.questionTrackingId);
      return result && !result.question.alternatives ? selectedItem : null;
    }

    case 'altGroup': {
      const result = findQuestionByTrackingId(zones, selectedItem.questionTrackingId);
      return result?.question.alternatives ? selectedItem : null;
    }

    case 'alternative': {
      const currentParent = findQuestionByTrackingId(zones, selectedItem.questionTrackingId);
      if (
        currentParent?.question.alternatives?.some(
          (alternative) => alternative.trackingId === selectedItem.alternativeTrackingId,
        )
      ) {
        return selectedItem;
      }

      const movedAlternative = findAlternativeLocation(zones, selectedItem.alternativeTrackingId);
      if (movedAlternative) {
        return {
          type: 'alternative',
          questionTrackingId: movedAlternative.questionTrackingId,
          alternativeTrackingId: selectedItem.alternativeTrackingId,
        };
      }

      const extractedQuestion = findQuestionByTrackingId(zones, selectedItem.alternativeTrackingId);
      if (extractedQuestion && !extractedQuestion.question.alternatives) {
        return {
          type: 'question',
          questionTrackingId: selectedItem.alternativeTrackingId,
        };
      }

      return null;
    }

    case 'picker': {
      if (!zones.some((zone) => zone.trackingId === selectedItem.zoneTrackingId)) {
        return null;
      }

      const returnToSelection = sanitizeSelectedItem(selectedItem.returnToSelection ?? null, zones);
      return returnToSelection
        ? { ...selectedItem, returnToSelection }
        : { type: 'picker', zoneTrackingId: selectedItem.zoneTrackingId };
    }

    case 'altGroupPicker': {
      if (!zones.some((zone) => zone.trackingId === selectedItem.zoneTrackingId)) {
        return null;
      }

      if (!selectedItem.altGroupTrackingId) {
        return selectedItem;
      }

      const result = findQuestionByTrackingId(zones, selectedItem.altGroupTrackingId);
      return result?.question.alternatives
        ? selectedItem
        : { type: 'altGroupPicker', zoneTrackingId: selectedItem.zoneTrackingId };
    }
  }
}

export function selectedItemsEqual(a: SelectedItem, b: SelectedItem): boolean {
  if (a === b) {
    return true;
  }
  if (a == null || a.type !== b?.type) {
    return false;
  }

  switch (a.type) {
    case 'zone':
      return a.zoneTrackingId === (b.type === 'zone' ? b.zoneTrackingId : '');

    case 'question':
    case 'altGroup':
      return (
        a.questionTrackingId ===
        (b.type === 'question' || b.type === 'altGroup' ? b.questionTrackingId : '')
      );

    case 'alternative':
      return (
        b.type === 'alternative' &&
        a.questionTrackingId === b.questionTrackingId &&
        a.alternativeTrackingId === b.alternativeTrackingId
      );

    case 'picker':
      return (
        b.type === 'picker' &&
        a.zoneTrackingId === b.zoneTrackingId &&
        selectedItemsEqual(a.returnToSelection ?? null, b.returnToSelection ?? null)
      );

    case 'altGroupPicker':
      return (
        b.type === 'altGroupPicker' &&
        a.zoneTrackingId === b.zoneTrackingId &&
        a.altGroupTrackingId === b.altGroupTrackingId
      );
  }
}
