import { z } from 'zod';

const LegacyAccessRuleSchema = z
  .object({
    comment: z
      .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
      .describe('Arbitrary comment for reference purposes.')
      .optional(),
    role: z
      .enum(['Student', 'TA', 'Instructor', 'Superuser'])
      .describe('DEPRECATED -- do not use.')
      .optional(),
    uids: z
      .array(z.string())
      .describe('A list of UIDs, one of which is required for access')
      .optional(),
    startDate: z.string().describe('The earliest date on which access is permitted.').optional(),
    endDate: z.string().describe('The latest date on which access is permitted.').optional(),
    institution: z.string().describe('The institution from which access is permitted.').optional(),
  })
  .strict()
  .describe(
    'An access rule that permits people to access this course instance. All restrictions present in the rule must be satisfied for the rule to allow access.',
  );

const AccessRuleSchema = z.intersection(
  LegacyAccessRuleSchema,
  z.object({
    role: z.undefined({
      invalid_type_error: 'DEPRECATED -- do not use.',
    }),
  }),
);

const LegacyAccessControlSchema = z
  .array(LegacyAccessRuleSchema)
  .describe(
    'List of access rules for the course instance. Access is permitted if any access rule is satisfied.',
  );

const AccessControlSchema = z
  .array(AccessRuleSchema)
  .describe(
    'List of access rules for the course instance. Access is permitted if any access rule is satisfied.',
  );

const LegacyCourseInstanceSchema = z
  .object({
    comment: z
      .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
      .describe('Arbitrary comment for reference purposes.')
      .optional(),
    uuid: z
      .string()
      .regex(
        new RegExp('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
      )
      .describe('Unique identifier (UUID v4).'),
    longName: z.string().describe("The long name of this course instance (e.g., 'Spring 2015')."),
    shortName: z.string().describe('DEPRECATED -- do not use.').optional(),
    timezone: z
      .string()
      .describe(
        'The timezone for all date input and display (e.g., "America/Chicago", from the TZ column at https://en.wikipedia.org/wiki/List_of_tz_database_time_zones).',
      )
      .optional(),
    allowIssueReporting: z.boolean().describe('DEPRECATED -- do not use.').optional(),
    hideInEnrollPage: z
      .boolean()
      .describe(
        'If set to true, hides the course instance in the enrollment page, so that only direct links to the course can be used for enrollment.',
      )
      .optional(),
    userRoles: z.object({}).catchall(z.any()).describe('DEPRECATED -- do not use.').optional(),
    allowAccess: LegacyAccessControlSchema.optional(),
    groupAssessmentsBy: z
      .enum(['Set', 'Module'])
      .describe(
        'Determines which assessment category will be used to group assessments on the student assessments page.',
      )
      .optional(),
  })
  .strict()
  .describe('The specification file for a course instance.');

const CourseInstanceSchema = z.intersection(
  LegacyCourseInstanceSchema,
  z.object({
    shortName: z.undefined({
      invalid_type_error: 'DEPRECATED -- do not use.',
    }),
    allowIssueReporting: z.undefined({
      invalid_type_error: 'DEPRECATED -- do not use.',
    }),
    userRoles: z.undefined({
      invalid_type_error: 'DEPRECATED -- do not use.',
    }),
    allowAccess: AccessControlSchema.optional(),
  }),
);
export { LegacyCourseInstanceSchema, CourseInstanceSchema };
