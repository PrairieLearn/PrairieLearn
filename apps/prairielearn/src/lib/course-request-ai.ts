import { createOpenAI } from '@ai-sdk/openai';
import { type ModelMessage, Output, generateText } from 'ai';
import { z } from 'zod';

import { formatPrompt } from './ai-util.js';
import { config } from './config.js';

const legitimacySchema = z.object({
  isLikely: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
  summary: z.string(),
});

const timezoneSchema = z.object({
  timezone: z.string(),
  reasoning: z.string(),
});

const prefixSchema = z.object({
  prefix: z.string(),
  reasoning: z.string(),
});

interface AiSource {
  url: string;
  title?: string;
}

export type LegitimacyResult = z.infer<typeof legitimacySchema> & { sources: AiSource[] };
export type TimezoneResult = z.infer<typeof timezoneSchema> & { sources: AiSource[] };
export type PrefixResult = z.infer<typeof prefixSchema> & { sources: AiSource[] };

function createCourseRequestAiClient() {
  if (!config.administratorOpenAiApiKey) {
    throw new Error('administratorOpenAiApiKey is not configured');
  }
  return createOpenAI({
    apiKey: config.administratorOpenAiApiKey,
    organization: config.administratorOpenAiOrganization ?? undefined,
  });
}

export async function checkInstructorLegitimacy({
  instructorFirstName,
  instructorLastName,
  instructorEmail,
  institution,
  userDisplayName,
  userUid,
}: {
  instructorFirstName: string | null;
  instructorLastName: string | null;
  instructorEmail: string | null;
  institution: string | null;
  userDisplayName: string | null;
  userUid: string;
}): Promise<LegitimacyResult> {
  const openai = createCourseRequestAiClient();

  const input: ModelMessage[] = [
    {
      role: 'system',
      content: formatPrompt([
        'You are helping a PrairieLearn administrator vet a course creation request.',
        'Search the web to determine whether the person described by the user is a legitimate academic instructor or researcher at their stated institution.',
        'Use sources like faculty pages, staff directories, university websites, or professional profiles (e.g. LinkedIn, Google Scholar).',
        'The user provides both the name entered on the course request form and the name on their PrairieLearn account. If the PrairieLearn account name or email differs significantly from the submitted name and work email, lower your confidence accordingly and treat it as a reason to doubt the request.',
        'For each field in your response:',
        '- isLikely: true if you found clear evidence they work at this institution, false if you could not',
        '- confidence: "high" if you found direct evidence (e.g. a faculty page), "medium" for indirect evidence, "low" if you found little or nothing',
        '- summary: 1-2 sentences describing what you found or did not find, explicitly noting any discrepancies between the account and form information',
      ]),
    },
    {
      role: 'user',
      content: formatPrompt([
        `Name (from form): ${instructorFirstName ?? 'Unknown'} ${instructorLastName ?? 'Unknown'}`,
        `Work email (from form): ${instructorEmail ?? 'Unknown'}`,
        `Institution (from form): ${institution ?? 'Unknown'}`,
        `PrairieLearn account name: ${userDisplayName ?? 'Unknown'}`,
        `PrairieLearn account email/uid: ${userUid}`,
      ]),
    },
  ];

  const schema = legitimacySchema;

  const response = await generateText({
    model: openai.chat('gpt-4o-search-preview'),
    output: Output.object({ schema }),
    messages: input,
  });

  return {
    ...response.output,
    sources: response.sources
      .filter((s) => s.sourceType === 'url')
      .map((s) => ({ url: s.url, title: s.title })),
  };
}

export async function suggestTimezone({
  emailDomain,
  institutionName,
}: {
  emailDomain: string;
  institutionName: string;
}): Promise<TimezoneResult> {
  const openai = createCourseRequestAiClient();

  const input: ModelMessage[] = [
    {
      role: 'system',
      content: formatPrompt([
        'You are helping a PrairieLearn administrator configure a new institution.',
        'Search the web to determine the correct timezone for the institution provided by the user.',
        'Return the timezone as a valid IANA tz database identifier (e.g. "America/Chicago", "Europe/London").',
        'Always use a city-based timezone, never a UTC offset.',
        "In the reasoning field, write 1-2 sentences explaining how you identified the institution's location and timezone.",
      ]),
    },
    {
      role: 'user',
      content: formatPrompt([
        `Institution name: ${institutionName}`,
        `Email domain: ${emailDomain}`,
      ]),
    },
  ];

  const schema = timezoneSchema;

  const response = await generateText({
    model: openai.chat('gpt-4o-search-preview'),
    output: Output.object({ schema }),
    messages: input,
  });

  return {
    ...response.output,
    sources: response.sources
      .filter((s) => s.sourceType === 'url')
      .map((s) => ({ url: s.url, title: s.title })),
  };
}

export async function suggestPrefixFromEmailDomain({
  emailDomain,
  institutionName,
}: {
  emailDomain: string;
  institutionName: string;
}): Promise<PrefixResult> {
  const openai = createCourseRequestAiClient();

  const input: ModelMessage[] = [
    {
      role: 'system',
      content: formatPrompt([
        'You are helping a PrairieLearn administrator name a GitHub repository for a new course.',
        'Repository names follow the pattern "pl-{institution-prefix}-{course-name}". Your job is to determine the correct institution prefix.',
        'Rules for the prefix:',
        '- Identify the institution as a whole, NOT a department. For example, if the domain is "cs.illinois.edu", the prefix is "uiuc" (not "cs").',
        '- Use the institution\'s widely-recognized abbreviation (e.g. "mit", "ubc", "eth", "uiuc").',
        '- Search the web to confirm the abbreviation, especially for lesser-known institutions.',
        '- Lowercase only, no spaces or special characters, max 10 characters.',
        'In the reasoning field, explain how you identified the institution and chose the abbreviation.',
      ]),
    },
    {
      role: 'user',
      content: formatPrompt([
        `Institution name: ${institutionName}`,
        `Email domain: ${emailDomain}`,
      ]),
    },
  ];

  const schema = prefixSchema;

  const response = await generateText({
    messages: input,
    output: Output.object({ schema }),
    model: openai.chat('gpt-4o-search-preview'),
  });

  return {
    ...response.output,
    sources: response.sources
      .filter((s) => s.sourceType === 'url')
      .map((s) => ({ url: s.url, title: s.title })),
  };
}
