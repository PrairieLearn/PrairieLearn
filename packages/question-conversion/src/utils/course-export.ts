import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { attr, ensureArray, parseXml, textContent } from '../parsers/qti12/xml-helpers.js';

export interface CourseExportInfo {
  /** Full course title (e.g. "CS 101: Introduction to Computing"). */
  title: string;
  /** Short course identifier / code (e.g. "CS101"). */
  courseCode?: string;
  /** IANA timezone identifier (e.g. "America/Denver"). */
  timezone?: string;
}

/**
 * Detect whether `dir` is a Canvas IMS Common Cartridge course export and
 * extract course metadata if so.
 *
 * A course export is identified by the presence of `imsmanifest.xml` at the
 * root of the directory. Metadata is resolved in this order:
 *  1. `course_settings/course_settings.xml` — Canvas-specific, most complete
 *  2. `imsmanifest.xml` metadata — IMS standard, title only
 *
 * Returns `null` if `imsmanifest.xml` is not found (not a course export).
 */
export async function detectCourseExport(dir: string): Promise<CourseExportInfo | null> {
  const manifestPath = path.join(dir, 'imsmanifest.xml');
  let manifestXml: string;
  try {
    manifestXml = await readFile(manifestPath, 'utf-8');
  } catch {
    return null;
  }

  // Prefer course_settings/course_settings.xml — it has title, code, and timezone.
  const settingsPath = path.join(dir, 'course_settings', 'course_settings.xml');
  try {
    const settingsXml = await readFile(settingsPath, 'utf-8');
    const info = parseCourseSettings(settingsXml);
    if (info) return info;
  } catch {
    // File not present — fall through to manifest
  }

  return parseManifestTitle(manifestXml);
}

/**
 * Represents a QTI assessment file to convert, with a potentially separate
 * directory for resolving assessment_meta.xml and relative file references.
 *
 * In a Canvas course export, the QTI with actual question content lives in
 * `non_cc_assessments/<id>.xml.qti`, while `assessment_meta.xml` and file
 * attachments live in `<id>/`. These two paths must be tracked separately.
 */
export interface QtiFileEntry {
  /** Absolute path to the QTI XML file to parse. */
  qtiPath: string;
  /**
   * Absolute path to the directory containing `assessment_meta.xml` and
   * used as the base for resolving relative file references (e.g. images).
   */
  assessmentDir: string;
}

/**
 * Find QTI assessment XML files by parsing the resource list in `imsmanifest.xml`.
 *
 * Canvas QTI resources have type imsqti_xmlv1p2/imscc_xmlv1pN/assessment.
 * Each assessment resource has a paired `associatedcontent` dependency that
 * lists both `assessment_meta.xml` and a `non_cc_assessments/<id>.xml.qti`
 * file. The non-CC QTI contains the full question content (including Canvas-
 * specific types like numerical, calculated, file-upload, and multiple-
 * dropdowns that are omitted from the CC QTI). We always prefer it when
 * present.
 *
 * Returns absolute paths.
 */
export async function findQtiFilesFromManifest(dir: string): Promise<QtiFileEntry[]> {
  const manifestPath = path.join(dir, 'imsmanifest.xml');
  let manifestXml: string;
  try {
    manifestXml = await readFile(manifestPath, 'utf-8');
  } catch {
    return [];
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseXml(manifestXml);
  } catch {
    return [];
  }

  const manifest = parsed['manifest'] as Record<string, unknown> | undefined;
  if (!manifest) return [];

  const resources = manifest['resources'] as Record<string, unknown> | undefined;
  if (!resources) return [];

  const resourceList = ensureArray(resources['resource'] as unknown);

  // Build a map from identifier → resource for dependency lookups.
  const resourceMap = new Map<string, Record<string, unknown>>();
  for (const resource of resourceList) {
    if (resource == null || typeof resource !== 'object') continue;
    const r = resource as Record<string, unknown>;
    const id = attr(r, 'identifier');
    if (id) resourceMap.set(id, r);
  }

  const entries: QtiFileEntry[] = [];

  for (const resource of resourceList) {
    if (resource == null || typeof resource !== 'object') continue;
    const r = resource as Record<string, unknown>;
    const type = attr(r, 'type').toLowerCase();
    if (!type.includes('qti') || !type.includes('assessment')) continue;

    // Resolve the primary QTI file path.
    // Canvas IMS CC: path is in a <file href="..."> child element.
    // Standard IMS QTI: path may be the `href` attribute on <resource> itself.
    const fileEl = r['file'];
    const ccHref =
      fileEl != null && typeof fileEl === 'object'
        ? attr(fileEl as Record<string, unknown>, 'href')
        : attr(r, 'href');
    if (!ccHref || !ccHref.endsWith('.xml')) continue;

    const ccQtiPath = path.join(dir, ccHref.replaceAll('/', path.sep));
    const assessmentDir = path.dirname(ccQtiPath);

    // Follow the <dependency> to look for a non_cc_assessments QTI file.
    // Canvas exports the full question content (including non-standard types)
    // in a sibling resource of type associatedcontent.
    let nonCcQtiPath: string | undefined;
    const dependency = r['dependency'] as Record<string, unknown> | undefined;
    if (dependency) {
      const depId = attr(dependency, 'identifierref');
      const depResource = depId ? resourceMap.get(depId) : undefined;
      if (depResource) {
        const depFiles = ensureArray(depResource['file'] as unknown);
        for (const f of depFiles) {
          if (f == null || typeof f !== 'object') continue;
          const href = attr(f as Record<string, unknown>, 'href');
          if (href && href.startsWith('non_cc_assessments/') && href.endsWith('.xml.qti')) {
            nonCcQtiPath = path.join(dir, href.replaceAll('/', path.sep));
            break;
          }
        }
      }
    }

    entries.push({ qtiPath: nonCcQtiPath ?? ccQtiPath, assessmentDir });
  }

  return entries;
}

/**
 * Parse Canvas `course_settings.xml` for title, course code, and timezone.
 * Canvas uses simple (non-namespaced) element names in this file.
 */
function parseCourseSettings(xml: string): CourseExportInfo | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseXml(xml);
  } catch {
    return null;
  }

  const course = (parsed['course'] ?? parsed) as Record<string, unknown>;
  const title = textContent(course['title']).trim();
  if (!title) return null;

  const courseCode = textContent(course['course_code']).trim() || undefined;
  const timezone = textContent(course['timezone']).trim() || undefined;

  return { title, courseCode, timezone };
}

/**
 * Extract the course title from an IMS Common Cartridge manifest.
 *
 * Canvas manifests use namespace-prefixed LOM elements (e.g. `<lomimscc:string>`).
 * A simple regex is more robust than XML parsing here because the namespace
 * prefix varies across Canvas versions and CC schema revisions.
 */
function parseManifestTitle(xml: string): CourseExportInfo | null {
  // Match the first <ns:string> or <string> element content (LOM title element).
  const match = /<(?:\w+:)?string(?:\s[^>]*)?>([^<]+)<\/(?:\w+:)?string>/i.exec(xml);
  const title = match?.[1]?.trim();
  return title ? { title } : null;
}
