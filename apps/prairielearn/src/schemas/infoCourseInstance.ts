import { z } from 'zod';

import { CommentJsonSchema } from './comment.js';
import { ColorJsonSchema } from './infoCourse.js';

const AccessRuleJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
    role: z
      .enum(['Student', 'TA', 'Instructor', 'Superuser'])
      .describe('DEPRECATED -- do not use.')
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
  .strict()
  .describe(
    'An access rule that permits people to access this course instance. All restrictions present in the rule must be satisfied for the rule to allow access.',
  );

const AllowAccessJsonSchema = z
  .array(AccessRuleJsonSchema)
  .describe(
    'List of access rules for the course instance. Access is permitted if any access rule is satisfied.',
  );

const PublishingJsonSchema = z.object({
  startDate: z
    .string()
    .describe(
      'When the course instance is published. If specified, endDate must also be specified.',
    )
    .optional(),
  endDate: z
    .string()
    .describe(
      'When the course instance is unpublished. If specified, startDate must also be specified.',
    )
    .optional(),
});

export const StudentLabelJsonSchema = z
  .object({
    uuid: z
      .string()
      .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)
      .describe('Unique identifier (UUID v4).'),
    name: z.string().trim().min(1).max(255).describe('The name of the student label.'),
    color: ColorJsonSchema,
  })
  .strict()
  .describe('A single student label, can represent a collection of students (e.g. "Section A").');

export type StudentLabelJson = z.infer<typeof StudentLabelJsonSchema>;

export const CourseInstanceJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
    uuid: z
      .string()
      .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)
      .describe('Unique identifier (UUID v4).'),
    longName: z.string().describe("The long name of this course instance (e.g., 'Spring 2015')."),
    shortName: z.string().describe('DEPRECATED -- do not use.').optional(),
    timezone: z
      .string()
      .describe(
        'The timezone for all date input and display (e.g., "America/Chicago"). Must be an official timezone identifier, as listed at <https://en.wikipedia.org/wiki/List_of_tz_database_time_zones>. A canonical identifier is preferred. If not specified, the timezone of the course will be used.',
      )
      .optional(),
    allowIssueReporting: z.boolean().describe('DEPRECATED -- do not use.').optional(),
    selfEnrollment: z
      .object({
        enabled: z
          .boolean()
          .describe(
            'If true, self-enrollment access is controlled by the beforeDate and useEnrollmentCode properties. If false, users can never enroll themselves, and must be either invited or added in the UI. You likely want to set this to true if you are configuring self-enrollment.',
          )
          .optional()
          .default(true),
        restrictToInstitution: z
          .boolean()
          .describe(
            'If true, self-enrollment is restricted to users from the same institution as the course. If false, any user can self-enroll.',
          )
          .optional()
          .default(true),
        beforeDate: z
          .string()
          .describe(
            'If specified, self-enrollment is allowed before this date and forbidden after this date. If not specified, self-enrollment depends on enabled property.',
          )
          .optional(),
        useEnrollmentCode: z
          .boolean()
          .describe(
            'If true, self-enrollment requires an enrollment code to enroll. If false, any link to the course instance will allow self-enrollment.',
          )
          .optional()
          .default(false),
      })
      .optional()
      .default({}),
    hideInEnrollPage: z
      .boolean()
      .describe(
        'DEPRECATED -- The enrollment listing page has been removed. This setting is no longer used.',
      )
      .optional(),
    userRoles: z.object({}).catchall(z.any()).describe('DEPRECATED -- do not use.').optional(),
    publishing: PublishingJsonSchema.optional(),
    allowAccess: AllowAccessJsonSchema.optional(),
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
    studentLabels: z.array(StudentLabelJsonSchema).describe('Student labels.').optional(),
  })
  .strict()
  .describe('The specification file for a course instance.');

export type CourseInstanceJson = z.infer<typeof CourseInstanceJsonSchema>;
export type CourseInstanceJsonInput = z.input<typeof CourseInstanceJsonSchema>;
