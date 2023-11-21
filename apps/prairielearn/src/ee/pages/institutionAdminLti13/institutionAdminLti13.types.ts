import { z } from 'zod';

// also in config.ts as config.lti13InstancePlatforms
export const LTI13InstancePlatformsSchema = z
  .array(
    z.object({
      platform: z.string(),
      display_order: z.number().default(100),
      issuer_params: z.any().optional(),
      custom_fields: z.any().optional(),
    }),
  )
  .default([]);

export type LTI13InstancePlatforms = z.infer<typeof LTI13InstancePlatformsSchema>;
