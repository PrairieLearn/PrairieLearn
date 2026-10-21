import { z } from 'zod';

export const ElementLocalFilePathJsonSchema = z
  .string()
  .regex(
    /^(?![\\/])(?![A-Za-z]:[\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$)).+$/,
    'Path must stay within the element directory.',
  );
