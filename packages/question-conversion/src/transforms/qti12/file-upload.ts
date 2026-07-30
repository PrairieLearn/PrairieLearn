import type { QTI12ParsedItem } from '../../types/qti12.js';
import type { TransformHandler, TransformResult } from '../transform-registry.js';

/**
 * File-upload questions ask students to submit a file for manual grading.
 * Maps to pl-file-upload with Manual grading.
 */
export const fileUploadHandler: TransformHandler<QTI12ParsedItem> = {
  questionType: 'file_upload_question',

  transform(_item: QTI12ParsedItem): TransformResult {
    return { body: { type: 'file-upload' } };
  },
};
