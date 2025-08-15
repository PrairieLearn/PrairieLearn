/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { z } from 'zod/v4';

import { CommentJsonSchema } from './comment.js';

const AccessRuleJsonSchema = z
  .strictObject({
    comment: CommentJsonSchema.optional().describe('Arbitrary comment for reference purposes.'),
    role: z
      .enum(['Student', 'TA', 'Instructor', 'Superuser'])
      .describe('DEPRECATED -- do not use.')
      .meta({
        deprecated: true,
      })
      .optional(),
    uids: z
      .array(z.string())
      .describe(
        "A list of UIDs (like 'username@example.com'), one of which is required for access.",
      )
      .optional(),
    startDate: z.string().describe('The earliest date on which access is permitted.').optional(),
    endDate: z.string().describe('The latest date on which access is permitted.').optional(),
    institution: z.string().describe('The institution from which access is permitted.').optional(),
  })

  .describe(
    'An access rule that permits people to access this course instance. All restrictions present in the rule must be satisfied for the rule to allow access.',
  );

const AccessControlJsonSchema = z
  .array(AccessRuleJsonSchema.describe(AccessRuleJsonSchema.description!))
  .describe(
    'List of access rules for the course instance. Access is permitted if any access rule is satisfied.',
  );

export const CourseInstanceJsonSchema = z
  .strictObject({
    comment: CommentJsonSchema.optional().describe('Arbitrary comment for reference purposes.'),
    uuid: z
      .string()
      .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)
      .describe('Unique identifier (UUID v4).'),
    longName: z.string().describe("The long name of this course instance (e.g., 'Spring 2015')."),
    shortName: z
      .string()
      .describe('DEPRECATED -- do not use.')
      .meta({
        deprecated: true,
      })
      .optional(),
    timezone: z
      .string()
      .describe(
        'The timezone for all date input and display (e.g., "America/Chicago"). Must be an official timezone identifier, as listed at <https://en.wikipedia.org/wiki/List_of_tz_database_time_zones>. A canonical identifier is preferred. If not specified, the timezone of the course will be used.',
      )
      .optional(),
    allowIssueReporting: z
      .boolean()
      .describe('DEPRECATED -- do not use.')
      .meta({
        deprecated: true,
      })
      .optional()
      .default(true),
    hideInEnrollPage: z
      .boolean()
      .describe(
        'If set to true, hides the course instance in the enrollment page, so that only direct links to the course can be used for enrollment.',
      )
      .optional()
      .default(false),
    userRoles: z
      .object({})
      .catchall(z.any())
      .describe('DEPRECATED -- do not use.')
      .meta({
        deprecated: true,
      })
      .optional(),
    allowAccess: AccessControlJsonSchema.optional().describe(AccessControlJsonSchema.description!),
    groupAssessmentsBy: z
      .enum(['Set', 'Module'])
      .describe(
        'Determines which assessment category will be used to group assessments on the student assessments page.',
      )
      .optional()
      .default('Set'),
    shareSourcePublicly: z
      .boolean()
      .describe(
        "If true, the course instance's JSON configuration and all of its assessment's JSON configurations are available for others to view and copy.",
      )
      .optional()
      .default(false),
  })

  .describe('The specification file for a course instance.')
  .meta({
    title: 'Course instance information',
  });

export type CourseInstanceJson = z.infer<typeof CourseInstanceJsonSchema>;
export type CourseInstanceJsonInput = z.input<typeof CourseInstanceJsonSchema>;
