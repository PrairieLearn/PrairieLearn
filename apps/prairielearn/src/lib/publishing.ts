import { nowRoundedToSeconds } from '../pages/instructorInstanceAdminPublishing/utils/dateUtils.js';

export type PublishingStatus = 'unpublished' | 'publish_scheduled' | 'published';

/** Helper to compute status from dates and current time. */
export function computeStatus(startDate: Date | null, endDate: Date | null): PublishingStatus {
  if (!startDate && !endDate) {
    return 'unpublished';
  }

  const now = nowRoundedToSeconds();

  if (startDate && endDate) {
    if (endDate <= now) {
      return 'unpublished';
    }
    if (startDate > now) {
      return 'publish_scheduled';
    }
    return 'published';
  }

  // Should not happen in valid states, but default to unpublished
  return 'unpublished';
}
