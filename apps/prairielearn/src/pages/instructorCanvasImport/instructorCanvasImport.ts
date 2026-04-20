import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Router } from 'express';
import * as tmp from 'tmp-promise';
import * as unzipper from 'unzipper';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import {
  type ConversionResult,
  type QtiFileEntry,
  convert,
  detectCourseExport,
  findQtiFilesFromManifest,
  slugify,
} from '@prairielearn/question-conversion';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getCourseInstanceTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';

import { InstructorCanvasImport } from './instructorCanvasImport.html.js';
import type { SerializedConversionResult, UploadResponse } from './instructorCanvasImport.types.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

const ImportedAssessmentRowSchema = z.object({
  id: z.coerce.string(),
  tid: z.string(),
  title: z.string(),
  type: z.string(),
  question_count: z.number(),
});

router.get(
  '/',
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const importedAssessments = await queryRows(
      sql.select_imported_assessments,
      { course_instance_id: res.locals.course_instance.id },
      ImportedAssessmentRowSchema,
    );

    const trpcCsrfToken = generatePrefixCsrfToken(
      {
        url: getCourseInstanceTrpcUrl(res.locals.course_instance.id),
        authn_user_id: res.locals.authn_user.id,
      },
      config.secretKey,
    );

    // Generate a prefix-based CSRF token for the upload endpoint.
    // The page URL is a prefix of /upload, so this covers both.
    const uploadCsrfToken = generatePrefixCsrfToken(
      {
        url: req.baseUrl,
        authn_user_id: res.locals.authn_user.id,
      },
      config.secretKey,
    );

    res.send(
      InstructorCanvasImport({
        resLocals: res.locals,
        importedAssessments,
        csrfToken: uploadCsrfToken,
        trpcCsrfToken,
      }),
    );
  }),
);

router.post(
  '/upload',
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be course editor)');
    }
    if (res.locals.course.example_course) {
      throw new HttpStatusError(403, 'Cannot import into the example course');
    }

    const file = req.file;
    if (!file) {
      throw new HttpStatusError(400, 'No file uploaded');
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.zip' && ext !== '.imscc') {
      throw new HttpStatusError(400, 'File must be a .zip or .imscc file');
    }

    const { path: tempDir, cleanup } = await tmp.dir({ unsafeCleanup: true });
    try {
      // Extract the archive to the temp directory.
      const directory = await unzipper.Open.buffer(file.buffer);
      await directory.extract({ path: tempDir });

      // Detect if this is a course export.
      const courseExportInfo = (await detectCourseExport(tempDir)) ?? undefined;

      // Find QTI assessment files.
      const manifestEntries = await findQtiFilesFromManifest(tempDir);
      const entries: QtiFileEntry[] =
        manifestEntries.length > 0
          ? manifestEntries
          : (await findQtiXmlFiles(tempDir)).map((p) => ({
              qtiPath: p,
              assessmentDir: path.dirname(p),
            }));

      if (entries.length === 0) {
        throw new HttpStatusError(400, 'No QTI assessment files found in the uploaded archive');
      }

      // Try to read rubrics from course_settings/rubrics.xml.
      let rubricsXml: string | undefined;
      try {
        rubricsXml = await readFile(path.join(tempDir, 'course_settings', 'rubrics.xml'), 'utf-8');
      } catch {
        // Not present in quiz-only exports.
      }

      // Convert each assessment.
      const results: SerializedConversionResult[] = [];
      for (const entry of entries) {
        const result = await convertEntry(entry, rubricsXml);
        if (result) {
          results.push(result);
        }
      }

      const response: UploadResponse = {
        results,
        courseExportInfo: courseExportInfo ?? undefined,
      };

      res.json(response);
    } finally {
      await cleanup();
    }
  }),
);

/** Convert a single QTI assessment entry to a serialized result. */
async function convertEntry(
  entry: QtiFileEntry,
  rubricsXml?: string,
): Promise<SerializedConversionResult | null> {
  const xmlContent = await readFile(entry.qtiPath, 'utf-8');
  const webResourcesDir = path.join(entry.assessmentDir, '..', 'web_resources');

  // Read assessment_meta.xml if present.
  let assessmentMetaXml: string | undefined;
  try {
    assessmentMetaXml = await readFile(
      path.join(entry.assessmentDir, 'assessment_meta.xml'),
      'utf-8',
    );
  } catch {
    // Not present.
  }

  const baseOptions = {
    basePath: entry.assessmentDir,
    assessmentMetaXml,
    rubricsXml,
  };

  // First pass to get the assessment title for building the question prefix.
  let preview: ConversionResult;
  try {
    preview = convert(xmlContent, baseOptions);
  } catch {
    return null;
  }

  const assessmentSlug = slugify(preview.assessmentTitle);
  const questionPrefix = `imported/${assessmentSlug}`;

  // Second pass with the correct question ID prefix.
  const result = convert(xmlContent, {
    ...baseOptions,
    tags: ['imported', 'qti'],
    questionIdPrefix: questionPrefix,
  });

  return serializeConversionResult(result, webResourcesDir);
}

/** Serialize a ConversionResult for JSON transport. */
async function serializeConversionResult(
  result: ConversionResult,
  webResourcesDir: string,
): Promise<SerializedConversionResult> {
  return {
    assessmentTitle: result.assessmentTitle,
    assessment: {
      directoryName: result.assessment.directoryName,
      infoJson: result.assessment.infoJson,
      rubricJson: result.assessment.rubricJson,
    },
    questions: await Promise.all(
      result.questions.map(async (q) => ({
        directoryName: q.directoryName,
        sourceId: q.sourceId,
        infoJson: q.infoJson,
        questionHtml: q.questionHtml,
        serverPy: q.serverPy,
        clientFiles: await serializeClientFiles(q.clientFiles, webResourcesDir),
      })),
    ),
    warnings: result.warnings,
  };
}

/** Convert a Map<string, Buffer|string> to Record<string, string> (base64-encoded). */
async function serializeClientFiles(
  clientFiles: Map<string, Buffer | string>,
  webResourcesDir: string,
): Promise<Record<string, string>> {
  const serialized: Record<string, string> = {};
  for (const [name, content] of clientFiles) {
    if (Buffer.isBuffer(content)) {
      serialized[name] = content.toString('base64');
    } else {
      // Content is a relative path to a file in web_resources.
      try {
        const fileContent = await readFile(path.join(webResourcesDir, content));
        serialized[name] = fileContent.toString('base64');
      } catch {
        // File not found; skip.
      }
    }
  }
  return serialized;
}

const NON_QTI_XML_FILES = new Set(['assessment_meta.xml', 'imsmanifest.xml']);

/** Heuristic fallback: find QTI XML files by scanning directories. */
async function findQtiXmlFiles(dir: string): Promise<string[]> {
  const { readdir, stat } = await import('node:fs/promises');
  const entries = await readdir(dir);

  const directXml = entries.find((f) => f.endsWith('.xml') && !NON_QTI_XML_FILES.has(f));
  if (directXml) {
    return [path.join(dir, directXml)];
  }

  const xmlFiles: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry);
    const entryStat = await stat(entryPath);
    if (entryStat.isDirectory()) {
      const subEntries = await readdir(entryPath);
      const xml = subEntries.find((f) => f.endsWith('.xml') && !NON_QTI_XML_FILES.has(f));
      if (xml) {
        xmlFiles.push(path.join(entryPath, xml));
      }
    }
  }
  return xmlFiles;
}

export default router;
