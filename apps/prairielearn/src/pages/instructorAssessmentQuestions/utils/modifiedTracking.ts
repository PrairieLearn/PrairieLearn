import stableStringify from 'fast-json-stable-stringify';

import type { ZoneAssessmentForm } from '../types.js';

export interface ChangeTrackingResult {
  newIds: Set<string>;
  modifiedIds: Set<string>;
}

/**
 * Computes which items are new (not in initial state) vs modified (changed
 * from initial state). Used to show colored dot indicators in the tree view.
 */
export function computeChangeTracking(
  initialZones: ZoneAssessmentForm[],
  currentZones: ZoneAssessmentForm[],
): ChangeTrackingResult {
  const newIds = new Set<string>();
  const modifiedIds = new Set<string>();
  const initialProps = buildPropsMap(initialZones);

  for (const zone of currentZones) {
    const initialZoneKey = initialProps.get(zone.trackingId);
    if (initialZoneKey == null) {
      newIds.add(zone.trackingId);
    } else if (initialZoneKey !== zonePropsKey(zone)) {
      modifiedIds.add(zone.trackingId);
    }

    for (const question of zone.questions) {
      const initialQuestionKey = initialProps.get(question.trackingId);
      if (initialQuestionKey == null) {
        newIds.add(question.trackingId);
      } else if (initialQuestionKey !== questionPropsKey(question)) {
        modifiedIds.add(question.trackingId);
      }

      if (question.alternatives) {
        for (const alt of question.alternatives) {
          const initialAltKey = initialProps.get(alt.trackingId);
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

function buildPropsMap(zones: ZoneAssessmentForm[]): Map<string, string> {
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
 * Produces a deterministic JSON string from an object, stripping default
 * values that the form always sends (e.g., `lockpoint: false`) even when
 * the original object didn't have them. Key ordering is handled by
 * `fast-json-stable-stringify`.
 */
function propsKey(obj: Record<string, unknown>): string {
  const filtered: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined || val === null || val === false) continue;
    filtered[key] = val;
  }
  return stableStringify(filtered);
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
