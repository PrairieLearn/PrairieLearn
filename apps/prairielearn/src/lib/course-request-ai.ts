import { createOpenAI } from '@ai-sdk/openai';
import { type ModelMessage, Output, generateText } from 'ai';
import { z } from 'zod';

import { formatPrompt } from './ai-util.js';
import { config } from './config.js';

const legitimacySchema = z.object({
  summary: z
    .string()
    .describe(
      '1-2 sentences describing what you found or did not find, explicitly noting any discrepancies between the account and form information.',
    ),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe(
      '"high" if you found direct evidence (e.g. a faculty page), "medium" for indirect evidence, "low" if you found little or nothing.',
    ),
  legitimate: z
    .boolean()
    .describe(
      'true if you found clear evidence they work at this institution, false if you could not.',
    ),
});

const timezoneSchema = z.object({
  reasoning: z
    .string()
    .describe(
      "1-2 sentences explaining how you identified the institution's location and timezone.",
    ),
  timezone: z
    .string()
    .describe(
      'A valid IANA tz database identifier (e.g. "America/Chicago", "Europe/London"). Always use a city-based timezone, never a UTC offset.',
    ),
});

const prefixSchema = z.object({
  reasoning: z
    .string()
    .describe(
      "Explain how you identified the institution's primary domain and derived the prefix.",
    ),
  prefix: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9]+$/)
    .describe('Lowercase only, no spaces or special characters.'),
});

interface AiSource {
  url: string;
  title?: string;
}

type LegitimacyResult = z.infer<typeof legitimacySchema> & { sources: AiSource[] };
type TimezoneResult = z.infer<typeof timezoneSchema> & { sources: AiSource[] };
type PrefixResult = z.infer<typeof prefixSchema> & { sources: AiSource[] };

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

  const response = await generateText({
    model: openai.responses('gpt-4o-mini'),
    output: Output.object({ schema: legitimacySchema }),
    messages: input,
    tools: { web_search: openai.tools.webSearch({}) },
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

  const response = await generateText({
    model: openai.responses('gpt-4o-mini'),
    output: Output.object({ schema: timezoneSchema }),
    messages: input,
    tools: { web_search: openai.tools.webSearch({}) },
  });

  return {
    ...response.output,
    sources: response.sources
      .filter((s) => s.sourceType === 'url')
      .map((s) => ({ url: s.url, title: s.title })),
  };
}

export async function suggestInstitutionPrefix({
  institutionLongName,
  institutionShortName,
  emailDomain,
}: {
  institutionLongName: string;
  institutionShortName: string;
  emailDomain: string;
}): Promise<PrefixResult> {
  const openai = createCourseRequestAiClient();

  const input: ModelMessage[] = [
    {
      role: 'system',
      content: formatPrompt([
        'You are helping a PrairieLearn administrator name a GitHub repository for a new course.',
        'Repository names follow the pattern "pl-{institution-prefix}-{course-name}". Your job is to determine the correct institution prefix.',
        'Identify the institution as a whole, NOT a department. For example, if the domain is "cs.illinois.edu", the prefix is "uiuc" (not "cs").',
        'Derive the prefix from the institution\'s primary domain name. For example, "berkeley.edu" gives "berkeley", "ubc.ca" gives "ubc".',
        "Search the web to find the institution's primary domain if it is not obvious from the email domain.",
        'You MUST always return a non-empty prefix. If the domain or institution is unfamiliar, derive the best short prefix you can from the available information (e.g. the domain name itself). Never refuse or return an empty prefix.',
      ]),
    },
    {
      role: 'user',
      content: formatPrompt([
        `Institution name: ${institutionLongName}`,
        `Institution short name: ${institutionShortName}`,
        `Email domain: ${emailDomain}`,
      ]),
    },
  ];

  const response = await generateText({
    model: openai.responses('gpt-4o-mini'),
    output: Output.object({ schema: prefixSchema }),
    messages: input,
    tools: { web_search: openai.tools.webSearch({}) },
  });

  return {
    ...response.output,
    sources: response.sources
      .filter((s) => s.sourceType === 'url')
      .map((s) => ({ url: s.url, title: s.title })),
  };
}
