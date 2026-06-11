import stableStringify from 'fast-json-stable-stringify';

import type { ChangeTrackingResult, ZoneAssessmentForm } from '../types.js';

/**
 * Builds a map from trackingId to a deterministic JSON key for each item
 * in the zone tree. This can be precomputed once for the initial state and
 * reused across calls to `computeChangeTracking`.
 */
export function buildPropsMap(zones: ZoneAssessmentForm[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const zone of zones) {
    map.set(zone.trackingId, zonePropsKey(zone));

    for (const question of zone.questions) {
      map.set(question.trackingId, questionPropsKey(question));

      if (question.alternatives) {
        for (const alt of question.alternatives) {
          map.set(alt.trackingId, alternativePropsKey(alt));
        }
      }
    }
  }

  return map;
}

/**
 * Computes which items are new (not in initial state) vs modified (changed
 * from initial state). Used to show colored dot indicators in the tree view.
 */
export function computeChangeTracking(
  initialPropsMap: Map<string, string>,
  currentZones: ZoneAssessmentForm[],
): ChangeTrackingResult {
  const newIds = new Set<string>();
  const modifiedIds = new Set<string>();

  for (const zone of currentZones) {
    const initialZoneKey = initialPropsMap.get(zone.trackingId);
    if (initialZoneKey == null) {
      newIds.add(zone.trackingId);
    } else if (initialZoneKey !== zonePropsKey(zone)) {
      modifiedIds.add(zone.trackingId);
    }

    for (const question of zone.questions) {
      const initialQuestionKey = initialPropsMap.get(question.trackingId);
      if (initialQuestionKey == null) {
        newIds.add(question.trackingId);
      } else if (initialQuestionKey !== questionPropsKey(question)) {
        modifiedIds.add(question.trackingId);
      }

      if (question.alternatives) {
        for (const alt of question.alternatives) {
          const initialAltKey = initialPropsMap.get(alt.trackingId);
          if (initialAltKey == null) {
            newIds.add(alt.trackingId);
          } else if (initialAltKey !== alternativePropsKey(alt)) {
            modifiedIds.add(alt.trackingId);
          }
        }
      }
    }
  }

  return { newIds, modifiedIds };
}

/**
 * Produces a deterministic JSON string from an object.
 * `fast-json-stable-stringify` provides consistent key ordering and
 * already omits `undefined` values (same as `JSON.stringify`), so form
 * objects with explicit `undefined` keys compare equal to objects that
 * simply lack those keys.
 */
function propsKey(obj: Record<string, unknown>): string {
  return stableStringify(obj);
}

function zonePropsKey(zone: ZoneAssessmentForm): string {
  const { trackingId: _trackingId, questions: _questions, ...rest } = zone;
  return propsKey(rest);
}

function questionPropsKey(question: ZoneAssessmentForm['questions'][number]): string {
  const { trackingId: _trackingId, alternatives: _alternatives, ...rest } = question;
  return propsKey(rest);
}

function alternativePropsKey(alt: { trackingId: string; [key: string]: unknown }): string {
  const { trackingId: _trackingId, ...rest } = alt;
  return propsKey(rest);
}
