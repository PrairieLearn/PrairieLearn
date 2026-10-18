import type { Conversation } from './conversation/conversation.js';
import type { ModelEnvironment } from './conversation/runtime.js';

export interface Env extends ModelEnvironment {
  Conversation: DurableObjectNamespace<Conversation>;
  PL_SERVICE_TOKEN: string;
}
