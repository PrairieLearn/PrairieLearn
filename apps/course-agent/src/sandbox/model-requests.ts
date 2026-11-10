import { z } from 'zod';

/**
 * Tool types Codex declares for its own client-run tools. Hosted tools are refused because the
 * agent can call the model endpoint directly: `web_search` can open arbitrary pages, and `mcp`
 * connects OpenAI to any server URL in the request.
 */
const CLIENT_TOOL_TYPES = new Set(['function', 'custom', 'namespace']);

/** Why a `/v1/responses` body is refused, or null if it may be forwarded. */
export function modelRequestRefusal(body: { tools?: unknown }): string | null {
  if (body.tools === undefined) return null;
  if (!Array.isArray(body.tools)) return 'tools must be an array';
  for (const tool of body.tools as { type?: unknown }[]) {
    if (typeof tool?.type !== 'string' || !CLIENT_TOOL_TYPES.has(tool.type)) {
      return `Tool type ${JSON.stringify(tool?.type)} is not available`;
    }
  }
  return null;
}

/**
 * Commands of Codex's `web.run` tool, which posts them to the provider's `alpha/search` endpoint.
 * OpenAI runs them: searches, page reads by URL, and data lookups. The container only receives
 * their results. Commands added by later Codex versions are refused until reviewed here.
 */
const Operations = z.array(z.looseObject({})).optional();
const SearchCommandsSchema = z.strictObject({
  search_query: Operations,
  image_query: Operations,
  open: Operations,
  click: Operations,
  find: Operations,
  screenshot: Operations,
  finance: Operations,
  weather: Operations,
  sports: Operations,
  time: Operations,
  response_length: z.enum(['short', 'medium', 'long']).optional(),
});

/**
 * Replaces whatever settings the request carries, since the agent can send its own requests.
 * Live access lets OpenAI read current pages; the container itself never connects to them.
 */
const SEARCH_SETTINGS = { allowed_callers: ['direct'], external_web_access: true };

export const SEARCH_REFUSAL = `Unsupported web command. Use only ${Object.keys(SearchCommandsSchema.shape).join(', ')}.`;

/**
 * The body to forward for a web request, or a refusal to return to the model. Web request failures
 * are fatal to a Codex turn, so a refusal is returned as a successful result that the model can
 * read and recover from.
 */
export function prepareSearchRequest(
  body: Record<string, unknown>,
): { forward: Record<string, unknown>; operations: number } | { refusal: string } {
  const commands = SearchCommandsSchema.safeParse(body.commands);
  if (!commands.success) return { refusal: SEARCH_REFUSAL };
  const { response_length: _length, ...operations } = commands.data;
  return {
    forward: { ...body, commands: commands.data, settings: SEARCH_SETTINGS },
    operations: Object.values(operations).reduce((total, list) => total + (list?.length ?? 0), 0),
  };
}
