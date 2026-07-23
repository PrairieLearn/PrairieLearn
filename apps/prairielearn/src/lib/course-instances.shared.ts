/**
 * Error message thrown by the server when a course instance short name collides
 * with an existing one. Shared with the client so the copy modal can recognize
 * the server response without duplicating the string.
 */
export const DUPLICATE_COURSE_INSTANCE_SHORT_NAME_ERROR =
  'A course instance with this short name already exists';
