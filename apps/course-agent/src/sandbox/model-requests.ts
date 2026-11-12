import { z } from 'zod';

/**
 * Tool types Codex declares for its own client-run tools. Hosted tools are refused because the
 * agent can call the model endpoint directly: `web_search` can open arbitrary pages, and `mcp`
 * connects OpenAI to any server URL in the request.
 */
const CLIENT_TOOL_TYPES = new Set(['function', 'custom', 'namespace']);
/** A namespace groups client-run tools; it cannot hold another namespace. */
const NAMESPACE_TOOL_TYPES = new Set(['function', 'custom']);

function toolsRefusal(tools: unknown, allowed: Set<string>): string | null {
  if (!Array.isArray(tools)) return 'tools must be an array';
  for (const tool of tools as { type?: unknown; tools?: unknown }[]) {
    if (typeof tool?.type !== 'string' || !allowed.has(tool.type)) {
      return `Tool type ${JSON.stringify(tool?.type)} is not available`;
    }
    if (tool.type === 'namespace') {
      const refusal = toolsRefusal(tool.tools, NAMESPACE_TOOL_TYPES);
      if (refusal) return refusal;
    }
  }
  return null;
}

/**
 * Why a `/v1/responses` body is refused, or null if it may be forwarded. Tools can be declared in
 * `tools` or, as Codex does for models using Responses Lite, in `additional_tools` input items.
 */
export function modelRequestRefusal(body: {
  tools?: unknown;
  input?: unknown;
  background?: unknown;
  service_tier?: unknown;
  prompt?: unknown;
}): string | null {
  // A stored prompt can declare tools that the checks below never see.
  if (body.prompt !== undefined) return 'Stored prompts are not available';
  // Usage is priced at standard rates when the response finishes. A background request finishes
  // after its response returns, and other service tiers bill at other rates.
  if (body.background !== undefined && body.background !== false) {
    return 'Background requests are not available';
  }
  if (
    ![undefined, null, 'auto', 'default'].includes(body.service_tier as string | null | undefined)
  ) {
    return 'Only the default service tier is available';
  }
  const declared = [
    ...(body.tools === undefined ? [] : [body.tools]),
    ...(Array.isArray(body.input) ? (body.input as { type?: unknown; tools?: unknown }[]) : [])
      .filter((item) => item?.type === 'additional_tools')
      .map((item) => item.tools),
  ];
  for (const tools of declared) {
    const refusal = toolsRefusal(tools, CLIENT_TOOL_TYPES);
    if (refusal) return refusal;
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
  const { response_length: _length, ...commandLists } = commands.data;
  const operations = Object.values(commandLists).reduce(
    (total, list) => total + (list?.length ?? 0),
    0,
  );
  // A request without commands would reach the provider without being charged.
  if (operations === 0) return { refusal: SEARCH_REFUSAL };
  // Only the fields Codex sends are forwarded, so the request cannot opt into other billing.
  const { id, model, input, max_output_tokens } = body;
  return {
    forward: {
      id,
      model,
      input,
      max_output_tokens,
      commands: commands.data,
      settings: SEARCH_SETTINGS,
    },
    operations,
  };
}
