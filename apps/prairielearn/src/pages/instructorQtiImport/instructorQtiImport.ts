import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Router } from 'express';
import * as tmp from 'tmp-promise';
import * as unzipper from 'unzipper';

import { HttpStatusError } from '@prairielearn/error';
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
import { discoverInfoDirs } from '../../lib/discover-info-dirs.js';
import { features } from '../../lib/features/index.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';

import { InstructorQtiImport } from './instructorQtiImport.html.js';
import type {
  SerializedConversionResult,
  StrippedAccessRules,
  UploadResponse,
} from './instructorQtiImport.types.js';

const router = Router();

// Gate all routes behind the feature flag.
router.use(
  typedAsyncHandler<'course-instance'>(async (req, res, next) => {
    const enabled = await features.enabledFromLocals('qti-content-import', res.locals);
    if (!enabled) {
      throw new HttpStatusError(403, 'QTI content import is not enabled for this course');
    }
    next();
  }),
);

router.get(
  '/',
  typedAsyncHandler<'course-instance'>(async (req, res) => {
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
      InstructorQtiImport({
        resLocals: res.locals,
        csrfToken: uploadCsrfToken,
        trpcCsrfToken,
      }),
    );
  }),
);

router.post(
  '/upload',
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    try {
      if (!res.locals.authz_data.has_course_permission_edit) {
        res.status(403).json({ error: 'Access denied (must be course editor)' });
        return;
      }
      if (res.locals.course.example_course) {
        res.status(403).json({ error: 'Cannot import into the example course' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const ext = path.extname(file.originalname).toLowerCase();
      if (ext !== '.zip' && ext !== '.imscc') {
        res.status(400).json({ error: 'File must be a .zip or .imscc file' });
        return;
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
          res
            .status(400)
            .json({ error: 'No QTI assessment files found in the uploaded archive' });
          return;
        }

        // Try to read rubrics from course_settings/rubrics.xml.
        let rubricsXml: string | undefined;
        try {
          rubricsXml = await readFile(
            path.join(tempDir, 'course_settings', 'rubrics.xml'),
            'utf-8',
          );
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

        // Strip access rules (time limits, passwords, dates) from imported assessments
        // and track what was removed so the UI can inform the user.
        const stripped: StrippedAccessRules = {
          hasTimeLimits: false,
          hasPasswords: false,
          hasDates: false,
        };

        for (const result of results) {
          const rules = result.assessment.infoJson.allowAccess;
          if (rules) {
            for (const rule of rules) {
              if (rule.timeLimitMin) stripped.hasTimeLimits = true;
              if (rule.password) stripped.hasPasswords = true;
              if (rule.startDate ?? rule.endDate) stripped.hasDates = true;
            }
          }
          // Replace with an empty access rule set.
          result.assessment.infoJson.allowAccess = [];
        }

        // Scan existing question directories to detect collisions.
        const questionsDir = path.join(res.locals.course.path, 'questions');
        let existingQuestionDirs: string[] = [];
        try {
          existingQuestionDirs = await discoverInfoDirs(questionsDir, 'info.json');
        } catch {
          // Questions directory may not exist yet.
        }

        const response: UploadResponse = {
          results,
          courseExportInfo: courseExportInfo ?? undefined,
          existingQuestionDirs,
          strippedAccessRules: stripped,
        };

        res.json(response);
      } finally {
        await cleanup();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      res.status(500).json({ error: message });
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
    preview = await convert(xmlContent, baseOptions);
  } catch {
    return null;
  }

  const assessmentSlug = slugify(preview.assessmentTitle);
  const questionPrefix = `imported/${assessmentSlug}`;

  // Second pass with the correct question ID prefix.
  const result = await convert(xmlContent, {
    ...baseOptions,
    tags: ['imported'],
    questionIdPrefix: questionPrefix,
  });

  return serializeConversionResult(result, questionPrefix, webResourcesDir);
}

/** Serialize a ConversionResult for JSON transport. */
async function serializeConversionResult(
  result: ConversionResult,
  questionPrefix: string,
  webResourcesDir: string,
): Promise<SerializedConversionResult> {
  return {
    assessmentTitle: result.assessmentTitle,
    assessment: {
      directoryName: result.assessment.directoryName,
      infoJson: result.assessment.infoJson,
    },
    questions: await Promise.all(
      result.questions.map(async (q) => ({
        // The converter emits local directory names (e.g. "q1"), but on disk
        // questions live under the prefix path (e.g. "imported/quiz-slug/q1").
        // This must match the IDs used in the assessment zones.
        directoryName: `${questionPrefix}/${q.directoryName}`,
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
