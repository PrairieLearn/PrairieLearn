import '@prairielearn/preact/client-runtime';
import { registerReactFragment } from '@prairielearn/preact/client';

import { AuthzAccessMismatch } from '../../../../src/middlewares/AuthzAccessMismatch.js';

registerReactFragment(AuthzAccessMismatch);
