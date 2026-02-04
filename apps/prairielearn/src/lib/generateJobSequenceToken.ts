import { generateSignedToken } from '@prairielearn/signed-token';

import { config } from './config.js';

export function generateJobSequenceToken(jobSequenceId: string) {
  return generateSignedToken({ jobSequenceId }, config.secretKey);
}
