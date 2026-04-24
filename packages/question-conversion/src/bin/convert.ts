#!/usr/bin/env node

import { access, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Command } from 'commander';

import { logger } from '@prairielearn/logger';

import type { ConversionResult } from '../emitters/emitter.js';
import { PLEmitter } from '../emitters/pl-emitter.js';
import type { ParseOptions } from '../parsers/parser.js';
import { QTI12AssessmentParser } from '../parsers/qti12/index.js';
import { parseAssessment } from '../pipeline.js';
import type { IRAssessment } from '../types/ir.js';
import {
  type CourseExportInfo,
  type QtiFileEntry,
  detectCourseExport,
  findQtiFilesFromManifest,
} from '../utils/course-export.js';
import { slugify } from '../utils/slugify.js';
import { stableUuid } from '../utils/uuid.js';

const program = new Command();

program
  .name('question-convert')
  .description('Convert questions from interchange formats (QTI) to PrairieLearn format')
  .argument('<input>', 'Input QTI XML file or directory of quiz exports')
  .requiredOption('--course <dir>', 'Path to PrairieLearn course directory')
  .requiredOption('--course-instance <name>', 'Course instance name (e.g. "Fall2025")')
  .option(
    '--timezone <tz>',
    'Course timezone (e.g. "America/Denver"). Read from infoCourse.json if present.',
  )
  .option('-t, --topic <topic>', 'Default topic for questions')
  .option('--tags <tags...>', 'Default tags for questions', ['imported', 'qti'])
  .option('--overwrite', 'Delete existing output directories before writing')
  .action(
    async (
      input: string,
      options: {
        course: string;
        courseInstance: string;
        timezone?: string;
        topic?: string;
        tags: string[];
        overwrite?: boolean;
      },
    ) => {
      const resolvedInput = path.resolve(input);
      const inputStat = await stat(resolvedInput);
      const courseDir = path.resolve(options.course);

      // Detect course export metadata when the input is a directory.
      // This lets us populate infoCourse.json with real course info and
      // resolve the timezone without requiring --timezone on the command line.
      let courseExportInfo: CourseExportInfo | undefined;
      if (inputStat.isDirectory()) {
        courseExportInfo = (await detectCourseExport(resolvedInput)) ?? undefined;
        if (courseExportInfo) {
          logger.info(`Detected Canvas course export: "${courseExportInfo.title}"`);
        }
      }

      // Resolve timezone: flag → course export settings → existing infoCourse.json → error
      const timezone = await resolveTimezone(
        courseDir,
        options.timezone,
        courseExportInfo?.timezone,
      );

      await ensureCourseFiles(courseDir, options.courseInstance, timezone, courseExportInfo);

      if (inputStat.isDirectory()) {
        // Prefer the manifest for file discovery — it's present in both quiz
        // exports and course exports and only lists QTI assessment resources,
        // avoiding non-QTI XML files (course settings, wiki pages, etc.).
        // Fall back to the heuristic directory scan if no manifest is found.
        const manifestFiles = await findQtiFilesFromManifest(resolvedInput);
        const entries: QtiFileEntry[] =
          manifestFiles.length > 0
            ? manifestFiles
            : (await findQtiXmlFiles(resolvedInput)).map((p) => ({
                qtiPath: p,
                assessmentDir: path.dirname(p),
              }));

        if (entries.length === 0) {
          logger.error('No QTI XML files found in directory');
          process.exit(1);
        }

        // Try to read rubrics from course_settings/rubrics.xml (only present in full course exports).
        const rubricsPath = path.join(resolvedInput, 'course_settings', 'rubrics.xml');
        let rubricsXml: string | undefined;
        try {
          rubricsXml = await readFile(rubricsPath, 'utf-8');
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            // Not present in quiz-only exports — that's fine; parser will warn per-assessment.
            logger.debug('Could not find rubrics.xml for course.');
          } else {
            logger.warn(`Failed to read ${rubricsPath}: ${(err as Error).message}`);
          }
        }

        // Parse all assessments in parallel (language detection benefits from concurrency).
        // Emit/write sequentially so slug disambiguation happens before the question-id
        // prefix is baked into the assessment's infoJson.
        const parsed = await Promise.all(
          entries.map((entry) => parseFile(entry, timezone, rubricsXml)),
        );
        const usedSlugs = new Set<string>();
        for (const p of parsed) {
          const slug = uniqueSlug(slugify(p.ir.title), usedSlugs);
          const converted = emitWithSlug(p, slug, options);
          await writeFiles(converted, courseDir, options);
        }
      } else {
        const entry = { qtiPath: resolvedInput, assessmentDir: path.dirname(resolvedInput) };
        const p = await parseFile(entry, timezone);
        const converted = emitWithSlug(p, slugify(p.ir.title), options);
        await writeFiles(converted, courseDir, options);
      }
    },
  );

program.parse();

/**
 * Resolve `child` against `base` and return the absolute path only if it stays
 * inside `base`. Returns undefined for paths that would escape (e.g. "../../etc/passwd",
 * absolute paths, symlink-style traversal). Keeps clientFile writes confined to
 * the target question directory so a malformed QTI can't overwrite files outside it.
 */
function safeJoin(base: string, child: string): string | undefined {
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(resolvedBase, child);
  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    return undefined;
  }
  return resolved;
}

/**
 * Return a slug that is not in `used`. Appends "-2", "-3", ... as needed so that
 * two assessments whose titles normalize to the same slug don't silently overwrite
 * each other's output. Mutates `used` with the chosen slug.
 */
function uniqueSlug(slug: string, used: Set<string>): string {
  if (!used.has(slug)) {
    used.add(slug);
    return slug;
  }
  let i = 2;
  while (used.has(`${slug}-${i}`)) i++;
  const result = `${slug}-${i}`;
  used.add(result);
  logger.warn(
    `Assessment slug "${slug}" collides with a previously converted assessment; using "${result}" instead.`,
  );
  return result;
}

/**
 * Determine the course timezone.
 * Priority: --timezone flag → course export settings → existing infoCourse.json → error.
 */
async function resolveTimezone(
  courseDir: string,
  flagValue?: string,
  courseExportTimezone?: string,
): Promise<string> {
  if (flagValue) return flagValue;
  if (courseExportTimezone) return courseExportTimezone;

  // Try reading from existing infoCourse.json
  const infoCourseFile = path.join(courseDir, 'infoCourse.json');
  try {
    const content = await readFile(infoCourseFile, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (typeof parsed['timezone'] === 'string' && parsed['timezone']) {
      return parsed['timezone'];
    }
  } catch {
    // File doesn't exist yet — fall through to error
  }

  logger.error(
    'Error: course timezone is required.\n' +
      'Pass --timezone "America/Denver" (or the appropriate IANA timezone),\n' +
      'or ensure infoCourse.json already contains a "timezone" field.',
  );
  process.exit(1);
}

const NON_QTI_XML_FILES = new Set(['assessment_meta.xml', 'imsmanifest.xml']);

function isQtiXml(filename: string): boolean {
  return filename.endsWith('.xml') && !NON_QTI_XML_FILES.has(filename);
}

/**
 * Find QTI XML files in a directory. Handles two cases:
 * - The directory itself contains a QTI XML (single quiz dir)
 * - The directory contains subdirectories, each with a QTI XML (bulk export folder)
 */
async function findQtiXmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir);

  // Check if the directory itself contains a QTI XML (not a manifest)
  const directXml = entries.find(isQtiXml);
  if (directXml) {
    return [path.join(dir, directXml)];
  }

  // Otherwise look in subdirectories
  const xmlFiles: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry);
    const entryStat = await stat(entryPath);
    if (entryStat.isDirectory()) {
      const subEntries = await readdir(entryPath);
      const xml = subEntries.find(isQtiXml);
      if (xml) {
        xmlFiles.push(path.join(entryPath, xml));
      }
    }
  }
  return xmlFiles;
}

interface ParsedInput {
  ir: IRAssessment;
  parseOptions: ParseOptions;
  webResourcesDir: string;
}

interface ParsedAssessment {
  result: ConversionResult;
  assessmentSlug: string;
  webResourcesDir: string;
}

const PARSERS = [new QTI12AssessmentParser()];
const EMITTER = new PLEmitter();

async function parseFile(
  entry: QtiFileEntry,
  timezone: string,
  rubricsXml?: string,
): Promise<ParsedInput> {
  const xmlContent = await readFile(entry.qtiPath, 'utf-8');
  const webResourcesDir = path.join(entry.assessmentDir, '..', 'web_resources');

  const metaXmlPath = path.join(entry.assessmentDir, 'assessment_meta.xml');
  let assessmentMetaXml: string | undefined;
  try {
    assessmentMetaXml = await readFile(metaXmlPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`Failed to read ${metaXmlPath}: ${(err as Error).message}`);
    }
    // Otherwise the file is legitimately absent — proceed without it.
  }

  const parseOptions: ParseOptions = {
    basePath: entry.assessmentDir,
    assessmentMetaXml,
    timezone,
    rubricsXml,
  };
  const ir = await parseAssessment(xmlContent, PARSERS, parseOptions);
  return { ir, parseOptions, webResourcesDir };
}

function emitWithSlug(
  parsed: ParsedInput,
  assessmentSlug: string,
  options: { topic?: string; tags: string[] },
): ParsedAssessment {
  const result = EMITTER.emit(parsed.ir, {
    ...parsed.parseOptions,
    topic: options.topic,
    tags: options.tags,
    questionIdPrefix: `imported/${assessmentSlug}`,
  });
  return { result, assessmentSlug, webResourcesDir: parsed.webResourcesDir };
}

async function writeFiles(
  { result, assessmentSlug, webResourcesDir }: ParsedAssessment,
  courseDir: string,
  options: { courseInstance: string; overwrite?: boolean },
): Promise<void> {
  const questionsDir = path.join(courseDir, 'questions', 'imported', assessmentSlug);
  const assessmentsDir = path.join(
    courseDir,
    'courseInstances',
    options.courseInstance,
    'assessments',
    assessmentSlug,
  );

  if (options.overwrite) {
    await rm(questionsDir, { recursive: true, force: true });
    await rm(assessmentsDir, { recursive: true, force: true });
  } else {
    const conflicts = (
      await Promise.all(
        [questionsDir, assessmentsDir].map(async (d) => ((await fileExists(d)) ? d : null)),
      )
    ).filter((d): d is string => d !== null);
    if (conflicts.length > 0) {
      logger.error(
        'Error: output directory already exists (pass --overwrite to replace):\n' +
          conflicts.map((d) => `  ${d}`).join('\n'),
      );
      process.exit(1);
    }
  }

  await Promise.all(
    result.questions.map(async (q) => {
      const qDir = path.join(questionsDir, q.directoryName);
      await mkdir(qDir, { recursive: true });

      const writes: Promise<void>[] = [
        writeFile(path.join(qDir, 'info.json'), JSON.stringify(q.infoJson, null, 2) + '\n'),
        writeFile(path.join(qDir, 'question.html'), q.questionHtml),
      ];
      if (q.serverPy) {
        writes.push(writeFile(path.join(qDir, 'server.py'), q.serverPy));
      }
      await Promise.all(writes);

      if (q.clientFiles.size > 0) {
        const cfDir = path.join(qDir, 'clientFilesQuestion');
        await mkdir(cfDir, { recursive: true });
        await Promise.all(
          [...q.clientFiles].map(async ([name, content]) => {
            const destFile = safeJoin(cfDir, name);
            if (!destFile) {
              logger.warn(`Skipping clientFile with unsafe path "${name}" (would escape ${cfDir})`);
              return;
            }
            if (Buffer.isBuffer(content)) {
              await writeFile(destFile, content);
            } else {
              const srcFile = safeJoin(webResourcesDir, content);
              if (!srcFile) {
                logger.warn(
                  `Skipping clientFile "${name}": source path "${content}" escapes ${webResourcesDir}`,
                );
                return;
              }
              try {
                await copyFile(srcFile, destFile);
              } catch (err) {
                if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                  logger.warn(`Warning: could not find image file: ${srcFile}`);
                } else {
                  logger.error(
                    `Failed to copy image ${srcFile} → ${destFile}: ${(err as Error).message}`,
                  );
                }
              }
            }
          }),
        );
      }
    }),
  );

  await mkdir(assessmentsDir, { recursive: true });
  await writeFile(
    path.join(assessmentsDir, 'infoAssessment.json'),
    JSON.stringify(result.assessment.infoJson, null, 2) + '\n',
  );

  for (const w of result.warnings) {
    if (w.level === 'info') {
      logger.info(`Info [${w.questionId}]: ${w.message}`);
    } else {
      logger.warn(`Warning [${w.questionId}]: ${w.message}`);
    }
  }

  logger.info(`Converted "${result.assessmentTitle}": ${result.questions.length} question(s)`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureCourseFiles(
  courseDir: string,
  courseInstance: string,
  timezone: string,
  courseExportInfo?: CourseExportInfo,
): Promise<void> {
  const infoCourseFile = path.join(courseDir, 'infoCourse.json');
  if (!(await fileExists(infoCourseFile))) {
    await mkdir(courseDir, { recursive: true });
    // Use the course short code as `name` (PL requires a short identifier);
    // fall back to a slugified title, then to the generic placeholder.
    const name = courseExportInfo?.courseCode ?? courseExportInfo?.title ?? 'Imported Course';
    const title = courseExportInfo?.title ?? 'Imported Course';
    const infoCourse = {
      uuid: stableUuid(courseDir, 'course'),
      name,
      title,
      timezone,
      topics: [{ name: 'Imported', color: 'gray1', description: 'Imported from QTI' }],
      tags: [{ name: 'imported', color: 'gray1', description: 'Imported from QTI' }],
    };
    await writeFile(infoCourseFile, JSON.stringify(infoCourse, null, 2) + '\n');
    logger.info(`Created ${path.relative(process.cwd(), infoCourseFile)}`);
  }

  const ciDir = path.join(courseDir, 'courseInstances', courseInstance);
  const infoCIFile = path.join(ciDir, 'infoCourseInstance.json');
  if (!(await fileExists(infoCIFile))) {
    await mkdir(ciDir, { recursive: true });
    // Wide-open access window so the course instance is immediately usable after import.
    // The course owner should narrow these dates (and set institution/uids) before going live.
    const infoCourseInstance = {
      uuid: stableUuid(courseDir, `ci-${courseInstance}`),
      longName: courseInstance,
      allowAccess: [
        {
          institution: 'Any',
          startDate: '1900-01-01T00:00:01',
          endDate: '2400-12-31T23:59:59',
        },
      ],
    };
    await writeFile(infoCIFile, JSON.stringify(infoCourseInstance, null, 2) + '\n');
    logger.info(`Created ${path.relative(process.cwd(), infoCIFile)}`);
  }
}
