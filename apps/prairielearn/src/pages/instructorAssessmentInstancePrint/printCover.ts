import {
  type PrintableCover,
  type PrintableCoverField,
  type PrintableCoverSection,
  type PrintableTextBlock,
  htmlToTextBlocks,
} from '@prairielearn/printing';

import type { PrintDocument } from '../../lib/printing.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export const DEFAULT_EXAM_INSTRUCTIONS: readonly string[] = [
  'Write your name and identifying information clearly above.',
  'Show your work and place each final answer in the space provided.',
  'If you need more room, identify the question number on any additional page.',
];

export function answerKeyDescription(formId: string): string {
  return `Correct answers are shown with the questions for assessment Form ID ${formId}.`;
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

export function getDefaultHonorCodePledge(teamWork: boolean): string[] {
  return [
    `I certify that I am ____________________________ and ${teamWork ? 'our group is' : 'I am'} allowed to take this assessment.`,
    `${teamWork ? 'We' : 'I'} pledge on ${teamWork ? 'our' : 'my'} honor that ${teamWork ? 'we' : 'I'} will not give or receive any unauthorized assistance on this assessment and that all work will be ${teamWork ? 'our' : 'my'} own.`,
  ];
}

export function getPrintFooterLabel({
  document,
  formId,
}: {
  document: PrintDocument;
  formId: string;
}): string {
  return `${document === 'answer_key' ? 'Answer key  |  ' : ''}Form ID ${formId}`;
}

/**
 * Builds the cover content used by non-HTML outputs. The HTML cover in
 * `instructorAssessmentInstancePrint.html.ts` renders the same labels, instructions, and pledge
 * through the helpers above; author-provided HTML is reduced to plain text blocks here.
 */
export function buildPrintableCover({
  resLocals,
  document,
  identityFields,
  questionCount,
  maxPoints,
  assessmentTextHtml,
  honorCodeHtml,
}: {
  resLocals: ResLocalsForPage<'assessment-instance'>;
  document: PrintDocument;
  identityFields: readonly string[];
  questionCount: number;
  maxPoints: number;
  assessmentTextHtml: string | null;
  honorCodeHtml: string | null;
}): PrintableCover {
  const isAnswerKey = document === 'answer_key';
  const formId = resLocals.assessment_instance.id;
  const teamWork = resLocals.assessment.team_work;

  const instructionBlocks: PrintableTextBlock[] = [
    isAnswerKey
      ? { type: 'paragraph', text: answerKeyDescription(formId) }
      : { type: 'list', ordered: true, items: [...DEFAULT_EXAM_INSTRUCTIONS] },
    ...(assessmentTextHtml ? htmlToTextBlocks(assessmentTextHtml) : []),
  ];
  const sections: PrintableCoverSection[] = [
    { heading: isAnswerKey ? 'About this answer key' : 'Instructions', blocks: instructionBlocks },
  ];
  if (!isAnswerKey && resLocals.assessment.require_honor_code) {
    sections.push({
      heading: 'Academic integrity pledge',
      blocks: honorCodeHtml
        ? htmlToTextBlocks(honorCodeHtml)
        : [{ type: 'list', ordered: false, items: getDefaultHonorCodePledge(teamWork) }],
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
      { term: 'Form ID', value: formId },
    ],
    sections,
    footer: `${resLocals.course_instance.long_name ?? resLocals.course_instance.short_name}  |  Form ID ${formId}`,
  };
}
