import { z } from 'zod';

import { CommentJsonSchema } from './comment.js';

const DependencyJsonSchema = z
  .object({
    coreStyles: z
      .array(z.string().describe('A .css file located in /public/stylesheets.'))
      .describe(
        '[DEPRECATED, DO NOT USE] The styles required by this extension from /public/stylesheets.',
      )
      .optional(),
    coreScripts: z
      .array(z.string().describe('A .js file located in /public/javascripts.'))
      .describe(
        '[DEPRECATED, DO NOT USE] The scripts required by this extension from /public/javascripts.',
      )
      .optional(),
    nodeModulesStyles: z
      .array(z.string().describe('A .css file located in /node_modules.'))
      .describe('The styles required by this extension from /node_modules.')
      .optional(),
    nodeModulesScripts: z
      .array(z.string().describe('A .js file located in /node_modules.'))
      .describe('The scripts required by this extension from /node_modules.')
      .optional(),
    clientFilesCourseStyles: z
      .array(z.string().describe('A .css file located in clientFilesCourse.'))
      .describe('The styles required by this extension from clientFilesCourse.')
      .optional(),
    clientFilesCourseScripts: z
      .array(z.string().describe('A .js file located in clientFilesCourse.'))
      .describe('The scripts required by this extension from clientFilesCourse.')
      .optional(),
    extensionStyles: z
      .array(z.string().describe("A .css file located in the extension's directory."))
      .describe("The styles required by this extension from the extension's directory.")
      .optional(),
    extensionScripts: z
      .array(z.string().describe("A .js file located in the extension's directory."))
      .describe("The scripts required by this extension from the extension's directory.")
      .optional(),
  })
  .strict()
  .describe("The extension's client-side dependencies.");

export const ElementExtensionJsonSchema = z
  .object({
    controller: z
      .string()
      .describe("The name of the extension's Python controller file.")
      .optional(),
    dependencies: DependencyJsonSchema.optional(),
    dynamicDependencies: z
      .object({
        comment: CommentJsonSchema.optional(),
        nodeModulesScripts: z
          .record(z.string())
          .describe('The scripts required by this element from /node_modules as an importmap.')
          .optional(),
        clientFilesCourseScripts: z
          .record(z.string())
          .describe('The styles required by this element from clientFilesCourse as an importmap.')
          .optional(),
        extensionScripts: z
          .record(z.string())
          .describe("The scripts required by this extension from the extension's directory.")
          .optional(),
      })
      .strict()
      .describe("The element's client-side dynamic dependencies.")
      .optional(),
  })
  .strict()
  .describe('Info files for v3 element extensions.');

export type ElementExtensionJson = z.infer<typeof ElementExtensionJsonSchema>;
