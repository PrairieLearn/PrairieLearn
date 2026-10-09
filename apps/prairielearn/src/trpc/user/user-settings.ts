import { z } from 'zod';

import { updateUserSettings } from '../../models/user-settings.js';

import { requireAuthenticatedUser, t } from './init.js';

export interface UserSettingsError {
  Update: never;
}

// The authenticated user owns this settings row, so no additional resource permission applies.
// eslint-disable-next-line @prairielearn/require-trpc-permission-middleware
const update = t.procedure
  .use(requireAuthenticatedUser)
  .input(z.object({ enableSingleKeyShortcuts: z.boolean() }))
  .output(z.object({ enableSingleKeyShortcuts: z.boolean() }))
  .mutation(async ({ ctx, input }) => {
    const settings = await updateUserSettings({
      user_id: ctx.authn_user.id,
      enable_single_key_shortcuts: input.enableSingleKeyShortcuts,
    });
    return { enableSingleKeyShortcuts: settings.enable_single_key_shortcuts };
  });

export const userSettingsRouter = t.router({
  update,
});
