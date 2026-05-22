import { stat as fsStat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { Router } from 'express';
import * as tmp from 'tmp-promise';
import * as unzipper from 'unzipper';

import { HttpStatusError } from '@prairielearn/error';
import { html } from '@prairielearn/html';
import { contains } from '@prairielearn/path-utils';
import {
  type ConversionResult,
  type ConversionWarning,
  PLEmitter,
  QTI12AssessmentParser,
  type QtiFileEntry,
  findQtiFilesFromManifest,
  findQtiXmlFiles,
  parseAssessment,
  slugify,
} from '@prairielearn/question-conversion';
import { Hydrate } from '@prairielearn/react/server';
import { run } from '@prairielearn/run';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { nodeModulesAssetPath } from '../../lib/assets.js';
import { getCourseInstanceTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { discoverInfoDirs } from '../../lib/discover-info-dirs.js';
import { features } from '../../lib/features/index.js';
import { createQtiImportDraft } from '../../lib/qti-import-drafts.js';
import { lintQuestionHtml } from '../../lib/question-html-linter.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { selectAssessmentSetsForCourse } from '../../models/assessment-set.js';
import { selectAssessments } from '../../models/assessment.js';

import { QtiImportForm } from './components/QtiImportForm.js';
import type {
  ParseWarning,
  SerializedConversionResult,
  StoredSerializedConversionResult,
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
    const returnTo = req.query.return_to === 'questions' ? 'questions' : 'assessments';
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
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Import QTI content',
        navContext: {
          type: 'instructor',
          ...(returnTo === 'questions'
            ? { page: 'course_admin', subPage: 'questions' }
            : { page: 'instance_admin', subPage: 'assessments' }),
        },
        options: {},
        headContent: html`
          <link
            href="${nodeModulesAssetPath('highlight.js/styles/default.css')}"
            rel="stylesheet"
          />
        `,
        content: (
          <Hydrate>
            <QtiImportForm
              courseInstanceId={res.locals.course_instance.id}
              csrfToken={uploadCsrfToken}
              trpcCsrfToken={trpcCsrfToken}
              returnTo={returnTo}
            />
          </Hydrate>
        ),
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
        if (!file.path) {
          throw new Error('Uploaded archive was not written to disk');
        }
        const directory = await unzipper.Open.file(file.path);
        await directory.extract({ path: tempDir });
      } catch {
        throw new HttpStatusError(400, 'The uploaded archive is invalid or corrupt');
      }

      // Find QTI content files from the manifest. If the archive has a
      // wrapper directory (e.g. "course-export/imsmanifest.xml" instead of
      // "imsmanifest.xml" at root), descend into it. macOS zip tools add a
      // __MACOSX/ sibling with resource forks, so filter those out first.
      let contentDir = tempDir;
      let entries = await findQtiEntries(contentDir);
      if (entries.length === 0) {
        const children = (await readdir(tempDir)).filter(
          (name) => !name.startsWith('.') && name !== '__MACOSX',
        );
        if (children.length === 1) {
          const child = path.join(tempDir, children[0]);
          if ((await fsStat(child)).isDirectory()) {
            contentDir = child;
            entries = await findQtiEntries(contentDir);
          }
        }
      }
      if (entries.length === 0) {
        throw new HttpStatusError(400, 'No QTI content files found in the uploaded archive.');
      }

      // Try to read rubrics from course_settings/rubrics.xml (not present in quiz-only exports).
      const rubricsXml = await run(async () => {
        try {
          return await readFile(path.join(contentDir, 'course_settings', 'rubrics.xml'), 'utf-8');
        } catch {
          return undefined;
        }
      });

      // Convert each QTI entry, assigning unique slugs so same-titled entries
      // (e.g. two "Quiz 1") don't collide on question prefixes.
      const usedSlugs = new Set<string>();
      const convertedEntries: SerializedEntryResult[] = [];
      const parseWarnings: ParseWarning[] = [];
      for (const entry of entries) {
        const result = await convertEntry(entry, rubricsXml, usedSlugs);
        if (result.ok) {
          convertedEntries.push(result.value);
        } else {
          parseWarnings.push(result.warning);
        }
      }
      const results = deduplicateIdenticalQuestions(convertedEntries.map((entry) => entry.result));

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

      const draftId = await createQtiImportDraft({
        courseId: res.locals.course.id,
        courseInstanceId: res.locals.course_instance.id,
        userId: res.locals.authn_user.id,
        results,
      });
      const clientResults = results.map((result) => stripDraftResultForClient(result, draftId));

      const response: UploadResponse = {
        results: clientResults,
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
  | { ok: true; value: SerializedEntryResult }
  | { ok: false; warning: ParseWarning };

interface SerializedEntryResult {
  result: StoredSerializedConversionResult;
  webResourcesDir: string;
}

async function findQtiEntries(contentDir: string): Promise<QtiFileEntry[]> {
  const manifestEntries = await findQtiFilesFromManifest(contentDir);
  if (manifestEntries.length > 0) return manifestEntries;

  return (await findQtiXmlFiles(contentDir)).map((qtiPath) => ({
    qtiPath,
    assessmentDir: path.dirname(qtiPath),
  }));
}

/** Convert a single QTI entry to a serialized result. */
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
    excludeFileExtensions: VIDEO_EXTENSIONS,
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

  // Assign a unique slug so same-titled item containers don't collide.
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
): Promise<SerializedEntryResult> {
  const extraWarnings: ConversionWarning[] = [];

  const questions = await Promise.all(
    result.questions.map(async (q) => {
      // The converter emits local directory names (e.g. "q1"), but on disk
      // questions live under the prefix path (e.g. "imported/quiz-slug/q1").
      // This must match the IDs used in the assessment zones.
      const questionId = `${questionPrefix}/${q.directoryName}`;
      const { files, missingFiles } = await serializeClientFiles(q.clientFiles, webResourcesDir);
      if (missingFiles.length > 0) {
        extraWarnings.push({
          questionId,
          message: `Missing asset file(s): ${missingFiles.join(', ')}`,
          level: 'warn',
        });
      }
      const seenMessages = new Set<string>();
      for (const d of await lintQuestionHtml(q.questionHtml)) {
        if (seenMessages.has(d.message)) continue;
        seenMessages.add(d.message);
        extraWarnings.push({ questionId, message: d.message, level: 'warn' });
      }
      return {
        directoryName: `${questionPrefix}/${q.directoryName}`,
        sourceId: q.sourceId,
        infoJson: q.infoJson,
        questionHtml: q.questionHtml,
        serverPy: q.serverPy,
        clientFiles: files,
        skippedVideos: q.skippedFiles,
      };
    }),
  );

  const serializedBase = {
    sourceId: result.sourceId,
    assessmentTitle: result.assessmentTitle,
    assessment: {
      directoryName: result.assessment.directoryName,
      infoJson: result.assessment.infoJson,
    },
    questions,
    warnings: [...result.warnings, ...extraWarnings],
  };

  if (result.sourceType === 'question-bank') {
    return {
      result: {
        ...serializedBase,
        sourceType: 'question-bank',
      },
      webResourcesDir,
    };
  }

  return {
    result: {
      ...serializedBase,
      sourceType: 'assessment',
      unresolvedSourceBankRefs: result.unresolvedSourceBankRefs,
    },
    webResourcesDir,
  };
}

function stripDraftResultForClient(
  result: StoredSerializedConversionResult,
  draftId: string,
): SerializedConversionResult {
  return {
    ...result,
    draftId,
    questions: result.questions.map((question) => ({
      ...question,
      draftId,
      originalDirectoryName: question.directoryName,
      clientFiles: Object.fromEntries(
        Object.entries(question.clientFiles).map(([name, content]) => [
          name,
          { size: Buffer.byteLength(content, 'base64') },
        ]),
      ),
    })),
  };
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

function questionFingerprint(question: StoredSerializedConversionResult['questions'][number]) {
  return JSON.stringify({
    title: question.infoJson.title,
    type: question.infoJson.type,
    singleVariant: question.infoJson.singleVariant ?? null,
    gradingMethod: question.infoJson.gradingMethod ?? null,
    questionHtml: question.questionHtml,
    serverPy: question.serverPy ?? null,
    clientFiles: Object.entries(question.clientFiles).sort(([a], [b]) => a.localeCompare(b)),
    skippedVideos: [...question.skippedVideos].sort(),
  });
}

export function deduplicateIdenticalQuestions(
  results: StoredSerializedConversionResult[],
): StoredSerializedConversionResult[] {
  const canonicalByFingerprint = new Map<
    string,
    {
      question: StoredSerializedConversionResult['questions'][number];
      sourceType: StoredSerializedConversionResult['sourceType'];
    }
  >();

  for (const result of results) {
    for (const question of result.questions) {
      const fingerprint = questionFingerprint(question);
      const existing = canonicalByFingerprint.get(fingerprint);
      if (
        !existing ||
        (result.sourceType === 'question-bank' && existing.sourceType === 'assessment')
      ) {
        canonicalByFingerprint.set(fingerprint, {
          question,
          sourceType: result.sourceType,
        });
      }
    }
  }

  return results.map((result) => {
    const canonicalDirectoryNameByOriginal = new Map<string, string>();
    const canonicalWarningIdByOriginal = new Map<string, string>();
    const questionsByDirectoryName = new Map<
      string,
      StoredSerializedConversionResult['questions'][number]
    >();

    for (const question of result.questions) {
      const canonical =
        canonicalByFingerprint.get(questionFingerprint(question))?.question ?? question;
      canonicalDirectoryNameByOriginal.set(question.directoryName, canonical.directoryName);
      canonicalWarningIdByOriginal.set(question.directoryName, canonical.directoryName);
      canonicalWarningIdByOriginal.set(question.sourceId, canonical.sourceId);
      if (!questionsByDirectoryName.has(canonical.directoryName)) {
        questionsByDirectoryName.set(canonical.directoryName, canonical);
      }
    }

    return {
      ...result,
      assessment: {
        ...result.assessment,
        infoJson: {
          ...result.assessment.infoJson,
          zones: result.assessment.infoJson.zones.map((zone) => ({
            ...zone,
            questions: zone.questions.map((question) => ({
              ...question,
              id: canonicalDirectoryNameByOriginal.get(question.id) ?? question.id,
            })),
          })),
        },
      },
      questions: [...questionsByDirectoryName.values()],
      warnings: result.warnings.map((warning) => ({
        ...warning,
        questionId: canonicalWarningIdByOriginal.get(warning.questionId) ?? warning.questionId,
      })),
    };
  });
}

export default router;
