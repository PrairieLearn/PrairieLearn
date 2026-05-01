import type { QTI12ParsedItem } from '../../types/qti12.js';
import type { TransformHandler, TransformResult } from '../transform-registry.js';

import {
  classifyObjectBankAnswer,
  convertSymbolicLatexCommands,
  extractSymbolicVariables,
} from '../../parsers/qti12/qti12-helpers.js';

export const symbolicHandler: TransformHandler<QTI12ParsedItem> = {
  questionType: 'symbolic_question',

  transform(item: QTI12ParsedItem): TransformResult {
    const answerText =
      item.feedbacks.get('general_fb') ?? item.correctConditions[0]?.correctLabelIdent;
    if (!answerText) {
      return {
        body: { type: 'rich-text', gradingMethod: 'Manual' },
        gradingMethod: 'Manual',
        warnings: [
          `symbolic_question "${item.ident}" has no answer text in general_fb; emitting as a manually-graded question.`,
        ],
      };
    }

    const classification = classifyObjectBankAnswer(answerText);
    const canonicalAnswer =
      classification.kind === 'symbolic'
        ? classification.canonicalAnswer
        : convertSymbolicLatexCommands(answerText);
    const variables =
      classification.kind === 'symbolic' && classification.variables
        ? classification.variables
        : extractSymbolicVariables(canonicalAnswer);

    return {
      body: {
        type: 'symbolic',
        correctAnswer: canonicalAnswer,
        variables,
        ...(classification.kind === 'symbolic' && classification.allowSets
          ? { allowSets: true }
          : {}),
      },
    };
  },
};
