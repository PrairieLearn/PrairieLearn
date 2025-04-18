import { z } from 'zod';

import { CommentJsonSchema } from './comment.js';

export const QuestionDependencyJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
    coreStyles: z
      .array(z.string().describe('A .css file located in /public/stylesheets.'))
      .describe(
        '[DEPRECATED, DO NOT USE] The styles required by this question from /public/stylesheets.',
      )
      .optional(),
    coreScripts: z
      .array(z.string().describe('A .js file located in /public/javascripts.'))
      .describe(
        '[DEPRECATED, DO NOT USE] The scripts required by this question from /public/javascripts.',
      )
      .optional(),
    nodeModulesStyles: z
      .array(z.string().describe('A .css file located in /node_modules.'))
      .describe('The styles required by this question from /node_modules.')
      .optional(),
    nodeModulesScripts: z
      .array(z.string().describe('A .js file located in /node_modules.'))
      .describe('The scripts required by this question from /node_modules.')
      .optional(),
    clientFilesCourseStyles: z
      .array(z.string().describe('A .css file located in clientFilesCourse.'))
      .describe('The styles required by this question from clientFilesCourse.')
      .optional(),
    clientFilesCourseScripts: z
      .array(z.string().describe('A .js file located in clientFilesCourse.'))
      .describe('The scripts required by this question from clientFilesCourse.')
      .optional(),
    clientFilesQuestionStyles: z
      .array(z.string().describe('A .css file located in the clientFilesQuestion.'))
      .describe('The styles required by this question from clientFilesQuestion.')
      .optional(),
    clientFilesQuestionScripts: z
      .array(z.string().describe('A .js file located in the clientFilesQuestion.'))
      .describe('The scripts required by this question from clientFilesQuestion.')
      .optional(),
  })
  .strict()
  .describe("The question's client-side dependencies.");

export const WorkspaceOptionsJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
    image: z
      .string()
      .describe(
        'The Docker image that will be used to serve this question. Should be specified as Dockerhub image.',
      ),
    port: z.number().int().describe('The port number used in the Docker image.'),
    home: z.string().describe('The home directory of the workspace container.'),
    args: z
      .union([z.string(), z.array(z.string())])
      .describe('Command line arguments to pass to the Docker container.')
      .optional(),
    rewriteUrl: z
      .boolean()
      .describe(
        'If true, the URL will be rewritten such that the workspace container will see all requests as originating from /.',
      )
      .optional(),
    gradedFiles: z
      .array(
        z
          .string()
          .describe(
            'A single file or directory that will be copied out of the workspace container when saving a submission.',
          ),
      )
      .describe(
        'The list of files or directories that will be copied out of the workspace container when saving a submission.',
      )
      .optional(),
    enableNetworking: z
      .boolean()
      .describe('Whether the workspace should have network access. Access is disabled by default.')
      .optional()
      .default(false),
    environment: z
      .record(z.string())
      .describe('Environment variables to set inside the workspace container.')
      .optional(),
    syncIgnore: z
      .array(z.string().describe('A single file or directory that will be excluded from sync.'))
      .describe(
        '[DEPRECATED, DO NOT USE] The list of files or directories that will be excluded from sync.',
      )
      .optional(),
  })
  .strict()
  .describe('Options for workspace questions.');

export const ExternalGradingOptionsJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
    enabled: z
      .boolean()
      .describe(
        'Whether the external grader is currently enabled. Useful if it is breaking, for example.',
      )
      .optional(),
    image: z
      .string()
      .describe(
        'The Docker image that will be used to grade this question. Should be specified as Dockerhub image.',
      ),
    entrypoint: z
      .union([z.string(), z.array(z.string())])
      .describe(
        'Program or command to run as the entrypoint to your grader. If not provided, the default entrypoint for the image will be used.',
      )
      .optional(),
    serverFilesCourse: z
      .array(
        z
          .string()
          .describe('A single file or directory that will be copied to the external grader.'),
      )
      .describe(
        'The list of files or directories that will be copied from course/externalGradingFiles/ to /grade/shared/',
      )
      .optional(),
    timeout: z
      .number()
      .int()
      .describe('The number of seconds after which the grading job will timeout.')
      .optional(),
    enableNetworking: z
      .boolean()
      .describe(
        'Whether the grading containers should have network access. Access is disabled by default.',
      )
      .optional()
      .default(false),
    environment: z
      .record(z.string())
      .describe('Environment variables to set inside the grading container.')
      .optional(),
  })
  .strict()
  .describe('Options for externally graded questions.');

export const QuestionJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
    uuid: z
      .string()
      .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)
      .describe('Unique identifier (UUID v4).'),
    type: z
      .enum(['Calculation', 'MultipleChoice', 'Checkbox', 'File', 'MultipleTrueFalse', 'v3'])
      .describe('Type of the question.'),
    title: z
      .string()
      .describe(
        "The title of the question (e.g., 'Addition of vectors in Cartesian coordinates').",
      ),
    topic: z.string().describe("The category of question (e.g., 'Vectors', 'Energy')."),
    tags: z
      .array(z.string().describe('A tag associated with a question.'))
      .describe("Extra tags associated with the question (e.g., 'Exam Only', 'Broken').")
      .optional(),
    clientFiles: z
      .array(z.string().describe('A single file accessible by the client.'))
      .describe('The list of question files accessible by the client (defaults to ["client.js"]).')
      .optional(),
    clientTemplates: z
      .array(z.string().describe('A single template file accessible by the client.'))
      .describe('List of client-accessible templates to render server-side.')
      .optional(),
    template: z
      .string()
      .describe('The QID of a question that serves at the template for this question.')
      .optional(),
    gradingMethod: z
      .enum(['Internal', 'External', 'Manual'])
      .describe('The grading method used for this question.')
      .optional(),
    singleVariant: z
      .boolean()
      .describe('Whether the question is not randomized and only generates a single variant.')
      .optional()
      .default(false),
    showCorrectAnswer: z
      .boolean()
      .describe('Whether to show the correct answer panel.')
      .optional()
      .default(true),
    partialCredit: z
      .boolean()
      .describe(
        'Whether the question will give partial points for fractional scores (defaults to "false" for v2 questions and "true" for v3.).',
      )
      .optional(),
    options: z
      .object({})
      .catchall(z.any())
      .describe(
        'Options that define how the question will work, specific to the individual question type.',
      )
      .optional(),
    externalGradingOptions: ExternalGradingOptionsJsonSchema.optional(),
    dependencies: QuestionDependencyJsonSchema.optional(),
    workspaceOptions: WorkspaceOptionsJsonSchema.optional(),
    sharingSets: z
      .array(z.string().describe('The name of a sharing set'))
      .describe('The list of sharing sets that this question belongs to.')
      .optional(),
    sharePublicly: z.boolean().describe('Whether this question is publicly shared.').optional(),
    shareSourcePublicly: z
      .boolean()
      .describe("Whether this questions's source code is publicly shared.")
      .optional(),
  })
  .strict()
  .describe('Info files for questions.');

export type QuestionJson = z.infer<typeof QuestionJsonSchema>;
export type QuestionJsonInput = z.input<typeof QuestionJsonSchema>;
