const CONVERSATION_ROUTE = new URLPattern({
  pathname:
    '/conversations/:conversationId([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}){/:action(get-messages|resume|pending-review|pending-review/decision|pending-review/outcome)}?',
});

/** Native SDK routes and the private recovery operation. */
export function parseRoute(url: string) {
  const groups = CONVERSATION_ROUTE.exec(url)?.pathname.groups;
  if (!groups?.conversationId) return null;
  return { conversationId: groups.conversationId, action: groups.action ?? 'chat' };
}
