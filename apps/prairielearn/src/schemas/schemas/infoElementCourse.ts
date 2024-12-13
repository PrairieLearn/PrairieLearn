import { z } from 'zod';

export default z
  .object({
    comment: z
      .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
      .describe('Arbitrary comment for reference purposes.')
      .optional(),
    controller: z.string().describe("The name of the element's controller file."),
    dependencies: z
      .object({
        comment: z
          .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
          .describe('Arbitrary comment for reference purposes.')
          .optional(),
        coreStyles: z
          .array(z.string().describe('A .css file located in /public/stylesheets.'))
          .describe(
            '[DEPRECATED, DO NOT USE] The styles required by this element from /public/stylesheets.',
          )
          .optional(),
        coreScripts: z
          .array(z.string().describe('A .js file located in /public/javascripts.'))
          .describe(
            '[DEPRECATED, DO NOT USE] The scripts required by this element from /public/javascripts.',
          )
          .optional(),
        nodeModulesStyles: z
          .array(z.string().describe('A .css file located in /node_modules.'))
          .describe('The styles required by this element from /node_modules.')
          .optional(),
        nodeModulesScripts: z
          .array(z.string().describe('A .js file located in /node_modules.'))
          .describe('The scripts required by this element from /node_modules.')
          .optional(),
        clientFilesCourseStyles: z
          .array(z.string().describe('A .css file located in clientFilesCourse.'))
          .describe('The styles required by this element from clientFilesCourse.')
          .optional(),
        clientFilesCourseScripts: z
          .array(z.string().describe('A .js file located in clientFilesCourse.'))
          .describe('The styles required by this element from clientFilesCourse.')
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
      .strict()
      .describe("The element's client-side dependencies.")
      .optional(),
    dynamicDependencies: z
      .object({
        comment: z
          .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
          .describe('Arbitrary comment for reference purposes.')
          .optional(),
        nodeModulesScripts: z
          .record(z.string())
          .describe('The scripts required by this element from /node_modules as an importmap.')
          .optional(),
        clientFilesCourseScripts: z
          .record(z.string())
          .describe('The styles required by this element from clientFilesCourse as an importmap.')
          .optional(),
        elementScripts: z
          .record(z.string())
          .describe(
            "The scripts required by this element from the element's directory as an importmap.",
          )
          .optional(),
      })
      .strict()
      .describe("The element's client-side dynamic dependencies.")
      .optional(),
  })
  .strict()
  .describe('Info files for v3 elements.');
