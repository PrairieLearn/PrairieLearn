import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  type PDFObject,
  PDFRawStream,
  PDFRef,
  PDFString,
  decodePDFRawStream,
} from 'pdf-lib';
import { chromium } from 'playwright';
import { assert, expect, it } from 'vitest';

import { createPdfOutput } from './pdf-output.js';

it('exports tagged PDF math, figures, and document structure from source semantics', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html>
      <html lang="en">
        <head>
          <title>Accessible assessment</title>
          <style>
            @page { size: letter; margin: 0; }
            body { margin: 36px; font: 16px Arial; }
          </style>
        </head>
        <body>
          <h1>Accessible assessment</h1>
          <p lang="fr">Lisez chaque question.</p>
          <h2>Question 1</h2>
          <ol><li>Read the expression.</li><li>Explain your answer.</li></ol>
          <p>Evaluate
            <mjx-container data-semantic-speech-none="x squared" style="display: inline-block">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="24">
                <text x="0" y="18">x²</text>
              </svg>
              <mjx-speech role="img" aria-label="x squared, math" style="display: inline-block; width: 1px; height: 1px"></mjx-speech>
            </mjx-container>.
          </p>
          <svg xmlns="http://www.w3.org/2000/svg" role="img" width="48" height="48" style="display: block">
            <title>A square</title>
            <desc>All four sides are equal</desc>
            <rect x="4" y="4" width="40" height="40" fill="none" stroke="black" />
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A generic diagram" aria-labelledby="circle-name"
               aria-describedby="circle-description" width="48" height="48" style="display: block">
            <circle cx="24" cy="24" r="20" fill="none" stroke="black" />
          </svg>
          <p id="circle-name" hidden>A circle</p>
          <p id="circle-description" hidden>The radius is twenty units</p>
          <div role="img" aria-label="A directed graph" aria-description="A points to B">
            <svg width="40" height="40"><svg width="40" height="40">
              <path d="M0 0L40 40" stroke="black" />
            </svg></svg>
          </div>
          <table>
            <caption>Values</caption>
            <thead><tr><th id="input" scope="col">Input</th><th id="result" scope="col">Result</th></tr></thead>
            <tbody><tr><td headers="input">2</td><td headers="result">4</td></tr></tbody>
          </table>
          <section data-print-pdf-role="Div" data-print-pdf-decorative-paint style="border: 1px solid; padding: 8px">
            <div data-print-pdf-role="Div" data-print-pdf-decorative-paint style="border-left: 2px solid; padding-left: 8px">
              <h2 id="references">References</h2>
              <p>Read the <a href="https://www.prairielearn.com/">PrairieLearn home page</a>.</p>
              <p><a href="https://www.prairielearn.com/" aria-label="Course website">
                <svg aria-label="PrairieLearn logo" width="20" height="20"><rect width="10" height="10" /></svg>
              </a></p>
              <p><a href="#references">Return to references</a></p>
            </div>
          </section>
          <footer data-print-pdf-role="Artifact">Page 1</footer>
        </body>
      </html>`);

    const pdf = await PDFDocument.load(await createPdfOutput().produce(page));
    const { context } = pdf;
    const root = pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
    const parents = new Map<number, PDFObject>();

    function readParents(node: PDFDict): void {
      const numbers = node.lookup(PDFName.of('Nums'));
      if (numbers instanceof PDFArray) {
        for (let index = 0; index < numbers.size(); index += 2) {
          parents.set(numbers.lookup(index, PDFNumber).asNumber(), numbers.get(index + 1));
        }
      }
      const children = node.lookup(PDFName.of('Kids'));
      if (children instanceof PDFArray) {
        for (const child of children.asArray()) readParents(context.lookup(child, PDFDict));
      }
    }
    readParents(root.lookup(PDFName.of('ParentTree'), PDFDict));

    const elements: PDFDict[] = [];
    const structureReferences: PDFObject[] = [];
    const relationships: { actual: PDFObject | undefined; expected: PDFDict }[] = [];

    function collectChildren(owner: PDFDict, inheritedPage?: PDFDict): void {
      const page = owner.lookupMaybe(PDFName.of('Pg'), PDFDict) ?? inheritedPage;
      for (const raw of owner.lookup(PDFName.of('K'), PDFArray).asArray()) {
        const child = context.lookup(raw);
        if (child instanceof PDFDict && child.has(PDFName.of('S'))) {
          structureReferences.push(raw);
          relationships.push({ actual: child.lookup(PDFName.of('P')), expected: owner });
          elements.push(child);
          collectChildren(child, page);
        } else if (child instanceof PDFNumber) {
          const parent = page!.lookup(PDFName.of('StructParents'), PDFNumber).asNumber();
          relationships.push({
            actual: context.lookup(parents.get(parent), PDFArray).lookup(child.asNumber()),
            expected: owner,
          });
        } else if (
          child instanceof PDFDict &&
          child.lookup(PDFName.of('Type')) === PDFName.of('OBJR')
        ) {
          const annotation = child.lookup(PDFName.of('Obj'), PDFDict);
          const parent = annotation.lookup(PDFName.of('StructParent'), PDFNumber).asNumber();
          relationships.push({ actual: context.lookup(parents.get(parent)), expected: owner });
        }
      }
    }
    collectChildren(root);
    for (const reference of structureReferences) expect(reference).toBeInstanceOf(PDFRef);
    for (const { actual, expected } of relationships) expect(actual).toBe(expected);

    const roles = elements.map((element) => element.lookup(PDFName.of('S'), PDFName).decodeText());
    expect(roles).toEqual(
      expect.arrayContaining([
        'H1',
        'H2',
        'L',
        'LI',
        'Table',
        'TH',
        'TD',
        'Formula',
        'Figure',
        'Div',
        'Link',
      ]),
    );
    const descriptions = elements.map((element) =>
      element.lookupMaybe(PDFName.of('Alt'), PDFString, PDFHexString)?.decodeText(),
    );
    expect(descriptions).toEqual(
      expect.arrayContaining([
        'x squared',
        'A square. All four sides are equal',
        'A circle. The radius is twenty units',
        'A directed graph. A points to B',
        'PrairieLearn logo',
      ]),
    );
    expect(
      elements.some(
        (element) =>
          element.lookupMaybe(PDFName.of('Lang'), PDFString, PDFHexString)?.decodeText() === 'fr',
      ),
    ).toBe(true);
    const headers = elements.filter(
      (element) => element.lookup(PDFName.of('S')) === PDFName.of('TH'),
    );
    const cells = elements.filter(
      (element) => element.lookup(PDFName.of('S')) === PDFName.of('TD'),
    );
    for (const [index, cell] of cells.entries()) {
      const attributes = cell
        .lookup(PDFName.of('A'), PDFArray)
        .asArray()
        .map((entry) => context.lookup(entry, PDFDict));
      const references = attributes
        .find((entry) => entry.has(PDFName.of('Headers')))!
        .lookup(PDFName.of('Headers'), PDFArray);
      expect(references.lookup(0, PDFString, PDFHexString).decodeText()).toBe(
        headers[index].lookup(PDFName.of('ID'), PDFString, PDFHexString).decodeText(),
      );
    }
    const pdfPage = pdf.getPages()[0];
    const contents = pdfPage.node.lookup(PDFName.of('Contents'));
    assert(contents instanceof PDFRawStream);
    expect(Buffer.from(decodePDFRawStream(contents).decode()).toString('latin1')).toContain(
      '/Artifact BMC',
    );
    const links = pdfPage.node
      .lookup(PDFName.of('Annots'), PDFArray)
      .asArray()
      .map((entry) => context.lookup(entry, PDFDict));
    expect([
      ...new Set(
        links.map((link) =>
          link.lookup(PDFName.of('Contents'), PDFString, PDFHexString).decodeText(),
        ),
      ),
    ]).toEqual(['PrairieLearn home page', 'Course website', 'Return to references']);
    expect(links.at(-1)!.lookup(PDFName.of('Dest'), PDFName).decodeText()).toBe('references');
    expect(pdfPage.node.lookup(PDFName.of('Tabs'))).toBe(PDFName.of('S'));
    expect(pdf.getTitle()).toBe('Accessible assessment');
    expect(pdf.catalog.lookup(PDFName.of('Lang'), PDFString, PDFHexString).decodeText()).toBe('en');
    expect(pdf.catalog.getOrCreateViewerPreferences().getDisplayDocTitle()).toBe(true);
    const metadata = pdf.catalog.lookup(PDFName.of('Metadata'));
    assert(metadata instanceof PDFRawStream);
    const xmp = Buffer.from(decodePDFRawStream(metadata).decode()).toString('utf8');
    expect(xmp).toContain('<pdfuaid:part>1</pdfuaid:part>');
    expect(xmp).toContain('<rdf:li xml:lang="x-default">Accessible assessment</rdf:li>');
    await page.setContent(`<!doctype html><html lang="en"><title>Linked graphic</title><body>
      <svg aria-label="Course diagram" width="40" height="40">
        <a href="https://www.prairielearn.com/"><rect width="30" height="30" /></a>
      </svg>
    </body></html>`);
    await expect(createPdfOutput().produce(page)).rejects.toThrow(
      'Place the link outside the image',
    );
  } finally {
    await browser.close();
  }
}, 60_000);
