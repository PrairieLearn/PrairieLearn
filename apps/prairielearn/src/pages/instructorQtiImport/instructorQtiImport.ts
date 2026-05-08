import { stat as fsStat, readFile } from 'node:fs/promises';
import path from 'node:path';

import { Router } from 'express';
import * as tmp from 'tmp-promise';
import * as unzipper from 'unzipper';

import { HttpStatusError } from '@prairielearn/error';
import { contains } from '@prairielearn/path-utils';
import {
  type ConversionResult,
  type ConversionWarning,
  PLEmitter,
  QTI12AssessmentParser,
  type QtiFileEntry,
  findQtiFilesFromManifest,
  parseAssessment,
  slugify,
} from '@prairielearn/question-conversion';
import { run } from '@prairielearn/run';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getCourseInstanceTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { discoverInfoDirs } from '../../lib/discover-info-dirs.js';
import { features } from '../../lib/features/index.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { selectAssessmentSetsForCourse } from '../../models/assessment-set.js';
import { selectAssessments } from '../../models/assessment.js';

import { InstructorQtiImport } from './instructorQtiImport.html.js';
import type {
  ParseWarning,
  SerializedConversionResult,
  StrippedAccessRules,
  UploadResponse,
} from './instructorQtiImport.types.js';

const router = Router();

// Gate all routes behind the feature flag and require edit permissions.
router.use(
  typedAsyncHandler<'course-instance'>(async (req, res, next) => {
    const enabled = await features.enabledFromLocals('qti-content-import', res.locals);
    if (!enabled) {
      throw new HttpStatusError(403, 'QTI content import is not enabled for this course');
    }
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be course editor)');
    }
    if (res.locals.course.example_course) {
      throw new HttpStatusError(403, 'Cannot import into the example course');
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
      try {
        const directory = await unzipper.Open.buffer(file.buffer);
        await directory.extract({ path: tempDir });
      } catch {
        throw new HttpStatusError(400, 'The uploaded archive is invalid or corrupt');
      }

      // Find QTI assessment files from the manifest.
      const entries = await findQtiFilesFromManifest(tempDir);
      if (entries.length === 0) {
        throw new HttpStatusError(
          400,
          'No QTI assessment files found in the uploaded archive. The archive must include a valid imsmanifest.xml.',
        );
      }

      // Try to read rubrics from course_settings/rubrics.xml (not present in quiz-only exports).
      const rubricsXml = await run(async () => {
        try {
          return await readFile(path.join(tempDir, 'course_settings', 'rubrics.xml'), 'utf-8');
        } catch {
          return undefined;
        }
      });

      // Convert each assessment, deduplicating slugs so that same-titled
      // assessments (e.g. two "Quiz 1") don't collide on question prefixes.
      const usedSlugs = new Set<string>();
      const results: SerializedConversionResult[] = [];
      const parseWarnings: ParseWarning[] = [];
      for (const entry of entries) {
        const result = await convertEntry(entry, rubricsXml, usedSlugs);
        if (result.ok) {
          results.push(result.value);
        } else {
          parseWarnings.push(result.warning);
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

      // Both discoverInfoDirs and the converter emit relative paths (e.g.
      // "imported/quiz-slug/q1"), so the collision check on the client works
      // by simple string equality.
      const questionsDir = path.join(res.locals.course.path, 'questions');
      let existingQuestionDirs: string[] = [];
      try {
        existingQuestionDirs = await discoverInfoDirs(questionsDir, 'info.json');
      } catch {
        // Questions directory may not exist yet.
      }

      const [assessmentSets, assessmentRows] = await Promise.all([
        selectAssessmentSetsForCourse(res.locals.course.id),
        selectAssessments({ course_instance_id: res.locals.course_instance.id }),
      ]);

      const response: UploadResponse = {
        results,
        parseWarnings,
        existingQuestionDirs,
        strippedAccessRules: stripped,
        assessmentSetNames: assessmentSets.map((s) => s.name),
        existingAssessmentLabels: assessmentRows.map((r) => ({
          set: r.assessment_set.name,
          number: r.number,
        })),
      };

      res.json(response);
    } finally {
      await cleanup();
    }
  }),
);

type ConvertEntryResult =
  | { ok: true; value: SerializedConversionResult }
  | { ok: false; warning: ParseWarning };

/** Convert a single QTI assessment entry to a serialized result. */
async function convertEntry(
  entry: QtiFileEntry,
  rubricsXml: string | undefined,
  usedSlugs: Set<string>,
): Promise<ConvertEntryResult> {
  const xmlContent = await readFile(entry.qtiPath, 'utf-8');

  // Resolve web_resources: check inside assessmentDir first (root-level
  // exports), then fall back to the parent directory (Canvas course exports).
  const webResourcesDir = await resolveWebResourcesDir(entry.assessmentDir);

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

  // Parse once into IR, derive the title for the question prefix,
  // then emit from the already-parsed IR.
  let ir;
  try {
    ir = await parseAssessment(xmlContent, [new QTI12AssessmentParser()], baseOptions);
  } catch (err) {
    return {
      ok: false,
      warning: {
        filename: path.basename(entry.qtiPath),
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  // Deduplicate slugs so same-titled assessments don't collide.
  let assessmentSlug = slugify(ir.title);
  if (usedSlugs.has(assessmentSlug)) {
    let suffix = 2;
    while (usedSlugs.has(`${assessmentSlug}-${suffix}`)) suffix++;
    assessmentSlug = `${assessmentSlug}-${suffix}`;
  }
  usedSlugs.add(assessmentSlug);

  const questionPrefix = `imported/${assessmentSlug}`;

  const emitter = new PLEmitter();
  const result = emitter.emit(ir, {
    ...baseOptions,
    tags: ['imported'],
    questionIdPrefix: questionPrefix,
    excludeFileExtensions: VIDEO_EXTENSIONS,
  });

  return {
    ok: true,
    value: await serializeConversionResult(result, questionPrefix, webResourcesDir),
  };
}

/** Resolve the web_resources directory, checking assessmentDir first. */
async function resolveWebResourcesDir(assessmentDir: string): Promise<string> {
  const local = path.join(assessmentDir, 'web_resources');
  try {
    const s = await fsStat(local);
    if (s.isDirectory()) return local;
  } catch {
    // Not present at this level.
  }
  return path.join(assessmentDir, '..', 'web_resources');
}

/** Serialize a ConversionResult for JSON transport. */
async function serializeConversionResult(
  result: ConversionResult,
  questionPrefix: string,
  webResourcesDir: string,
): Promise<SerializedConversionResult> {
  const extraWarnings: ConversionWarning[] = [];

  const questions = await Promise.all(
    result.questions.map(async (q) => {
      // The converter emits local directory names (e.g. "q1"), but on disk
      // questions live under the prefix path (e.g. "imported/quiz-slug/q1").
      // This must match the IDs used in the assessment zones.
      const { files, missingFiles } = await serializeClientFiles(q.clientFiles, webResourcesDir);
      if (missingFiles.length > 0) {
        extraWarnings.push({
          questionId: `${questionPrefix}/${q.directoryName}`,
          message: `Missing asset file(s): ${missingFiles.join(', ')}`,
          level: 'warn',
        });
      }
      // @reteps to handle this differently post-mvp, under the assumption that
      // rewriting the question HTML should be handled by the import package
      const questionHtml =
        q.skippedFiles.length > 0
          ? commentOutVideoReferences(q.questionHtml, q.skippedFiles)
          : q.questionHtml;
      return {
        directoryName: `${questionPrefix}/${q.directoryName}`,
        sourceId: q.sourceId,
        infoJson: q.infoJson,
        questionHtml,
        serverPy: q.serverPy,
        clientFiles: files,
        skippedVideos: q.skippedFiles,
      };
    }),
  );

  return {
    assessmentTitle: result.assessmentTitle,
    assessment: {
      directoryName: result.assessment.directoryName,
      infoJson: result.assessment.infoJson,
    },
    questions,
    warnings: [...result.warnings, ...extraWarnings],
  };
}

/**
 * Comment out any HTML tag that references a skipped video file via
 * `clientFilesQuestion/<filename>`. Matches self-closing tags and
 * open/close pairs regardless of tag name.
 */
export function commentOutVideoReferences(html: string, skippedVideos: string[]): string {
  let result = html;
  for (const videoFile of skippedVideos) {
    const escaped = videoFile.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ref = `clientFilesQuestion/${escaped}`;
    // Match open+close tag pairs (e.g. <a ...>...</a>, <pl-figure ...>...</pl-figure>)
    // then self-closing or void tags (e.g. <img .../>).
    const patterns = [
      new RegExp(`<(\\w[\\w-]*)\\b[^>]*${ref}[^>]*>[\\s\\S]*?</\\1>`, 'gi'),
      new RegExp(`<\\w[\\w-]*\\b[^>]*${ref}[^>]*/?>`, 'gi'),
    ];
    for (const pattern of patterns) {
      result = result.replace(pattern, (...args) => {
        const offset = args[args.length - 2] as number;
        // Skip if this match is already inside an HTML comment.
        const before = result.slice(0, offset);
        const lastCommentOpen = before.lastIndexOf('<!--');
        const lastCommentClose = before.lastIndexOf('-->');
        if (lastCommentOpen > lastCommentClose) return args[0];

        return `<!-- TODO: Re-host this file and update the URL below, then uncomment to restore.\n${args[0]}\n-->`;
      });
    }
  }
  return result;
}

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.mkv',
  '.m4v',
  '.ogv',
  '.wmv',
  '.flv',
]);

/** Convert a Map<string, Buffer|string> to Record<string, string> (base64-encoded). */
export async function serializeClientFiles(
  clientFiles: Map<string, Buffer | string>,
  webResourcesDir: string,
): Promise<{ files: Record<string, string>; missingFiles: string[] }> {
  const files: Record<string, string> = {};
  const missingFiles: string[] = [];
  for (const [name, content] of clientFiles) {
    if (Buffer.isBuffer(content)) {
      files[name] = content.toString('base64');
    } else {
      // Content is a relative path to a file in web_resources.
      const resolved = path.resolve(webResourcesDir, content);
      if (!contains(webResourcesDir, resolved)) {
        missingFiles.push(name);
        continue;
      }
      try {
        const fileContent = await readFile(resolved);
        files[name] = fileContent.toString('base64');
      } catch {
        missingFiles.push(name);
      }
    }
  }
  return { files, missingFiles };
}

export default router;
