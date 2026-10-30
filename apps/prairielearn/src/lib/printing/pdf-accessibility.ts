import { setImmediate } from 'node:timers/promises';

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  type PDFObject,
  PDFRawStream,
  PDFString,
  decodePDFRawStream,
} from 'pdf-lib';

import type { PdfAccessibilityManifest } from './pdf-accessibility-browser.js';
import { type PdfContentMark, rewritePdfContent } from './pdf-content-stream.js';

type Artifact = NonNullable<PdfContentMark['artifact']>;

function pdfText(value: PDFObject | undefined): string | undefined {
  return value instanceof PDFString || value instanceof PDFHexString
    ? value.decodeText()
    : undefined;
}

function decodeContent(stream: PDFObject | undefined): Uint8Array {
  if (!(stream instanceof PDFRawStream)) {
    throw new Error('Expected a PDF content stream.');
  }
  const filter = stream.dict.lookup(PDFName.of('Filter'));
  const parameters = stream.dict.lookup(PDFName.of('DecodeParms'));
  if (filter && filter !== PDFName.of('FlateDecode')) {
    throw new Error(`Unsupported PDF content filter: ${filter.toString()}.`);
  }
  if (parameters && parameters !== PDFNull) {
    throw new Error('PDF content stream decoding parameters are unsupported.');
  }
  return decodePDFRawStream(stream).decode();
}

/** Restore source-declared semantics without reconstructing meaning from PDF drawing. */
export async function finalizePrintPdf(
  input: Uint8Array,
  manifest: PdfAccessibilityManifest,
  signal?: AbortSignal,
): Promise<Buffer> {
  signal?.throwIfAborted();
  const document = await PDFDocument.load(input, {
    updateMetadata: false,
    throwOnInvalidObject: true,
  });
  const { context } = document;
  const root = document.catalog.lookup(PDFName.of('StructTreeRoot'));
  if (!(root instanceof PDFDict)) {
    throw new Error('Chromium did not produce a tagged PDF.');
  }
  if (!manifest.title.trim() || !manifest.language.trim()) {
    throw new Error('PDF title and language are required.');
  }
  const tags = new Map<string, PdfAccessibilityManifest['tags'][number]>();
  for (const tag of manifest.tags) {
    if (!tag.marker || tags.has(tag.marker)) {
      throw new Error('PDF source markers must be unique.');
    }
    tags.set(tag.marker, tag);
  }
  const pages = document.getPages();
  const pageContent = new Map<
    PDFDict,
    { artifacts: Map<number, Artifact>; meaningful: Set<number> }
  >(
    pages.map(({ node }) => [
      node,
      { artifacts: new Map<number, Artifact>(), meaningful: new Set<number>() },
    ]),
  );
  const found = new Set<string>();
  const seenElements = new Set<PDFDict>();

  function transformKids(
    owner: PDFDict,
    inheritedPage?: PDFObject,
    inheritedArtifact?: Artifact,
    ownDecoration = false,
  ): void {
    signal?.throwIfAborted();
    if (seenElements.has(owner)) {
      throw new Error('Repeated or circular PDF structure element.');
    }
    seenElements.add(owner);
    const page = owner.lookup(PDFName.of('Pg')) ?? inheritedPage;
    const rawKids = owner.get(PDFName.of('K'));
    const kids = context.lookup(rawKids);
    // Keep indirect references even when Chromium gives an element only one child.
    const entries = kids instanceof PDFArray ? kids.asArray() : rawKids ? [rawKids] : [];
    const result: PDFObject[] = [];
    for (const raw of entries) {
      const child = context.lookup(raw);
      if (child instanceof PDFDict && child.has(PDFName.of('S'))) {
        const marker = pdfText(child.lookup(PDFName.of('Alt')));
        const tag = marker ? tags.get(marker) : undefined;
        let artifact = inheritedArtifact;
        let decoration = false;
        if (tag) {
          if (found.has(tag.marker)) {
            throw new Error(`A PDF source marker was duplicated: ${tag.marker}.`);
          }
          found.add(tag.marker);
          if (tag.role === 'Artifact') {
            artifact = 'all';
          } else {
            if ((tag.role === 'Formula' || tag.role === 'Figure') && !tag.alt?.trim()) {
              throw new Error('A formula or figure has no alternative description.');
            }
            child.set(PDFName.of('S'), PDFName.of(tag.role));
            if (tag.alt?.trim()) child.set(PDFName.of('Alt'), PDFHexString.fromText(tag.alt));
            else child.delete(PDFName.of('Alt'));
            decoration = tag.decorativePaint === true;
          }
        }
        transformKids(child, page, artifact, decoration);
        if (!artifact) result.push(raw);
      } else if (
        child instanceof PDFNumber ||
        (child instanceof PDFDict && child.lookup(PDFName.of('Type')) === PDFName.of('MCR'))
      ) {
        let contentPage = page;
        let mcid: PDFObject | undefined = child;
        if (child instanceof PDFDict) {
          mcid = child.lookup(PDFName.of('MCID'));
          contentPage = child.lookup(PDFName.of('Pg')) ?? contentPage;
          if (child.has(PDFName.of('Stm'))) {
            throw new Error('Nested PDF structure streams are unsupported.');
          }
        }
        const markings = contentPage instanceof PDFDict ? pageContent.get(contentPage) : undefined;
        if (
          !markings ||
          !(mcid instanceof PDFNumber) ||
          !Number.isInteger(mcid.asNumber()) ||
          mcid.asNumber() < 0
        ) {
          throw new Error('PDF content has no valid page or marked-content identifier.');
        }
        const id = mcid.asNumber();
        const artifact = inheritedArtifact ?? (ownDecoration ? 'decoration' : undefined);
        if (artifact) {
          markings.artifacts.set(id, artifact);
        } else {
          markings.meaningful.add(id);
          result.push(raw);
        }
      } else {
        if (inheritedArtifact) {
          throw new Error('A decorative element contains a PDF annotation.');
        }
        if (
          child instanceof PDFDict &&
          child.lookup(PDFName.of('Type')) === PDFName.of('OBJR') &&
          owner.lookup(PDFName.of('S')) === PDFName.of('Link')
        ) {
          const description = pdfText(owner.lookup(PDFName.of('Alt')));
          if (!description?.trim()) throw new Error('A PDF link has no source description.');
          child
            .lookup(PDFName.of('Obj'), PDFDict)
            .set(PDFName.of('Contents'), PDFHexString.fromText(description));
        }
        result.push(raw);
      }
    }
    owner.set(PDFName.of('K'), context.obj(result));
  }

  transformKids(root);
  const missing = [...tags.keys()].filter((marker) => !found.has(marker));
  if (missing.length > 0) {
    throw new Error(`Chromium omitted declared PDF structure: ${missing.join(', ')}.`);
  }
  const pageParents = new Map<number, PDFDict>();
  for (const page of pages) {
    const key = page.node.lookup(PDFName.of('StructParents'));
    if (key instanceof PDFNumber) pageParents.set(key.asNumber(), page.node);
  }
  const parentTreeNodes = new Set<PDFDict>();

  function clearParentTree(node: PDFObject | undefined): void {
    signal?.throwIfAborted();
    if (!(node instanceof PDFDict)) return;
    if (parentTreeNodes.has(node)) {
      throw new Error('Repeated or circular PDF parent tree.');
    }
    parentTreeNodes.add(node);
    const numbers = node.lookup(PDFName.of('Nums'));
    if (numbers instanceof PDFArray) {
      for (let index = 0; index < numbers.size(); index += 2) {
        const key = numbers.lookup(index, PDFNumber).asNumber();
        const entries = numbers.lookup(index + 1);
        const page = pageParents.get(key);
        if (!(entries instanceof PDFArray) || !page) continue;
        for (const mcid of pageContent.get(page)!.artifacts.keys()) {
          if (mcid >= entries.size()) {
            throw new Error('Decorative content has no parent-tree entry.');
          }
          entries.set(mcid, PDFNull);
        }
      }
    }
    const kids = node.lookup(PDFName.of('Kids'));
    if (kids instanceof PDFArray) {
      for (const child of kids.asArray()) clearParentTree(context.lookup(child));
    }
  }
  clearParentTree(root.lookup(PDFName.of('ParentTree')));

  async function rewriteContent(
    bytes: Uint8Array,
    resources: PDFDict | undefined,
    page: PDFDict,
    inheritedMarks: readonly PdfContentMark[],
    activeForms: Set<PDFRawStream>,
    location: string,
  ): Promise<Uint8Array> {
    const markings = pageContent.get(page)!;
    return await rewritePdfContent(bytes, {
      signal,
      location,
      inheritedMarks,
      classify(mcid) {
        return {
          tagged: markings.meaningful.has(mcid),
          artifact: markings.artifacts.get(mcid) ?? null,
        };
      },
      resolveProperties(key) {
        const properties = resources?.lookupMaybe(PDFName.of('Properties'), PDFDict);
        const value = properties?.lookup(PDFName.of(key));
        return value instanceof PDFDict ? value : undefined;
      },
      async visitForm(key, marks) {
        const xobjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
        const object = xobjects?.lookup(PDFName.of(key));
        if (!(object instanceof PDFRawStream)) {
          throw new Error(`Missing PDF XObject: ${key}.`);
        }
        if (object.dict.lookup(PDFName.of('Subtype')) !== PDFName.of('Form')) return;
        if (activeForms.has(object)) {
          throw new Error('Recursive PDF form content.');
        }
        if (object.dict.has(PDFName.of('StructParents'))) {
          throw new Error('Nested PDF structure streams are unsupported.');
        }
        activeForms.add(object);
        const original = decodeContent(object);
        const rewritten = await rewriteContent(
          original,
          object.dict.lookupMaybe(PDFName.of('Resources'), PDFDict) ?? resources,
          page,
          marks,
          activeForms,
          `${location} form ${key}`,
        );
        activeForms.delete(object);
        if (!Buffer.from(original).equals(Buffer.from(rewritten))) {
          throw new Error('Rewriting shared PDF form content is unsupported.');
        }
      },
    });
  }

  for (const [index, page] of pages.entries()) {
    // Let the render timeout and shutdown signal interrupt work between pages.
    await setImmediate(undefined, { signal });
    const contents = page.node.lookup(PDFName.of('Contents'));
    const streams =
      contents instanceof PDFArray
        ? contents.asArray().map((reference) => context.lookup(reference))
        : [contents];
    const bytes = Buffer.concat(
      streams.flatMap((stream) => [decodeContent(stream), Buffer.from('\n')]),
    );
    const output = await rewriteContent(
      bytes,
      page.node.Resources(),
      page.node,
      [],
      new Set(),
      `page ${index + 1}`,
    );
    page.node.set(PDFName.of('Contents'), context.register(context.flateStream(output)));
    const annotations = page.node.lookup(PDFName.of('Annots'));
    if (annotations instanceof PDFArray && annotations.size()) {
      page.node.set(PDFName.of('Tabs'), PDFName.of('S'));
      for (const entry of annotations.asArray()) {
        const annotation = context.lookup(entry, PDFDict);
        if (
          annotation.lookup(PDFName.of('Subtype')) === PDFName.of('Link') &&
          !pdfText(annotation.lookup(PDFName.of('Contents')))?.trim()
        ) {
          throw new Error('A PDF link has no source description.');
        }
      }
    }
  }
  await setImmediate(undefined, { signal });
  document.setTitle(manifest.title);
  document.setLanguage(manifest.language);
  document.catalog.getOrCreateViewerPreferences().setDisplayDocTitle(true);
  const title = manifest.title
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  const xmp =
    '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/">' +
    `<pdfuaid:part>1</pdfuaid:part><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li>` +
    '</rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  document.catalog.set(
    PDFName.of('Metadata'),
    context.register(context.stream(Buffer.from(xmp), { Type: 'Metadata', Subtype: 'XML' })),
  );
  signal?.throwIfAborted();
  const output = await document.save({ useObjectStreams: true, addDefaultPage: false });
  await setImmediate(undefined, { signal });
  return Buffer.from(output);
}
