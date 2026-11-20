import { z } from 'zod';

import { generateSignedToken, getCheckedSignedTokenData } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../../lib/config.js';
import { getMcpResource } from '../lib/oauth/config.js';

// Long enough to start a download right after the tool call, short enough that a link repeated
// somewhere else is soon useless.
const DOWNLOAD_LINK_LIFETIME_MS = 5 * 60 * 1000;

// A longer request, such as one with a very long `in` list, would make an unusable URL.
const MAX_DOWNLOAD_TOKEN_LENGTH = 6000;

const CourseDataDownloadSchema = z.object({
  type: z.literal('mcp-course-data'),
  user_id: IdSchema,
  oauth_grant_id: IdSchema,
  course_id: IdSchema,
  dataset: z.string(),
  request: z.unknown(),
});
type CourseDataDownload = Omit<z.infer<typeof CourseDataDownloadSchema>, 'type'>;

/**
 * A link to one course data query's full result, for a result too large for a tool reply. The
 * link carries the signed query, so any PrairieLearn server can answer it without stored state,
 * and it holds no access token. Returns null if the query is too long to put in a link.
 */
export function createCourseDataDownloadUrl(download: CourseDataDownload) {
  const token = generateSignedToken({ type: 'mcp-course-data', ...download }, config.secretKey);
  if (token.length > MAX_DOWNLOAD_TOKEN_LENGTH) return null;
  return `${getMcpResource()}/downloads/${encodeURIComponent(token)}`;
}

export function readCourseDataDownload(token: string): CourseDataDownload | null {
  const data = getCheckedSignedTokenData(token, config.secretKey, {
    maxAge: DOWNLOAD_LINK_LIFETIME_MS,
  });
  const parsed = CourseDataDownloadSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
