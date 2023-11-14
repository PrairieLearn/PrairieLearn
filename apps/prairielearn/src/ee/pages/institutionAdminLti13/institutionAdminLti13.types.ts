import { z } from 'zod';

/*
export interface LTI13Platform {
  platform: string;
  display_order: number;
  issuer_params?: object;
  custom_fields?: object;
};
*/

export const LTI13InstancePlatformSchema = z
  .array(
    z.object({
      platform: z.string(),
      display_order: z.number().default(100),
      issuer_params: z.any().optional(),
      custom_fields: z.any().optional(),
    }),
  )
  .default([]);
export type LTI13InstancePlatform = z.infer<typeof LTI13InstancePlatformSchema>;
