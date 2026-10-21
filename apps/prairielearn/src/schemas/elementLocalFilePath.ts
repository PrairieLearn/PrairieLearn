import { z } from 'zod';

export const ElementLocalFilePathJsonSchema = z
  .string()
  .regex(
    /^(?![\\/])(?![A-Za-z]:)(?!.*%(?:2[eEfF]|5[cC]))(?!.*(?:^|[\\/])\.\.(?:[\\/]|$)).+$/,
    'Path must stay within the element directory.',
  )
  .describe("A file path contained within the element's directory.");
