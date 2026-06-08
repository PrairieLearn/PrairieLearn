import type { FileEdit } from '../../lib/db-types.js';
import type { FileMetadata } from '../../lib/editorUtil.shared.js';
import type { EditOutcome } from '../../lib/editors.js';
import type { JobSequenceWithTokens } from '../../lib/server-jobs.types.js';

export interface FileEditorData {
  fileName: string;
  normalizedFileName: string;
  aceMode: string;
  diskContents: string;
  diskHash: string;
  fileMetadata?: FileMetadata;
  lintHtmlMustache: boolean;
}

export interface DraftEdit {
  fileEdit: FileEdit;
  contents: string | undefined;
  hash: string | undefined;
  jobSequence?: JobSequenceWithTokens;
  alertChoice?: boolean;
  outcome?: EditOutcome;
}
