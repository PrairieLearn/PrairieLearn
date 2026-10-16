import { formatDateYMD } from '@prairielearn/formatter';

export function formatCourseAgentDate(date: Date, timezone: string, includeTz = true) {
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: includeTz ? 'short' : undefined,
  }).format(date);
  return `${formatDateYMD(date, timezone)} ${time}`;
}
