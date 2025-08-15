import { z } from 'zod/v4';

import { CommentJsonSchema } from './comment.js';

const DependencyJsonSchema = z
  .strictObject({
    comment: CommentJsonSchema.optional().describe(CommentJsonSchema.description!),
    coreStyles: z
      .array(z.string().describe('A .css file located in /public/stylesheets.'))
      .describe(
        '[DEPRECATED, DO NOT USE] The styles required by this element from /public/stylesheets.',
      )
      .meta({
        deprecated: true,
      })
      .optional(),
    coreScripts: z
      .array(z.string().describe('A .js file located in /public/javascripts.'))
      .describe(
        '[DEPRECATED, DO NOT USE] The scripts required by this element from /public/javascripts.',
      )
      .meta({
        deprecated: true,
      })
      .optional(),
    nodeModulesStyles: z
      .array(z.string().describe('A .css file located in /node_modules.'))
      .describe('The styles required by this element from /node_modules.')
      .optional(),
    nodeModulesScripts: z
      .array(z.string().describe('A .js file located in /node_modules.'))
      .describe('The scripts required by this element from /node_modules.')
      .optional(),
    elementStyles: z
      .array(z.string().describe("A .css file located in the element's directory."))
      .describe("The styles required by this element from the element's directory.")
      .optional(),
    elementScripts: z
      .array(z.string().describe("A .js file located in the element's directory."))
      .describe("The scripts required by this element from the element's directory.")
      .optional(),
  })
  .describe("The element's client-side dependencies.");

const DynamicDependencyJsonSchema = z
  .strictObject({
    comment: CommentJsonSchema.optional().describe(CommentJsonSchema.description!),
    nodeModulesScripts: z
      .record(z.string(), z.string())
      .describe('The scripts required by this element from /node_modules as an importmap.')
      .optional(),
    elementScripts: z
      .record(z.string(), z.string())
      .describe(
        "The scripts required by this element from the element's directory as an importmap.",
      )
      .optional(),
  })

  .describe("The element's client-side dynamic dependencies.");

export const ElementCoreJsonSchema = z
  .strictObject({
    comment: CommentJsonSchema.optional().describe(CommentJsonSchema.description!),
    controller: z.string().describe("The name of the element's controller file."),
    dependencies: DependencyJsonSchema.optional().describe(DependencyJsonSchema.description!),
    dynamicDependencies: DynamicDependencyJsonSchema.optional().describe(
      DynamicDependencyJsonSchema.description!,
    ),
    additionalNames: z
      .array(z.string().describe('A name for this element to be used in question HTML files.'))
      .describe('Any additional names to give this element, i.e. for backwards compatibility.')
      .optional(),
  })

  .describe('Info files for v3 elements.')
  .meta({
    title: 'Element Info',
  });

export type ElementCoreJson = z.infer<typeof ElementCoreJsonSchema>;
