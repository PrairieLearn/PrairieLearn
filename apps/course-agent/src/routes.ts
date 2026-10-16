const ROUTE =
  /^\/conversations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(chat|messages)$/;

export interface ConversationRoute {
  conversationId: string;
  action: 'chat' | 'messages';
}

/** Parses `/conversations/<uuid>/(chat|messages)`, the only public routes. */
export function parseRoute(pathname: string): ConversationRoute | null {
  const match = ROUTE.exec(pathname);
  if (!match) return null;
  return { conversationId: match[1], action: match[2] as ConversationRoute['action'] };
}
