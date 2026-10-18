import type { Conversation, ConversationEnv } from './conversation/conversation.js';

export interface Env extends ConversationEnv {
  Conversation: DurableObjectNamespace<Conversation>;
  PL_SERVICE_TOKEN: string;
}
