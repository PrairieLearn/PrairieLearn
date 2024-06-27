import { OpenAI } from 'openai';

import { config } from '../../lib/config.js';

export function makeOpenAI() {
  return new OpenAI({
    apiKey: config.openAIApiKey,
  });
}
