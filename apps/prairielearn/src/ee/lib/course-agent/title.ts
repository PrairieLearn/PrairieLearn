/**
 * The title a conversation has until the course agent generates one from its first message.
 * Collapses whitespace and truncates by code point so emoji are never split.
 */
export function formatCourseAgentConversationTitle(text: string) {
  const maxLength = 80;
  const codePoints = [...text.replaceAll(/\s+/g, ' ').trim()];
  if (codePoints.length <= maxLength) return codePoints.join('');
  return `${codePoints.slice(0, maxLength - 3).join('')}...`;
}
