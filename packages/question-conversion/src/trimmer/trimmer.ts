import { XMLBuilder, XMLParser } from 'fast-xml-parser';

import { slugify } from '../utils/slugify.js';

import {
  type ZipArchive,
  type ZipInput,
  listZipEntries,
  loadZipArchive,
  readZipEntryText,
  writeZipFromSources,
} from './zip.js';

const TEXT_ENTRY_RE = /\.(?:xml|qti|html|txt)$/i;
/**
 * Matches filenames that could plausibly be QTI XML (used only as a pre-filter; actual
 *  QTI detection checks file contents for `<questestinterop>`).
 */
const CANDIDATE_QTI_RE = /(?:^|\/)(?:assessment_qti\.xml|[^/]+\.xml\.qti|[^/]+\.xml)$/i;
const NON_QTI_XML_FILES = new Set(['assessment_meta.xml', 'imsmanifest.xml']);
const IMS_FILEBASE_RE = /\$IMS-CC-FILEBASE\$\/([^"'<>\r\n]+)/g;
const MAX_QTI_SCAN_BYTES = 8 * 1024 * 1024;

// These instances are stateless — safe to reuse across calls.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  suppressEmptyNode: false,
});

interface ManifestResource {
  '@_identifier'?: string;
  '@_type'?: string;
  '@_href'?: string;
  file?: ManifestFile | ManifestFile[];
  dependency?: ManifestDependency | ManifestDependency[];
}

interface ManifestFile {
  '@_href'?: string;
}

interface ManifestDependency {
  '@_identifierref'?: string;
}

interface ManifestItem {
  '@_identifierref'?: string;
  item?: ManifestItem | ManifestItem[];
}

interface ManifestObject {
  resources?: {
    resource?: ManifestResource | ManifestResource[];
  };
  organizations?: {
    organization?:
      | { item?: ManifestItem | ManifestItem[] }[]
      | { item?: ManifestItem | ManifestItem[] };
  };
}

interface ManifestAnalysis {
  path: string;
  baseDir: string;
  xml: string;
  parsed: { manifest: ManifestObject };
  manifest: ManifestObject;
  resources: ManifestResource[];
  byId: Map<string, ManifestResource>;
  keepIds?: Set<string>;
}

export interface QtiArchiveEntry {
  qtiPath: string;
  manifestResourceId?: string;
  assessmentDir: string;
  metaPath?: string;
  source:
    | 'manifest-non-cc'
    | 'manifest-qti'
    | 'manifest-associated-bank'
    | 'unreferenced-non-cc'
    | 'scan';
}

interface LocalAssets {
  found: string[];
  missing: string[];
  rewrites: Map<string, string>;
}

type QtiContainerKind =
  | 'assessment'
  | 'objectbank-title-attr'
  | 'objectbank-bank-title'
  | 'unknown';

interface QtiContainer extends QtiArchiveEntry {
  kind: QtiContainerKind;
  title: string;
  slug: string;
}

interface TitleRename {
  entry: string;
  kind: QtiContainerKind;
  oldTitle: string;
  newTitle: string;
  oldSlug: string;
  newSlug: string;
}

interface TitleReport {
  containers: QtiContainer[];
  duplicateSlugs: { slug: string; entries: string[] }[];
  renames: TitleRename[];
}

export interface QtiArchiveTrimWarning {
  type: 'missing-local-asset';
  message: string;
}

export interface QtiArchiveAnalysis {
  inputName: string;
  originalEntryCount: number;
  originalSize: number;
  hasManifest: boolean;
  qtiEntries: QtiArchiveEntry[];
  localAssets: LocalAssets;
  textEntries: Set<string>;
  titleReport: TitleReport;
  keptPaths: Set<string>;
  warnings: QtiArchiveTrimWarning[];
  archive: ZipArchive;
  manifestPath?: string;
  manifestObject?: ManifestObject;
  manifestKeepIds: Set<string>;
}

export interface QtiArchiveTrimResult extends QtiArchiveAnalysis {
  blob: Blob;
  outputEntryCount: number;
  renamedTitles: TitleRename[];
}

export interface QtiArchiveSummary {
  inputName: string;
  hasManifest: boolean;
  originalEntryCount: number;
  outputEntryCount: number;
  qtiCount: number;
  assessmentCount: number;
  questionBankCount: number;
  localAssetCount: number;
  renamedTitleCount: number;
  duplicateSlugCount: number;
  warnings: QtiArchiveTrimWarning[];
  renamedTitles: TitleRename[];
}

export async function analyzeQtiArchive(
  input: ZipInput,
  inputName = 'archive.zip',
): Promise<QtiArchiveAnalysis> {
  const archive = await loadZipArchive(input, inputName);
  const entries = listZipEntries(archive);
  const entryMap = archive.entryMap;
  const manifest = await readManifest(archive, entryMap);
  const qtiEntries = await discoverQtiEntries(archive, entryMap, manifest);
  const textEntries = new Set([
    ...qtiEntries.map((entry) => entry.qtiPath),
    ...qtiEntries.map((entry) => entry.metaPath).filter((path) => path != null),
  ]);

  for (const entry of entries) {
    if (entry.name.endsWith('/assessment_meta.xml') || entry.name.endsWith('/assessment_qti.xml')) {
      textEntries.add(entry.name);
    }
  }

  const localAssets = await findLocalAssets(archive, entryMap, textEntries);
  const titleReport = await analyzeTitleCollisions(archive, qtiEntries);
  const keptPaths = computeKeptPaths(manifest, qtiEntries, localAssets);

  return {
    inputName,
    originalEntryCount: entries.length,
    originalSize: entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0),
    hasManifest: manifest != null,
    qtiEntries,
    localAssets,
    textEntries,
    titleReport,
    keptPaths,
    archive,
    manifestPath: manifest?.path,
    manifestObject: manifest?.manifest,
    manifestKeepIds: manifest?.keepIds ?? new Set(),
    warnings: [
      ...localAssets.missing.map((ref) => ({
        type: 'missing-local-asset' as const,
        message: `Referenced local asset was not present in the archive: ${ref}`,
      })),
    ],
  };
}

export async function trimQtiArchive(
  input: ZipInput,
  inputName = 'archive.zip',
): Promise<QtiArchiveTrimResult> {
  const analysis = await analyzeQtiArchive(input, inputName);
  try {
    const blob = await createTrimmedQtiArchive(analysis);
    return {
      ...analysis,
      blob,
      outputEntryCount: analysis.keptPaths.size,
      renamedTitles: analysis.titleReport.renames,
    };
  } finally {
    await analysis.archive.close();
  }
}

export async function createTrimmedQtiArchive(analysis: QtiArchiveAnalysis): Promise<Blob> {
  const rewrittenText = await buildTextRewrites(analysis);
  const sources: Parameters<typeof writeZipFromSources>[1] = [];

  for (const entryName of [...analysis.keptPaths].sort()) {
    const rewritten = rewrittenText.get(entryName);
    if (rewritten != null) {
      sources.push({ name: entryName, text: rewritten });
    } else {
      sources.push({ name: entryName, fromZip: { entry: entryName } });
    }
  }

  return writeZipFromSources(analysis.archive, sources);
}

export function summarizeQtiArchiveAnalysis(
  result: QtiArchiveAnalysis | QtiArchiveTrimResult,
): QtiArchiveSummary {
  return {
    inputName: result.inputName,
    hasManifest: result.hasManifest,
    originalEntryCount: result.originalEntryCount,
    outputEntryCount:
      'outputEntryCount' in result ? result.outputEntryCount : result.keptPaths.size,
    qtiCount: result.qtiEntries.length,
    assessmentCount: result.titleReport.containers.filter((c) => c.kind === 'assessment').length,
    questionBankCount: result.titleReport.containers.filter((c) => c.kind.startsWith('objectbank'))
      .length,
    localAssetCount: result.localAssets.found.length,
    renamedTitleCount: result.titleReport.renames.length,
    duplicateSlugCount: result.titleReport.duplicateSlugs.length,
    warnings: result.warnings.slice(0, 100),
    renamedTitles: result.titleReport.renames,
  };
}

export function defaultTrimmedQtiArchiveName(inputName: string): string {
  const ext = inputName.toLowerCase().endsWith('.zip') ? '.zip' : '.imscc';
  const base = inputName.replace(/\.[^.]+$/, '');
  return `${base}-trimmed${ext}`;
}

async function readManifest(
  archive: ZipArchive,
  entryMap: Map<string, unknown>,
): Promise<ManifestAnalysis | null> {
  const manifestPath = findManifestPath(entryMap);
  if (manifestPath == null) return null;

  const xml = await readZipEntryText(archive, manifestPath);
  const parsed = parser.parse(xml) as { manifest?: ManifestObject };
  const manifest = parsed.manifest;
  if (!manifest) return null;

  const resources = asArray(manifest.resources?.resource);
  const byId = new Map(
    resources.map((resource) => [attr(resource, 'identifier'), resource] as const),
  );

  return {
    path: manifestPath,
    baseDir: dirname(manifestPath),
    xml,
    parsed: { manifest },
    manifest,
    resources,
    byId,
  };
}

async function discoverQtiEntries(
  archive: ZipArchive,
  entryMap: Map<string, unknown>,
  manifest: ManifestAnalysis | null,
): Promise<QtiArchiveEntry[]> {
  if (!manifest) return discoverQtiEntriesWithoutManifest(archive, entryMap);

  const entries: QtiArchiveEntry[] = [];
  const used = new Set<string>();

  for (const resource of manifest.resources) {
    const type = attr(resource, 'type').toLowerCase();
    if (!type.includes('qti')) continue;

    const ccHref = firstQtiFile(resource) ?? attr(resource, 'href');
    if (!ccHref) continue;

    const dependencyResources = dependencies(resource)
      .map((id) => manifest.byId.get(id))
      .filter((resource) => resource != null);
    const nonCcHref = dependencyResources.flatMap(resourceFiles).find(isNonCcQti);
    const qtiPath = resolveManifestEntryPath(manifest, nonCcHref ?? ccHref);
    const metaPath = dependencyResources
      .flatMap(resourceFiles)
      .find((file) => file.endsWith('/assessment_meta.xml'));
    if (!entryMap.has(qtiPath) || used.has(qtiPath)) continue;

    entries.push({
      qtiPath,
      manifestResourceId: attr(resource, 'identifier'),
      assessmentDir: dirname(resolveManifestEntryPath(manifest, ccHref)),
      metaPath: metaPath ? resolveManifestEntryPath(manifest, metaPath) : undefined,
      source: nonCcHref ? 'manifest-non-cc' : 'manifest-qti',
    });
    used.add(qtiPath);
  }

  for (const resource of manifest.resources) {
    const type = attr(resource, 'type').toLowerCase();
    if (!type.includes('associatedcontent')) continue;
    for (const file of resourceFiles(resource).filter(isNonCcQti)) {
      const qtiPath = resolveManifestEntryPath(manifest, file);
      if (!entryMap.has(qtiPath) || used.has(qtiPath)) continue;
      entries.push({
        qtiPath,
        manifestResourceId: attr(resource, 'identifier'),
        assessmentDir: dirname(qtiPath),
        metaPath: undefined,
        source: 'manifest-associated-bank',
      });
      used.add(qtiPath);
    }
  }

  for (const name of [...entryMap.keys()]
    .filter((name) => isNonCcQti(relativeToManifestBase(manifest, name)))
    .sort()) {
    if (used.has(name)) continue;
    entries.push({
      qtiPath: name,
      manifestResourceId: undefined,
      assessmentDir: dirname(name),
      metaPath: undefined,
      source: 'unreferenced-non-cc',
    });
    used.add(name);
  }

  return entries;
}

async function discoverQtiEntriesWithoutManifest(
  archive: ZipArchive,
  entryMap: Map<string, unknown>,
): Promise<QtiArchiveEntry[]> {
  const entries: QtiArchiveEntry[] = [];
  for (const name of [...entryMap.keys()].sort()) {
    if (!CANDIDATE_QTI_RE.test(name) || NON_QTI_XML_FILES.has(basename(name))) continue;
    const sample = await readZipEntryText(archive, name, MAX_QTI_SCAN_BYTES);
    if (!sample.includes('<questestinterop') && !sample.includes(':questestinterop')) continue;
    if (!sample.includes('<assessment') && !sample.includes('<objectbank')) continue;
    entries.push({
      qtiPath: name,
      manifestResourceId: undefined,
      assessmentDir: dirname(name),
      metaPath: undefined,
      source: 'scan',
    });
  }
  return entries;
}

async function findLocalAssets(
  archive: ZipArchive,
  entryMap: Map<string, unknown>,
  textEntries: Set<string>,
): Promise<LocalAssets> {
  const sharedRoot = commonTopLevelDirectory([...entryMap.keys()]);
  const found = new Map<string, { rawPath: string; decodedPath: string }>();
  const missing = new Set<string>();
  const rewrites = new Map<string, string>();

  for (const entryName of textEntries) {
    if (!entryMap.has(entryName) || !TEXT_ENTRY_RE.test(entryName)) continue;
    const text = await readZipEntryText(archive, entryName);
    for (const match of text.matchAll(IMS_FILEBASE_RE)) {
      const rawPath = decodeXml(match[1]).trim();
      if (rawPath.startsWith('@X@')) continue;
      const decodedPath = decodeURIComponentSafe(rawPath);
      const candidates = [
        decodedPath,
        `web_resources/${decodedPath}`,
        ...(sharedRoot
          ? [`${sharedRoot}/${decodedPath}`, `${sharedRoot}/web_resources/${decodedPath}`]
          : []),
      ];
      const existing = candidates.find((candidate) => entryMap.has(candidate));
      if (existing) {
        found.set(existing, { rawPath, decodedPath });
        const encoded = encodePath(decodedPath);
        if (encoded !== rawPath) {
          rewrites.set(`$IMS-CC-FILEBASE$/${rawPath}`, `$IMS-CC-FILEBASE$/${encoded}`);
        }
      } else {
        missing.add(decodedPath);
      }
    }
  }

  return { found: [...found.keys()].sort(), missing: [...missing].sort(), rewrites };
}

async function analyzeTitleCollisions(
  archive: ZipArchive,
  qtiEntries: QtiArchiveEntry[],
): Promise<TitleReport> {
  const containers: QtiContainer[] = [];
  for (const entry of qtiEntries) {
    const text = await readZipEntryText(archive, entry.qtiPath);
    const container = parseContainerTitle(text, entry.qtiPath);
    containers.push({ ...entry, ...container, slug: slugify(container.title) });
  }

  const bySlug = new Map<string, QtiContainer[]>();
  for (const container of containers) {
    bySlug.set(container.slug, [...(bySlug.get(container.slug) ?? []), container]);
  }

  const renames: TitleRename[] = [];
  for (const [slug, duplicates] of bySlug) {
    if (duplicates.length <= 1) continue;
    duplicates.forEach((container, index) => {
      if (index === 0) return;
      const newTitle = `${container.title} (${index + 1})`;
      renames.push({
        entry: container.qtiPath,
        kind: container.kind,
        oldTitle: container.title,
        newTitle,
        oldSlug: slug,
        newSlug: slugify(newTitle),
      });
    });
  }

  return {
    containers,
    duplicateSlugs: [...bySlug.entries()]
      .filter(([, containers]) => containers.length > 1)
      .map(([slug, containers]) => ({ slug, entries: containers.map((c) => c.qtiPath) })),
    renames,
  };
}

function computeKeptPaths(
  manifest: ManifestAnalysis | null,
  qtiEntries: QtiArchiveEntry[],
  localAssets: LocalAssets,
): Set<string> {
  const kept = new Set(manifest ? [manifest.path] : []);

  for (const entry of qtiEntries) {
    kept.add(entry.qtiPath);
    if (entry.metaPath) kept.add(entry.metaPath);
    if (entry.source === 'manifest-non-cc') {
      const ccPath = `${entry.assessmentDir}/assessment_qti.xml`;
      kept.add(ccPath);
    }
  }

  for (const asset of localAssets.found) kept.add(asset);

  if (manifest) {
    const keepIds = new Set<string>();
    const localAssetSet = new Set(localAssets.found);

    for (const resource of manifest.resources) {
      const id = attr(resource, 'identifier');
      const rawFiles = resourceFiles(resource);
      const files = rawFiles.map((file) => resolveManifestEntryPath(manifest, file));
      const type = attr(resource, 'type').toLowerCase();
      if (
        type.includes('qti') ||
        rawFiles.some(isNonCcQti) ||
        files.some((file) => localAssetSet.has(file))
      ) {
        keepIds.add(id);
      }
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (const id of keepIds) {
        const resource = manifest.byId.get(id);
        if (!resource) continue;
        for (const depId of dependencies(resource)) {
          if (!keepIds.has(depId)) {
            keepIds.add(depId);
            changed = true;
          }
        }
      }
    }

    manifest.keepIds = keepIds;
    for (const id of keepIds) {
      const resource = manifest.byId.get(id);
      if (!resource) continue;
      for (const file of resourceFiles(resource)) {
        kept.add(resolveManifestEntryPath(manifest, file));
      }
      const href = attr(resource, 'href');
      if (href) kept.add(resolveManifestEntryPath(manifest, href));
    }
  }

  return kept;
}

async function buildTextRewrites(analysis: QtiArchiveAnalysis): Promise<Map<string, string>> {
  const rewritten = new Map<string, string>();

  if (analysis.manifestPath) {
    rewritten.set(analysis.manifestPath, rewriteManifest(analysis));
  }

  const renameByEntry = new Map(
    analysis.titleReport.renames.map((rename) => [rename.entry, rename] as const),
  );
  for (const entryName of analysis.keptPaths) {
    if (!TEXT_ENTRY_RE.test(entryName) || entryName === analysis.manifestPath) continue;
    let text = await readZipEntryText(analysis.archive, entryName);
    let changed = false;

    const rename = renameByEntry.get(entryName);
    if (rename) {
      text = rewriteContainerTitle(text, rename);
      changed = true;
    }

    for (const [oldRef, newRef] of analysis.localAssets.rewrites) {
      if (text.includes(oldRef)) {
        text = text.split(oldRef).join(newRef);
        changed = true;
      }
    }

    if (text.includes('$IMS-CC-FILEBASE$/@X@')) {
      text = text.split('$IMS-CC-FILEBASE$/@X@').join('@X@');
      changed = true;
    }

    if (entryName.endsWith('/assessment_meta.xml')) {
      const matchingEntry = analysis.qtiEntries.find((entry) => entry.metaPath === entryName);
      const matchingRename = matchingEntry ? renameByEntry.get(matchingEntry.qtiPath) : undefined;
      if (matchingRename) {
        const next = rewriteMetadataTitle(text, matchingRename);
        changed ||= next !== text;
        text = next;
      }
    }

    if (changed) rewritten.set(entryName, text);
  }

  return rewritten;
}

function rewriteManifest(analysis: QtiArchiveAnalysis): string {
  const manifest = structuredClone(analysis.manifestObject ?? {});
  const keepIds = analysis.manifestKeepIds;

  if (manifest.resources?.resource) {
    manifest.resources.resource = asArray(manifest.resources.resource).filter((resource) =>
      keepIds.has(attr(resource, 'identifier')),
    );
  }

  if (manifest.organizations?.organization) {
    for (const organization of asArray(manifest.organizations.organization)) {
      organization.item = asArray(organization.item).filter((item) => pruneItem(item, keepIds));
      if (organization.item.length === 0) delete organization.item;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build({ manifest })}\n`;
}

function pruneItem(item: ManifestItem, keepIds: Set<string>): boolean {
  if (item.item) {
    item.item = asArray(item.item).filter((child) => pruneItem(child, keepIds));
    if (item.item.length === 0) delete item.item;
  }
  const ref = attr(item, 'identifierref');
  if (ref) return keepIds.has(ref);
  return Boolean(item.item);
}

function parseContainerTitle(
  text: string,
  entryName: string,
): { kind: QtiContainerKind; title: string } {
  const assessment = /<assessment\b[^>]*\btitle=(["'])(.*?)\1/i.exec(text);
  if (assessment) {
    return { kind: 'assessment', title: decodeXml(assessment[2]) || basename(entryName) };
  }

  const objectbankAttr = /<objectbank\b[^>]*\btitle=(["'])(.*?)\1/i.exec(text);
  if (objectbankAttr) {
    return {
      kind: 'objectbank-title-attr',
      title: decodeXml(objectbankAttr[2]) || basename(entryName),
    };
  }

  const bankTitle =
    /<fieldlabel>\s*bank_title\s*<\/fieldlabel>\s*<fieldentry>([\s\S]*?)<\/fieldentry>/i.exec(text);
  if (bankTitle) {
    return {
      kind: 'objectbank-bank-title',
      title: decodeXml(bankTitle[1].trim()) || basename(entryName),
    };
  }

  const ident = /<(?:assessment|objectbank)\b[^>]*\bident=(["'])(.*?)\1/i.exec(text);
  return { kind: 'unknown', title: decodeXml(ident?.[2] ?? basename(entryName)) };
}

function rewriteContainerTitle(text: string, rename: TitleRename): string {
  const oldTitle = escapeRegExp(encodeXmlAttr(rename.oldTitle));
  const newTitle = encodeXmlAttr(rename.newTitle);

  if (rename.kind === 'assessment') {
    return text.replace(
      new RegExp(`(<assessment\\b[^>]*\\btitle=["'])${oldTitle}(["'][^>]*>)`, 'i'),
      `$1${newTitle}$2`,
    );
  }
  if (rename.kind === 'objectbank-title-attr') {
    return text.replace(
      new RegExp(`(<objectbank\\b[^>]*\\btitle=["'])${oldTitle}(["'][^>]*>)`, 'i'),
      `$1${newTitle}$2`,
    );
  }
  if (rename.kind === 'objectbank-bank-title') {
    return text.replace(
      /(<fieldlabel>\s*bank_title\s*<\/fieldlabel>\s*<fieldentry>)([\s\S]*?)(<\/fieldentry>)/i,
      `$1${encodeXmlText(rename.newTitle)}$3`,
    );
  }
  return text;
}

function rewriteMetadataTitle(text: string, rename: TitleRename): string {
  return text.replace(
    new RegExp(`(<title>)${escapeRegExp(encodeXmlText(rename.oldTitle))}(</title>)`, 'i'),
    `$1${encodeXmlText(rename.newTitle)}$2`,
  );
}

function firstQtiFile(resource: ManifestResource): string | undefined {
  return resourceFiles(resource).find((file) => {
    const base = basename(file);
    return (base.endsWith('.xml') || base.endsWith('.xml.qti')) && !NON_QTI_XML_FILES.has(base);
  });
}

function findManifestPath(entryMap: Map<string, unknown>): string | undefined {
  if (entryMap.has('imsmanifest.xml')) return 'imsmanifest.xml';

  const roots = new Set<string>();
  for (const name of entryMap.keys()) {
    const root = name.split('/')[0];
    if (!root || root.startsWith('.') || root === '__MACOSX') continue;
    roots.add(root);
  }
  if (roots.size !== 1) return undefined;

  const [root] = [...roots];
  const wrappedPath = `${root}/imsmanifest.xml`;
  return entryMap.has(wrappedPath) ? wrappedPath : undefined;
}

function resolveManifestEntryPath(manifest: ManifestAnalysis, href: string): string {
  return manifest.baseDir ? `${manifest.baseDir}/${href}` : href;
}

function relativeToManifestBase(manifest: ManifestAnalysis, entryName: string): string {
  if (!manifest.baseDir) return entryName;
  const prefix = `${manifest.baseDir}/`;
  return entryName.startsWith(prefix) ? entryName.slice(prefix.length) : entryName;
}

function commonTopLevelDirectory(entryNames: string[]): string | undefined {
  const roots = new Set<string>();
  for (const name of entryNames) {
    const parts = name.split('/');
    if (parts.length < 2 || !parts[0] || parts[0].startsWith('.') || parts[0] === '__MACOSX') {
      continue;
    }
    roots.add(parts[0]);
  }
  return roots.size === 1 ? [...roots][0] : undefined;
}

function resourceFiles(resource: ManifestResource): string[] {
  return asArray(resource.file)
    .map((file) => attr(file, 'href'))
    .filter(Boolean);
}

function dependencies(resource: ManifestResource): string[] {
  return asArray(resource.dependency)
    .map((dependency) => attr(dependency, 'identifierref'))
    .filter(Boolean);
}

function isNonCcQti(file: string): boolean {
  return file.startsWith('non_cc_assessments/') && file.endsWith('.xml.qti');
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function attr(
  value: ManifestResource | ManifestFile | ManifestDependency | ManifestItem,
  name: string,
): string {
  const attrValue = (value as Record<string, unknown>)[`@_${name}`];
  return attrValue == null ? '' : String(attrValue);
}

function dirname(name: string): string {
  const index = name.lastIndexOf('/');
  return index === -1 ? '' : name.slice(0, index);
}

function basename(name: string): string {
  const index = name.lastIndexOf('/');
  return index === -1 ? name : name.slice(index + 1);
}

function encodePath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function encodeXmlText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function encodeXmlAttr(value: string): string {
  return encodeXmlText(value).replaceAll('"', '&quot;');
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
