import { BlobWriter, TextReader, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js';
import { describe, expect, it } from 'vitest';

import {
  analyzeQtiArchive,
  listZipEntries,
  loadZipArchive,
  readZipEntryText,
  trimQtiArchive,
} from './index.js';

describe('QTI archive trimming', () => {
  it('trims QTI resources, keeps referenced assets, and fixes duplicate titles', async () => {
    const input = await buildFixture();

    const before = await analyzeQtiArchive(input, 'input.imscc');
    expect(before.qtiEntries).toHaveLength(3);
    expect(before.titleReport.renames).toHaveLength(1);
    expect(before.localAssets.found).toEqual(['web_resources/Uploaded Media/diagram.png']);

    const result = await trimQtiArchive(input, 'input.imscc');
    const output = new Uint8Array(await result.blob.arrayBuffer());
    const outputArchive = await loadZipArchive(output, 'output.imscc');
    const entries = listZipEntries(outputArchive)
      .map((entry) => entry.name)
      .sort();

    expect(entries).toContain('imsmanifest.xml');
    expect(entries).toContain('quiz1/assessment_qti.xml');
    expect(entries).toContain('quiz1/assessment_meta.xml');
    expect(entries).toContain('non_cc_assessments/quiz1.xml.qti');
    expect(entries).toContain('non_cc_assessments/bank1.xml.qti');
    expect(entries).toContain('non_cc_assessments/bank2.xml.qti');
    expect(entries).toContain('web_resources/Uploaded Media/diagram.png');
    expect(entries).not.toContain('web_resources/huge-unused.pdf');
    expect(entries).not.toContain('wiki_content/page.html');

    const bank2 = await readZipEntryText(outputArchive, 'non_cc_assessments/bank2.xml.qti');
    expect(bank2).toMatch(/<fieldentry>Shared Bank \(2\)<\/fieldentry>/);

    const quiz = await readZipEntryText(outputArchive, 'non_cc_assessments/quiz1.xml.qti');
    expect(quiz).toMatch(/\$IMS-CC-FILEBASE\$\/Uploaded%20Media\/diagram\.png/);

    const after = await analyzeQtiArchive(output, 'output.imscc');
    expect(after.titleReport.duplicateSlugs).toHaveLength(0);
  });

  it('discovers QTI entries without a manifest', async () => {
    const zip = new ZipWriter(new BlobWriter('application/zip'));
    await zip.add('quiz.xml', new TextReader(assessmentStubXml('q1', 'No Manifest Quiz')));
    await zip.add('bank.xml.qti', new TextReader(bankXml('b1', 'Loose Bank')));
    await zip.add('not-qti.xml', new TextReader('<html><body>Not QTI</body></html>'));
    const input = await zip.close();

    const analysis = await analyzeQtiArchive(input, 'no-manifest.zip');
    expect(analysis.hasManifest).toBe(false);
    expect(analysis.qtiEntries).toHaveLength(2);
    const paths = analysis.qtiEntries.map((e) => e.qtiPath).sort();
    expect(paths).toEqual(['bank.xml.qti', 'quiz.xml']);
    expect(analysis.qtiEntries.every((e) => e.source === 'scan')).toBe(true);
  });

  it('falls back to scanning when the manifest has no QTI resources', async () => {
    const zip = new ZipWriter(new BlobWriter('application/zip'));
    await zip.add('imsmanifest.xml', new TextReader(emptyManifestXml()));
    await zip.add('quiz.xml', new TextReader(assessmentStubXml('q1', 'Loose Quiz')));
    await zip.add('not-qti.xml', new TextReader('<html><body>Not QTI</body></html>'));
    const input = await zip.close();

    const analysis = await analyzeQtiArchive(input, 'manifest-with-loose-qti.imscc');
    expect(analysis.hasManifest).toBe(true);
    expect(analysis.qtiEntries).toHaveLength(1);
    expect(analysis.qtiEntries[0]).toMatchObject({ qtiPath: 'quiz.xml', source: 'scan' });

    const result = await trimQtiArchive(input, 'manifest-with-loose-qti.imscc');
    const output = new Uint8Array(await result.blob.arrayBuffer());
    const outputArchive = await loadZipArchive(output, 'output.imscc');
    const entries = listZipEntries(outputArchive).map((entry) => entry.name);
    expect(entries).toContain('imsmanifest.xml');
    expect(entries).toContain('quiz.xml');
    expect(entries).not.toContain('not-qti.xml');
  });

  it('avoids slug collisions when renamed title matches an existing entry', async () => {
    const zip = new ZipWriter(new BlobWriter('application/zip'));
    await zip.add('bank-a.xml.qti', new TextReader(bankXml('a', 'Shared Bank')));
    await zip.add('bank-b.xml.qti', new TextReader(bankXml('b', 'Shared Bank')));
    await zip.add('bank-c.xml.qti', new TextReader(bankXml('c', 'Shared Bank (2)')));
    const input = await zip.close();

    const analysis = await analyzeQtiArchive(input, 'collisions.zip');
    expect(analysis.titleReport.duplicateSlugs.length).toBeGreaterThan(0);

    const result = await trimQtiArchive(input, 'collisions.zip');
    const output = new Uint8Array(await result.blob.arrayBuffer());
    const after = await analyzeQtiArchive(output, 'collisions-out.zip');
    expect(after.titleReport.duplicateSlugs).toHaveLength(0);
  });

  it('reports missing local asset references as warnings', async () => {
    const zip = new ZipWriter(new BlobWriter('application/zip'));
    const qtiXml =
      '<questestinterop><assessment ident="q1" title="Quiz"><section ident="s1"><item ident="i1" title="Q"><presentation><material><mattext texttype="text/html">&lt;img src="$IMS-CC-FILEBASE$/missing-image.png"&gt;</mattext></material></presentation></item></section></assessment></questestinterop>';
    await zip.add('quiz.xml', new TextReader(qtiXml));
    const input = await zip.close();

    const analysis = await analyzeQtiArchive(input, 'missing-asset.zip');
    expect(analysis.localAssets.missing).toContain('missing-image.png');
    expect(analysis.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'missing-local-asset',
          message: expect.stringContaining('missing-image.png'),
        }),
      ]),
    );
  });

  it('strips query strings and fragments when matching local assets', async () => {
    const zip = new ZipWriter(new BlobWriter('application/zip'));
    const qtiXml =
      '<questestinterop><assessment ident="q1" title="Quiz"><section ident="s1"><item ident="i1" title="Q"><presentation><material><mattext texttype="text/html">&lt;img src="$IMS-CC-FILEBASE$/Uploaded%20Media/diagram.png?ver=1#fragment"&gt;</mattext></material></presentation></item></section></assessment></questestinterop>';
    await zip.add('quiz.xml', new TextReader(qtiXml));
    await zip.add('web_resources/Uploaded Media/diagram.png', new TextReader('png'));
    const input = await zip.close();

    const result = await trimQtiArchive(input, 'asset-query.zip');
    expect(result.localAssets.found).toEqual(['web_resources/Uploaded Media/diagram.png']);
    expect(result.localAssets.missing).toEqual([]);

    const output = new Uint8Array(await result.blob.arrayBuffer());
    const outputArchive = await loadZipArchive(output, 'output.imscc');
    const entries = listZipEntries(outputArchive).map((entry) => entry.name);
    expect(entries).toContain('web_resources/Uploaded Media/diagram.png');

    const quiz = await readZipEntryText(outputArchive, 'quiz.xml');
    expect(quiz).toMatch(/\$IMS-CC-FILEBASE\$\/Uploaded%20Media\/diagram\.png/);
    expect(quiz).not.toContain('?ver=1');
    expect(quiz).not.toContain('#fragment');
  });

  it('handles course exports wrapped in a single top-level directory', async () => {
    const input = await buildFixture('course-export/');

    const result = await trimQtiArchive(input, 'input.imscc');
    const output = new Uint8Array(await result.blob.arrayBuffer());
    const outputArchive = await loadZipArchive(output, 'output.imscc');
    const entries = listZipEntries(outputArchive)
      .map((entry) => entry.name)
      .sort();

    expect(entries).toContain('course-export/imsmanifest.xml');
    expect(entries).toContain('course-export/quiz1/assessment_qti.xml');
    expect(entries).toContain('course-export/quiz1/assessment_meta.xml');
    expect(entries).toContain('course-export/non_cc_assessments/quiz1.xml.qti');
    expect(entries).toContain('course-export/non_cc_assessments/bank1.xml.qti');
    expect(entries).toContain('course-export/web_resources/Uploaded Media/diagram.png');
    expect(entries).not.toContain('course-export/web_resources/huge-unused.pdf');
    expect(entries).not.toContain('course-export/wiki_content/page.html');

    const after = await analyzeQtiArchive(output, 'output.imscc');
    expect(after.hasManifest).toBe(true);
    expect(after.qtiEntries.map((entry) => entry.qtiPath)).toContain(
      'course-export/non_cc_assessments/quiz1.xml.qti',
    );
  });
});

async function buildFixture(prefix = ''): Promise<Blob> {
  const zip = new ZipWriter(new BlobWriter('application/zip'));
  await zip.add(`${prefix}imsmanifest.xml`, new TextReader(manifestXml()));
  await zip.add(
    `${prefix}quiz1/assessment_qti.xml`,
    new TextReader(assessmentStubXml('quiz1', 'Quiz One')),
  );
  await zip.add(
    `${prefix}quiz1/assessment_meta.xml`,
    new TextReader('<quiz><title>Quiz One</title></quiz>'),
  );
  await zip.add(`${prefix}non_cc_assessments/quiz1.xml.qti`, new TextReader(assessmentFullXml()));
  await zip.add(
    `${prefix}non_cc_assessments/bank1.xml.qti`,
    new TextReader(bankXml('bank1', 'Shared Bank')),
  );
  await zip.add(
    `${prefix}non_cc_assessments/bank2.xml.qti`,
    new TextReader(bankXml('bank2', 'Shared Bank')),
  );
  await zip.add(`${prefix}web_resources/Uploaded Media/diagram.png`, new TextReader('png'));
  await zip.add(`${prefix}web_resources/huge-unused.pdf`, new Uint8ArrayReader(new Uint8Array(16)));
  await zip.add(`${prefix}wiki_content/page.html`, new TextReader('<html></html>'));
  return zip.close();
}

function manifestXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="m1" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1">
  <organizations>
    <organization identifier="org_1">
      <item identifier="item1" identifierref="quiz1"><title>Quiz One</title></item>
      <item identifier="page" identifierref="unused_page"><title>Page</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="quiz1" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment">
      <file href="quiz1/assessment_qti.xml"/>
      <dependency identifierref="quiz1_meta"/>
    </resource>
    <resource identifier="quiz1_meta" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="quiz1/assessment_meta.xml">
      <file href="quiz1/assessment_meta.xml"/>
      <file href="non_cc_assessments/quiz1.xml.qti"/>
    </resource>
    <resource identifier="bank1" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="non_cc_assessments/bank1.xml.qti">
      <file href="non_cc_assessments/bank1.xml.qti"/>
    </resource>
    <resource identifier="bank2" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="non_cc_assessments/bank2.xml.qti">
      <file href="non_cc_assessments/bank2.xml.qti"/>
    </resource>
    <resource identifier="asset" type="webcontent" href="web_resources/Uploaded Media/diagram.png">
      <file href="web_resources/Uploaded Media/diagram.png"/>
    </resource>
    <resource identifier="unused_page" type="webcontent" href="wiki_content/page.html">
      <file href="wiki_content/page.html"/>
    </resource>
  </resources>
</manifest>`;
}

function emptyManifestXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="m1" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1">
  <resources>
    <resource identifier="page" type="webcontent" href="not-qti.xml">
      <file href="not-qti.xml"/>
    </resource>
  </resources>
</manifest>`;
}

function assessmentStubXml(id: string, title: string): string {
  return `<questestinterop><assessment ident="${id}" title="${title}"><section ident="root_section"/></assessment></questestinterop>`;
}

function assessmentFullXml(): string {
  return '<questestinterop><assessment ident="quiz1" title="Quiz One"><section ident="root_section"><item ident="q1" title="Question"><presentation><material><mattext texttype="text/html">&lt;img src="$IMS-CC-FILEBASE$/Uploaded Media/diagram.png"&gt;</mattext></material></presentation></item></section></assessment></questestinterop>';
}

function bankXml(id: string, title: string): string {
  return `<questestinterop><objectbank ident="${id}"><qtimetadata><qtimetadatafield><fieldlabel>bank_title</fieldlabel><fieldentry>${title}</fieldentry></qtimetadatafield></qtimetadata><item ident="${id}-q1" title="Question"/></objectbank></questestinterop>`;
}
