import type { Conversation } from './conversation/conversation.js';

export interface Env {
  Conversation: DurableObjectNamespace<Conversation>;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  PL_SERVICE_TOKEN: string;
}
