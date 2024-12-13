import { z } from 'zod';

export const schema = z
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
    name: z.string().describe("The course name (e.g., 'TAM 212')."),
    title: z.string().describe("The course title (e.g., 'Introductory Dynamics')."),
    timezone: z
      .string()
      .describe(
        'The timezone for all date input and display (e.g., "America/Chicago", from the TZ column at https://en.wikipedia.org/wiki/List_of_tz_database_time_zones).',
      )
      .optional(),
    options: z
      .object({
        comment: z
          .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
          .describe('Arbitrary comment for reference purposes.')
          .optional(),
        useNewQuestionRenderer: z
          .boolean()
          .describe('Feature flag to enable the new question renderer.')
          .optional(),
        devModeFeatures: z
          .array(z.string().describe('A single feature flag.'))
          .describe('Feature flags to enable in development mode.')
          .optional(),
      })
      .strict()
      .describe('Options for this course.')
      .optional(),
    assessmentSets: z
      .array(
        z
          .object({
            comment: z
              .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
              .describe('Arbitrary comment for reference purposes.')
              .optional(),
            abbreviation: z
              .string()
              .describe("Abbreviation (preferably 1 to 3 characters), e.g., 'HW', 'Q', 'PQ', etc."),
            name: z
              .string()
              .describe(
                "Full singular name (preferably 1 to 3 words), e.g., 'Homework', 'Quiz', 'Practice Quiz'.",
              ),
            heading: z
              .string()
              .describe(
                "Plural heading for a group of assessments (preferably 1 to 3 words), e.g., 'Homeworks', 'Quizzes'.",
              ),
            color: z.any(),
          })
          .describe('A single assessment set description.'),
      )
      .describe('Assessment sets.')
      .optional(),
    assessmentModules: z
      .array(
        z
          .object({
            name: z
              .string()
              .describe("Short name for a module (preferably 1 to 3 words), e.g., 'Introduction'."),
            heading: z.string().describe('Full name of the module (visible to students)'),
          })
          .describe('A single course module description.'),
      )
      .describe('Course modules.')
      .optional(),
    topics: z
      .array(
        z
          .object({
            comment: z
              .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
              .describe('Arbitrary comment for reference purposes.')
              .optional(),
            shortName: z.string().describe('Short name (preferably 2 to 7 characters).').optional(),
            name: z.string().describe('Long descriptive name (preferably less than 10 words).'),
            color: z.any(),
            description: z.string().describe('Description of the topic.').optional(),
          })
          .describe('A single assessment set description.'),
      )
      .describe('Question topics (visible to students).'),
    tags: z
      .array(
        z
          .object({
            comment: z
              .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
              .describe('Arbitrary comment for reference purposes.')
              .optional(),
            shortName: z.string().describe('Short name (preferably 2 to 7 characters).').optional(),
            name: z.string().describe('Long descriptive name (preferably less than 10 words).'),
            color: z.any(),
            description: z.string().describe('Description of the tag.').optional(),
          })
          .describe('A single tag description.'),
      )
      .describe('Question tags (not visible to students).')
      .optional(),
    sharingSets: z
      .array(
        z
          .object({
            name: z.string().describe('Name of the sharing set.'),
            description: z.string().describe('Description of the sharing set.').optional(),
          })
          .describe('A sharing set description.'),
      )
      .describe('Sharing sets')
      .optional(),
  })
  .strict()
  .describe('The specification file for a course.');
