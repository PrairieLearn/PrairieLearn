const CONVERSATION_ROUTE = new URLPattern({
  pathname:
    '/conversations/:conversationId([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/:action(chat|messages)',
});

export interface ConversationRoute {
  conversationId: string;
  action: 'chat' | 'messages';
}

/** Matches `/conversations/<uuid>/(chat|messages)`, the service's only routes. */
export function parseRoute(url: string): ConversationRoute | null {
  const groups = CONVERSATION_ROUTE.exec(url)?.pathname.groups;
  if (!groups?.conversationId || !groups.action) return null;
  return {
    conversationId: groups.conversationId,
    action: groups.action as ConversationRoute['action'],
  };
}
