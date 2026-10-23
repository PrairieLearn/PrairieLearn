const CONVERSATION_ROUTE = new URLPattern({
  pathname:
    '/conversations/:conversationId([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}){/get-messages}?',
});

/** The native SDK WebSocket and its initial-history HTTP route. */
export function parseRoute(url: string): string | null {
  return CONVERSATION_ROUTE.exec(url)?.pathname.groups.conversationId ?? null;
}
