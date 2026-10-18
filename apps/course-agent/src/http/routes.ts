const CONVERSATION_ROUTE = new URLPattern({
  pathname:
    '/conversations/:conversationId([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/:action(socket|snapshot)',
});

export interface ConversationRoute {
  conversationId: string;
  action: 'socket' | 'snapshot';
}

/** Matches `/conversations/<uuid>/(socket|snapshot)`, the per-conversation routes. */
export function parseRoute(url: string): ConversationRoute | null {
  const groups = CONVERSATION_ROUTE.exec(url)?.pathname.groups;
  if (!groups?.conversationId || !groups.action) return null;
  return {
    conversationId: groups.conversationId,
    action: groups.action as ConversationRoute['action'],
  };
}
