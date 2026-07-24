import { z } from 'zod';

import { CommentJsonSchema } from './comment.js';

export const ColorJsonSchema = z
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

export type ColorJson = z.infer<typeof ColorJsonSchema>;

export const TopicJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
    name: z.string().describe('Long descriptive name (preferably less than 10 words).'),
    color: ColorJsonSchema,
    description: z.string().describe('Description of the topic.').optional(),
  })
  .describe("A single topic, can represent a unit of learning (e.g. 'vectors').");

export type TopicJsonInput = z.input<typeof TopicJsonSchema>;

export const TagJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
    shortName: z.string().describe('Short name (preferably 2 to 7 characters).').optional(),
    name: z.string().describe('Long descriptive name (preferably less than 10 words).'),
    color: ColorJsonSchema,
    description: z.string().describe('Description of the tag.').optional(),
  })
  .describe('A single tag description.');

export type TagJson = z.infer<typeof TagJsonSchema>;
export type TagJsonInput = z.input<typeof TagJsonSchema>;

// Shared-state object names show up in JSON, in Python/JS access paths, and
// (eventually) in linked-question namespacing like `@sharing-name/objectName`.
// We reserve `@`, `/`, `:`, `.`, and whitespace so that namespacing convention
// stays unambiguous, and start with a conservative grammar that's easy to
// relax later but impossible to tighten once names exist in production.
export const SHARED_STATE_OBJECT_NAME_REGEXP = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export const SharedStateObjectPropertyJsonSchema = z
  .object({
    type: z.enum(['string', 'number', 'boolean']),
    default: z.union([z.string(), z.number(), z.boolean()]),
    enum: z.array(z.union([z.string(), z.number()])).optional(),
  })
  .strict();

export const SharedStateObjectPropertiesJsonSchema = z.record(
  z.string().min(1),
  SharedStateObjectPropertyJsonSchema,
);

export const SharedStateObjectJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
    scope: z
      .enum(['assessmentInstance', 'courseInstance'])
      .describe(
        'The lifetime of this object\'s values. Only "assessmentInstance" is currently supported.',
      ),
    dataVersion: z
      .number()
      .int()
      .min(1)
      .describe(
        'A compatibility boundary, authored by the course. Increment this to intentionally reset all stored values for this object, e.g. after a breaking change to its properties.',
      ),
    properties: SharedStateObjectPropertiesJsonSchema.describe(
      'The named, typed properties that make up this object.',
    ),
  })
  .strict()
  .describe('A single shared-state object definition.');

export type SharedStateObjectJson = z.infer<typeof SharedStateObjectJsonSchema>;
export type SharedStateObjectPropertyJson = z.infer<typeof SharedStateObjectPropertyJsonSchema>;
export type SharedStateObjectPropertiesJson = z.infer<
  typeof SharedStateObjectPropertiesJsonSchema
>;

export const AssessmentSetJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
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
    color: ColorJsonSchema,
  })
  .describe('A single assessment set description.');

export type AssessmentSetJson = z.infer<typeof AssessmentSetJsonSchema>;
export type AssessmentSetJsonInput = z.input<typeof AssessmentSetJsonSchema>;

const CourseOptionsJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
    useNewQuestionRenderer: z
      .boolean()
      .describe('Feature flag to enable the new question renderer.')
      .meta({ deprecated: true })
      .optional(),
    devModeFeatures: z
      .union([
        z
          .array(z.string().describe('A single feature flag.'))
          .describe('Legacy format; use an object instead.'),
        z.record(z.string(), z.boolean()),
      ])
      .describe('Feature flags to enable/disable in development mode.')
      .optional(),
    questionsReceiveUserData: z
      .boolean()
      .describe(
        'If true, server.py receives the variant owner\'s identity (UID, UIN, name) and group data (if applicable) via `data["options"]["user"]` and `data["options"]["group"]`. The user value is null for group variants. Only takes effect when the question is rendered in its owning course; data is omitted for questions imported via sharing. This JSON setting is honored only in development mode. In production, configure this on the course settings page; sync reports a warning if the JSON value differs from the production setting.',
      )
      .optional(),
  })
  .strict()
  .describe('Options for this course.');

export const CourseJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
    uuid: z.guid().describe('Unique identifier (UUID).').meta({ deprecated: true }).optional(),
    name: z.string().describe("The course name (e.g., 'TAM 212')."),
    title: z.string().describe("The course title (e.g., 'Introductory Dynamics')."),
    timezone: z
      .string()
      .describe(
        'The timezone for all date input and display (e.g., "America/Chicago"). Must be an official timezone identifier, as listed at <https://en.wikipedia.org/wiki/List_of_tz_database_time_zones>. A canonical identifier is preferred.',
      )
      .optional(),
    options: CourseOptionsJsonSchema.optional().default({}),
    assessmentSets: z.array(AssessmentSetJsonSchema).describe('Assessment sets.').optional(),
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
    topics: z.array(TopicJsonSchema).describe('Question topics (visible to students).'),
    tags: z.array(TagJsonSchema).describe('Question tags (not visible to students).').optional(),
    sharingSets: z
      .array(
        z
          .object({
            name: z.string().describe('Name of the sharing set.'),
            description: z.string().describe('Description of the sharing set.').optional(),
          })
          .describe('A sharing set description.'),
      )
      .describe('Sharing sets.')
      .optional(),
    sharedState: z
      .record(
        z
          .string()
          .regex(
            SHARED_STATE_OBJECT_NAME_REGEXP,
            'Shared-state object names must start with a letter and contain only letters, numbers, underscores, and hyphens.',
          ),
        SharedStateObjectJsonSchema,
      )
      .describe(
        'Named, typed, scoped objects of small mutable state that questions can share with each other. See `sharedStateAccess` in question info files.',
      )
      .optional(),
  })
  .strict()
  .describe('The specification file for a course.')
  .meta({ title: 'Course information' });

export type CourseJson = z.infer<typeof CourseJsonSchema>;
export type CourseJsonInput = z.input<typeof CourseJsonSchema>;
