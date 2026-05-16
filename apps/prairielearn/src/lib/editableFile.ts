import * as path from 'node:path';

// @ts-expect-error No types for ace-code/src/ext/modelist.js
import { getModeForPath } from 'ace-code/src/ext/modelist.js';
import fs from 'fs-extra';
import { isBinaryFile } from 'isbinaryfile';

import { b64EncodeUnicode } from './base64-util.js';
import {
  computeFileContentHash,
  getFileMetadataForPath,
  isV3QuestionHtmlFile,
} from './editorUtil.js';
import type { FileMetadata } from './editorUtil.shared.js';

interface EditableTextFile {
  fileName: string;
  normalizedFileName: string;
  contents: string;
  contentHash: string;
  aceMode: string;
  fileMetadata: FileMetadata;
  lintHtmlMustache: boolean;
}

export async function readEditableTextFile({
  courseId,
  coursePath,
  fullPath,
  courseRelativePath,
}: {
  courseId: string;
  coursePath: string;
  fullPath: string;
  courseRelativePath: string;
}): Promise<EditableTextFile> {
  const contents = await fs.readFile(fullPath);
  if (await isBinaryFile(contents)) {
    throw new Error('Cannot edit binary file');
  }

  const stringContents = contents.toString('utf8');
  const encodedContents = b64EncodeUnicode(stringContents);
  const lintHtmlMustache = await isV3QuestionHtmlFile(coursePath, courseRelativePath);

  return {
    fileName: path.basename(courseRelativePath),
    normalizedFileName: path.normalize(courseRelativePath),
    contents: encodedContents,
    contentHash: computeFileContentHash(stringContents),
    aceMode: lintHtmlMustache ? 'ace/mode/handlebars' : getModeForPath(courseRelativePath).mode,
    fileMetadata: await getFileMetadataForPath(courseId, courseRelativePath),
    lintHtmlMustache,
  };
}
