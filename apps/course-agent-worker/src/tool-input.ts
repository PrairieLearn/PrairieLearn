const COURSE_DATA_TOOLS = new Set([
  'mcp__prairielearn_data__list_course_data_resources',
  'mcp__prairielearn_data__describe_course_data_resource',
  'mcp__prairielearn_data__query_course_data',
  'mcp__prairielearn_data__get_course_data_result',
]);

export function runtimeEventInputForTool(tool: string, input: unknown) {
  return COURSE_DATA_TOOLS.has(tool) ? input : undefined;
}
