import { z } from 'zod';

export const CourseSharingNameSchema = z
  .string()
  .trim()
  .min(1, 'Course sharing name is required.')
  .max(64, 'Course sharing name must be 64 characters or fewer.')
  .regex(
    /^[A-Za-z0-9_-]+$/,
    'Course sharing name can contain only letters (A-Z, a-z), digits (0-9), hyphens (-), and underscores (_).',
  );
