import type { PrintSettings } from '../../printing/print-packet-schema.js';

import { printIdentityFields } from './print-cover.js';

export interface PrintPreparationQuestion {
  number: string;
  title: string;
  questionId: string;
  points: number;
  concerns: string[];
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paperSize: 'Letter',
  includeCoverPage: true,
  includeGradingTable: false,
  includeHonorCode: true,
  identityFields: 'Student ID\nSection',
  blockSize: 'auto',
  questionSizes: {},
  excludedQuestions: [],
};

export function printLayoutSearch(settings: PrintSettings): string {
  const search = new URLSearchParams({
    paper_size: settings.paperSize,
    block_size: settings.blockSize,
  });
  if (settings.includeCoverPage) {
    search.set('include_honor_code', String(settings.includeHonorCode));
    if (settings.includeGradingTable) search.set('grading_table', 'true');
    for (const field of printIdentityFields(settings.identityFields)) {
      search.append('identity_field', field);
    }
  } else {
    search.set('include_cover', 'false');
  }
  for (const [number, size] of Object.entries(settings.questionSizes)) {
    if (size) search.append('question_block_size', `${number}:${size}`);
  }
  for (const number of settings.excludedQuestions) {
    search.append('exclude_question', number);
  }
  return search.toString();
}
