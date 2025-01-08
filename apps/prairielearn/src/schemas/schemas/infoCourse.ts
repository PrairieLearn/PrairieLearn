import { z } from 'zod';

import { CommentSchema } from './comment.js';

export const ColorSchema = z
  .enum([
    'red1',
    'red2',
    'red3',
    'pink1',
    'pink2',
    'pink3',
    'purple1',
    'purple2',
    'purple3',
    'blue1',
    'blue2',
    'blue3',
    'turquoise1',
    'turquoise2',
    'turquoise3',
    'green1',
    'green2',
    'green3',
    'yellow1',
    'yellow2',
    'yellow3',
    'orange1',
    'orange2',
    'orange3',
    'brown1',
    'brown2',
    'brown3',
    'gray1',
    'gray2',
    'gray3',
  ])
  .describe('A color name.');

export type Color = z.infer<typeof ColorSchema>;
export const TopicSchema = z
  .object({
    comment: CommentSchema.optional(),
    shortName: z.string().describe('Short name (preferably 2 to 7 characters).').optional(),
    name: z.string().describe('Long descriptive name (preferably less than 10 words).'),
    color: ColorSchema,
    description: z.string().describe('Description of the topic.').optional(),
  })
  .describe('A single assessment set description.');

export type Topic = z.infer<typeof TopicSchema>;

export const TagSchema = z
  .object({
    comment: CommentSchema.optional(),
    shortName: z.string().describe('Short name (preferably 2 to 7 characters).').optional(),
    name: z.string().describe('Long descriptive name (preferably less than 10 words).'),
    color: ColorSchema,
    description: z.string().describe('Description of the tag.').optional(),
  })
  .describe('A single tag description.');

export type Tag = z.infer<typeof TagSchema>;

export const AssessmentSetSchema = z
  .object({
    comment: CommentSchema.optional(),
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
    color: ColorSchema,
  })
  .describe('A single assessment set description.');

export type AssessmentSet = z.infer<typeof AssessmentSetSchema>;

export const CourseOptionsSchema = z
  .object({
    comment: CommentSchema.optional(),
    useNewQuestionRenderer: z
      .boolean()
      .describe('Feature flag to enable the new question renderer.')
      .optional(),
    devModeFeatures: z
      .union([
        z
          .array(z.string().describe('A single feature flag.'))
          .describe('Legacy format; use an object instead.'),
        z.record(z.string(), z.boolean()),
      ])
      .describe('Feature flags to enable in development mode.')
      .optional(),
  })
  .strict()
  .describe('Options for this course.');

export type CourseOptions = z.infer<typeof CourseOptionsSchema>;

export const CourseSchema = z
  .object({
    comment: CommentSchema.optional(),
    exampleCourse: z.boolean().describe('DEPRECATED -- do not use.').optional(),
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
    options: CourseOptionsSchema.optional(),
    assessmentSets: z.array(AssessmentSetSchema).describe('Assessment sets.').optional(),
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
    topics: z.array(TopicSchema).describe('Question topics (visible to students).'),
    tags: z.array(TagSchema).describe('Question tags (not visible to students).').optional(),
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

export type Course = z.infer<typeof CourseSchema>;
