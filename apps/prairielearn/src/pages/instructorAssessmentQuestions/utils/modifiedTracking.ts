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
 * Produces a deterministic JSON string from an object, handling two issues
 * that arise when the reducer spreads form updates into existing objects:
 *
 * 1. Key ordering: `{...obj, ...update}` can reorder keys. We sort them.
 * 2. Default values: The form always sends all fields (e.g., `lockpoint: false`)
 *    even when the original object didn't have them. We strip `undefined`,
 *    `null`, and `false` since these are equivalent to "absent" for all
 *    boolean/optional fields in the assessment schema.
 */
function stableStringify(obj: Record<string, unknown>): string {
  const entries: [string, unknown][] = [];
  for (const key of Object.keys(obj).sort()) {
    const val = obj[key];
    if (val === undefined || val === null || val === false) continue;
    entries.push([key, val]);
  }
  return JSON.stringify(Object.fromEntries(entries));
}

function zonePropsKey(zone: ZoneAssessmentForm): string {
  const { trackingId: _, questions: __, ...rest } = zone;
  return stableStringify(rest);
}

function questionPropsKey(question: ZoneAssessmentForm['questions'][number]): string {
  const { trackingId: _, alternatives, ...rest } = question;
  // Include the ordered list of child alternative trackingIds so that
  // reordering alternatives marks the group as modified.
  const childIds = alternatives?.map((a) => a.trackingId) ?? [];
  return stableStringify({ ...rest, childIds });
}

function alternativePropsKey(alt: { trackingId: string; [key: string]: unknown }): string {
  const { trackingId: _, ...rest } = alt;
  return stableStringify(rest);
}
