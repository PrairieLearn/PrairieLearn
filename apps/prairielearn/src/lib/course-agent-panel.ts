import { z } from 'zod';

export const CourseAgentPanelStateSchema = z.object({
  open: z.boolean().default(false),
  selected: z.string().default(''),
  title: z.string().max(200).default('New conversation'),
});
export type CourseAgentPanelState = z.infer<typeof CourseAgentPanelStateSchema>;
