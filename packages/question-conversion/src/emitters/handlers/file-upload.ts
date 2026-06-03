import he from 'he';

import type { IRQuestionBody } from '../../types/ir.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';

type FileUploadBody = Extract<IRQuestionBody, { type: 'file-upload' }>;

export const fileUploadHandler: BodyEmitHandler = {
  bodyType: 'file-upload',

  renderHtml(body) {
    const f = body as FileUploadBody;
    if (f.allowedExtensions?.length) {
      const patterns = f.allowedExtensions.map((ext) => `*.${ext}`).join(',');
      return `<pl-file-upload file-patterns="${he.escape(patterns)}"></pl-file-upload>`;
    }
    return '<pl-file-upload file-patterns="*"></pl-file-upload>';
  },
};
