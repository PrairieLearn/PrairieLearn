import { createHash } from 'node:crypto';

import { markdownToHtml } from '@prairielearn/markdown';
import { escapeRegExp } from '@prairielearn/sanitize';

import { renderText as renderAssessmentText } from '../assessment.js';
import type { Assessment } from '../db-types.js';
import { getDefaultHonorCodePledge } from '../honor-code.js';
import { renderMustache } from '../mustache.js';
import type { ResLocalsForPage } from '../res-locals.js';

import {
  type PrintableCover,
  type PrintableCoverField,
  type PrintableTextBlock,
  htmlToTextBlocks,
} from './printable-cover.js';

import type { PrintDocument } from './index.js';

export const HONOR_CODE_HEADING = 'Honor code';
export const PRINT_FOOTER_SEPARATOR = '\u00a0\u00a0|\u00a0\u00a0';

export interface PrintFooter {
  left: string;
  center: string;
  right: string;
}

/** Leaves space for a handwritten name on printed honor-code pledges. */
export const BLANK_NAME_PLACEHOLDER = '____________________________';

/** Renders the assessment text that the default cover includes. */
export function getPrintCoverHtml(assessment: Assessment, urlPrefix: string) {
  return {
    assessmentTextHtml: renderAssessmentText(assessment, urlPrefix),
    honorCodeHtml: assessment.honor_code
      ? markdownToHtml(
          renderMustache(assessment.honor_code, { user_name: BLANK_NAME_PLACEHOLDER }),
          { allowHtml: false, interpretMath: false },
        ).replace(new RegExp(`^<h([1-6])>${escapeRegExp(HONOR_CODE_HEADING)}</h\\1>\\s*`, 'i'), '')
      : null,
  };
}

/**
 * Word exports rebuild the cover from current assessment text, so previews sign this digest
 * to reject Word exports after the text changes.
 */
export function digestPrintCoverHtml(cover: ReturnType<typeof getPrintCoverHtml>): string {
  return createHash('sha256').update(JSON.stringify(cover)).digest('hex');
}

export const DEFAULT_ASSESSMENT_INSTRUCTIONS: readonly string[] = [
  'Write your name and identifying information clearly above.',
  'Answer each question as directed. Show your work where requested.',
  'If you need more room, identify the question number on any additional page.',
];

export function answerKeyDescription(formLabel: string): string {
  return `This key shows any answers provided by the questions in Form ${formLabel}.`;
}

export function getPrintCoverFields({
  identityFields,
  teamWork,
}: {
  identityFields: readonly string[];
  teamWork: boolean;
}): PrintableCoverField[] {
  return [
    { label: 'Name', wide: true },
    ...identityFields.map((label) => ({ label })),
    ...(teamWork ? [{ label: 'Team' }] : []),
    { label: 'Date', wide: !teamWork && identityFields.length === 0 },
  ];
}

export function getPrintFooterLabel({
  document,
  formLabel,
}: {
  document: PrintDocument;
  formLabel: string;
}): string {
  return `${document === 'answer_key' ? `Answer key${PRINT_FOOTER_SEPARATOR}` : ''}Form ${formLabel}`;
}

export function getPrintFooter({
  resLocals,
  document,
  formLabel,
}: {
  resLocals: ResLocalsForPage<'print-form'>;
  document: PrintDocument;
  formLabel: string;
}): PrintFooter {
  return {
    left: [
      resLocals.course.title ?? resLocals.course.short_name,
      resLocals.course_instance.long_name ?? resLocals.course_instance.short_name,
    ]
      .filter(Boolean)
      .join(PRINT_FOOTER_SEPARATOR),
    center: resLocals.assessment.title || resLocals.assessment_label,
    right: getPrintFooterLabel({ document, formLabel }),
  };
}

/**
 * Builds the cover content used by non-HTML outputs. The HTML cover in
 * `instructorAssessmentPrintForm.html.ts` renders the same labels, instructions, and pledge
 * through the helpers above; author-provided HTML is converted to formatted text blocks here.
 */
export function buildPrintableCover({
  resLocals,
  document,
  formLabel,
  identityFields,
  questionCount,
  maxPoints,
  assessmentTextHtml,
  honorCodeHtml,
  includeHonorCode,
  gradingTable,
}: {
  resLocals: ResLocalsForPage<'print-form'>;
  document: PrintDocument;
  formLabel: string;
  identityFields: readonly string[];
  questionCount: number;
  maxPoints: number;
  assessmentTextHtml: string | null;
  honorCodeHtml: string | null;
  includeHonorCode: boolean;
  gradingTable?: PrintableCover['gradingTable'];
}): PrintableCover {
  const isAnswerKey = document === 'answer_key';
  const teamWork = resLocals.assessment.team_work;

  const instructionBlocks: PrintableTextBlock[] = [
    isAnswerKey
      ? { type: 'paragraph', runs: [{ text: answerKeyDescription(formLabel) }] }
      : {
          type: 'list',
          ordered: true,
          items: DEFAULT_ASSESSMENT_INSTRUCTIONS.map((text) => [{ text }]),
        },
    ...(assessmentTextHtml ? htmlToTextBlocks(assessmentTextHtml) : []),
  ];
  const sections: PrintableCover['sections'] = [
    { heading: isAnswerKey ? 'About this answer key' : 'Instructions', blocks: instructionBlocks },
  ];
  if (!isAnswerKey && includeHonorCode) {
    sections.push({
      heading: HONOR_CODE_HEADING,
      blocks: honorCodeHtml
        ? htmlToTextBlocks(honorCodeHtml)
        : [
            {
              type: 'list',
              ordered: false,
              items: getDefaultHonorCodePledge({
                name: BLANK_NAME_PLACEHOLDER,
                groupWork: teamWork,
              }).map((text) => [{ text }]),
            },
          ],
      signatureLabel: 'Signature',
    });
  }

  return {
    eyebrow: resLocals.course.short_name ?? '',
    eyebrowDetail: resLocals.course.title ?? resLocals.course_instance.long_name ?? undefined,
    title: resLocals.assessment_label,
    subtitle: resLocals.assessment.title ?? undefined,
    documentLabel: isAnswerKey ? 'Answer key' : undefined,
    fields: isAnswerKey ? [] : getPrintCoverFields({ identityFields, teamWork }),
    summary: [
      { term: 'Questions', value: String(questionCount) },
      { term: 'Points', value: String(maxPoints) },
      { term: 'Form', value: formLabel },
    ],
    sections,
    gradingTable: isAnswerKey ? undefined : gradingTable,
  };
}
