import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import archiver from 'archiver';

import { deleteQtiImportDraft } from '../../lib/qti-import-drafts.js';
import type { UploadResponse } from '../../pages/instructorQtiImport/instructorQtiImport.types.js';

import { expect, test } from './fixtures.js';

/**
 * Build a minimal QTI 1.2 quiz export zip on disk.
 * Contains one multiple-choice question with two options.
 */
async function buildQtiZip(
  destPath: string,
  options?: { includeManifest?: boolean; resourceType?: string },
): Promise<void> {
  const qtiXml = `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="test_assess_1" title="E2E Import Quiz">
    <section ident="root_section">
      <item ident="q_mc_1" title="Sample MC Question">
        <itemmetadata>
          <qtimetadata>
            <qtimetadatafield>
              <fieldlabel>question_type</fieldlabel>
              <fieldentry>multiple_choice_question</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>points_possible</fieldlabel>
              <fieldentry>1.0</fieldentry>
            </qtimetadatafield>
          </qtimetadata>
        </itemmetadata>
        <presentation>
          <material>
            <mattext texttype="text/html">&lt;p&gt;What color is the sky?&lt;/p&gt;</mattext>
          </material>
          <response_lid ident="response1" rcardinality="Single">
            <render_choice>
              <response_label ident="1001">
                <material><mattext texttype="text/plain">Blue</mattext></material>
              </response_label>
              <response_label ident="1002">
                <material><mattext texttype="text/plain">Green</mattext></material>
              </response_label>
            </render_choice>
          </response_lid>
        </presentation>
        <resprocessing>
          <outcomes>
            <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>
          </outcomes>
          <respcondition continue="No">
            <conditionvar>
              <varequal respident="response1">1001</varequal>
            </conditionvar>
            <setvar action="Set" varname="SCORE">100</setvar>
          </respcondition>
        </resprocessing>
      </item>
    </section>
  </assessment>
</questestinterop>`;

  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="test_manifest" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1">
  <resources>
    <resource identifier="test_assess_1" type="${options?.resourceType ?? 'imsqti_xmlv1p2/imscc_xmlv1p1/assessment'}">
      <file href="test_assess_1/test_assess_1.xml"/>
    </resource>
  </resources>
</manifest>`;

  const archive = archiver('zip');
  const output = createWriteStream(destPath);
  if (options?.includeManifest !== false) {
    archive.append(manifest, { name: 'imsmanifest.xml' });
    archive.append(qtiXml, { name: 'test_assess_1/test_assess_1.xml' });
  } else {
    archive.append(qtiXml, { name: 'test_assess_1.xml' });
  }
  void archive.finalize();
  await pipeline(archive, output);
}

async function buildQtiZipWithUnusedAsset(destPath: string): Promise<void> {
  const qtiXml = `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="test_assess_assets" title="E2E Asset Quiz">
    <section ident="root_section">
      <item ident="q_asset_1" title="Asset Question">
        <itemmetadata>
          <qtimetadata>
            <qtimetadatafield>
              <fieldlabel>question_type</fieldlabel>
              <fieldentry>multiple_choice_question</fieldentry>
            </qtimetadatafield>
          </qtimetadata>
        </itemmetadata>
        <presentation>
          <material>
            <mattext texttype="text/html">&lt;p&gt;&lt;img src="$IMS-CC-FILEBASE$/used.png" alt="Used"&gt;&lt;/p&gt;</mattext>
          </material>
          <response_lid ident="response1" rcardinality="Single">
            <render_choice>
              <response_label ident="1001">
                <material><mattext texttype="text/plain">Correct</mattext></material>
              </response_label>
              <response_label ident="1002">
                <material><mattext texttype="text/plain">Incorrect</mattext></material>
              </response_label>
            </render_choice>
          </response_lid>
        </presentation>
        <resprocessing>
          <respcondition continue="No">
            <conditionvar>
              <varequal respident="response1">1001</varequal>
            </conditionvar>
            <setvar action="Set" varname="SCORE">100</setvar>
          </respcondition>
        </resprocessing>
      </item>
    </section>
  </assessment>
</questestinterop>`;

  const archive = archiver('zip');
  const output = createWriteStream(destPath);
  archive.append(qtiXml, { name: 'asset-quiz.xml' });
  archive.append(Buffer.from('used image'), { name: 'web_resources/used.png' });
  archive.append(Buffer.from('unused image'), { name: 'web_resources/unused.png' });
  archive.append('not an imported binary asset', { name: 'web_resources/notes.txt' });
  void archive.finalize();
  await pipeline(archive, output);
}

async function buildEmbeddedBankCourseZip(destPath: string): Promise<void> {
  const assessmentXml = `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="embedded_bank_assessment" title="Embedded Bank Quiz">
    <section ident="root_section">
      <section ident="bank_section" title="Embedded Bank Questions">
        <selection_ordering>
          <selection>
            <selection_number>1</selection_number>
            <sourcebank_ref>embedded_bank_1</sourcebank_ref>
            <selection_extension>
              <points_per_item>2</points_per_item>
            </selection_extension>
          </selection>
        </selection_ordering>
      </section>
    </section>
  </assessment>
</questestinterop>`;

  const bankXml = `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <objectbank ident="embedded_bank_1">
    <qtimetadata>
      <qtimetadatafield>
        <fieldlabel>bank_title</fieldlabel>
        <fieldentry>Embedded Bank</fieldentry>
      </qtimetadatafield>
    </qtimetadata>
    <item ident="embedded_bank_q_1" title="Embedded Bank Question">
      <itemmetadata>
        <qtimetadata>
          <qtimetadatafield>
            <fieldlabel>question_type</fieldlabel>
            <fieldentry>multiple_choice_question</fieldentry>
          </qtimetadatafield>
          <qtimetadatafield>
            <fieldlabel>points_possible</fieldlabel>
            <fieldentry>1.0</fieldentry>
          </qtimetadatafield>
        </qtimetadata>
      </itemmetadata>
      <presentation>
        <material>
          <mattext texttype="text/html">&lt;p&gt;Embedded prompt&lt;/p&gt;</mattext>
        </material>
        <response_lid ident="response1" rcardinality="Single">
          <render_choice>
            <response_label ident="1001">
              <material><mattext texttype="text/plain">Correct</mattext></material>
            </response_label>
            <response_label ident="1002">
              <material><mattext texttype="text/plain">Incorrect</mattext></material>
            </response_label>
          </render_choice>
        </response_lid>
      </presentation>
      <resprocessing>
        <respcondition continue="No">
          <conditionvar>
            <varequal respident="response1">1001</varequal>
          </conditionvar>
          <setvar action="Set" varname="SCORE">100</setvar>
        </respcondition>
      </resprocessing>
    </item>
  </objectbank>
</questestinterop>`;

  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="embedded_bank_manifest" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1">
  <resources>
    <resource identifier="embedded_bank_assessment" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment">
      <file href="embedded_bank_assessment/assessment_qti.xml"/>
      <dependency identifierref="embedded_bank_assessment_meta"/>
    </resource>
    <resource identifier="embedded_bank_assessment_meta" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="embedded_bank_assessment/assessment_meta.xml">
      <file href="embedded_bank_assessment/assessment_meta.xml"/>
      <file href="non_cc_assessments/embedded_bank_assessment.xml.qti"/>
    </resource>
    <resource identifier="embedded_bank_1" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="non_cc_assessments/embedded_bank_1.xml.qti">
      <file href="non_cc_assessments/embedded_bank_1.xml.qti"/>
    </resource>
  </resources>
</manifest>`;

  const archive = archiver('zip');
  const output = createWriteStream(destPath);
  archive.append(manifest, { name: 'imsmanifest.xml' });
  archive.append('<quiz/>', { name: 'embedded_bank_assessment/assessment_meta.xml' });
  archive.append(assessmentXml, { name: 'embedded_bank_assessment/assessment_qti.xml' });
  archive.append(assessmentXml, { name: 'non_cc_assessments/embedded_bank_assessment.xml.qti' });
  archive.append(bankXml, { name: 'non_cc_assessments/embedded_bank_1.xml.qti' });
  void archive.finalize();
  await pipeline(archive, output);
}

async function buildExternalBankAssessmentZip(
  destPath: string,
  { includeCourseId = true }: { includeCourseId?: boolean } = {},
): Promise<void> {
  const qtiXml = `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="test_assess_bank_ref" title="E2E Bank Ref Quiz">
    <section ident="root_section">
      <section ident="bank_section" title="Bank Questions">
        <selection_ordering>
          <selection>
            <selection_number>1</selection_number>
            <sourcebank_ref>12345</sourcebank_ref>
            <sourcebank_export_id>external_bank_1</sourcebank_export_id>
            <selection_extension>
              <points_per_item>2</points_per_item>
              ${
                includeCourseId
                  ? `<sourcebank_is_external>true</sourcebank_is_external>
              <sourcebank_context>course_12345</sourcebank_context>`
                  : ''
              }
            </selection_extension>
          </selection>
        </selection_ordering>
      </section>
    </section>
  </assessment>
</questestinterop>`;

  const archive = archiver('zip');
  const output = createWriteStream(destPath);
  archive.append(qtiXml, { name: 'bank-ref.xml' });
  void archive.finalize();
  await pipeline(archive, output);
}

async function buildMultiExternalBankAssessmentZip(destPath: string): Promise<void> {
  const qtiXml = `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="test_assess_multi_bank_ref" title="E2E Multi Bank Ref Quiz">
    <section ident="root_section">
      <section ident="bank_section_1" title="Bank Questions 1">
        <selection_ordering>
          <selection>
            <selection_number>1</selection_number>
            <sourcebank_ref>12345</sourcebank_ref>
            <sourcebank_export_id>external_bank_1</sourcebank_export_id>
            <selection_extension>
              <points_per_item>2</points_per_item>
              <sourcebank_is_external>true</sourcebank_is_external>
              <sourcebank_context>course_12345</sourcebank_context>
            </selection_extension>
          </selection>
        </selection_ordering>
      </section>
      <section ident="bank_section_2" title="Bank Questions 2">
        <selection_ordering>
          <selection>
            <selection_number>1</selection_number>
            <sourcebank_ref>67890</sourcebank_ref>
            <sourcebank_export_id>external_bank_2</sourcebank_export_id>
            <selection_extension>
              <points_per_item>3</points_per_item>
              <sourcebank_is_external>true</sourcebank_is_external>
              <sourcebank_context>course_67890</sourcebank_context>
            </selection_extension>
          </selection>
        </selection_ordering>
      </section>
    </section>
  </assessment>
</questestinterop>`;

  const archive = archiver('zip');
  const output = createWriteStream(destPath);
  archive.append(qtiXml, { name: 'multi-bank-ref.xml' });
  void archive.finalize();
  await pipeline(archive, output);
}

async function buildQuestionBankZip(
  destPath: string,
  {
    bankId = 'external_bank_1',
    questionId = 'bank_q_1',
    title = 'External Bank',
    questionTitle = 'Imported Bank Question',
  }: {
    bankId?: string;
    questionId?: string;
    title?: string;
    questionTitle?: string;
  } = {},
): Promise<void> {
  const qtiXml = `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <objectbank ident="${bankId}" title="${title}">
    <section ident="root_section">
      <item ident="${questionId}" title="${questionTitle}">
        <itemmetadata>
          <qtimetadata>
            <qtimetadatafield>
              <fieldlabel>question_type</fieldlabel>
              <fieldentry>multiple_choice_question</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>points_possible</fieldlabel>
              <fieldentry>1.0</fieldentry>
            </qtimetadatafield>
          </qtimetadata>
        </itemmetadata>
        <presentation>
          <material>
            <mattext texttype="text/html">&lt;p&gt;Bank prompt&lt;/p&gt;</mattext>
          </material>
          <response_lid ident="response1" rcardinality="Single">
            <render_choice>
              <response_label ident="1001">
                <material><mattext texttype="text/plain">Correct</mattext></material>
              </response_label>
              <response_label ident="1002">
                <material><mattext texttype="text/plain">Incorrect</mattext></material>
              </response_label>
            </render_choice>
          </response_lid>
        </presentation>
        <resprocessing>
          <respcondition continue="No">
            <conditionvar>
              <varequal respident="response1">1001</varequal>
            </conditionvar>
            <setvar action="Set" varname="SCORE">100</setvar>
          </respcondition>
        </resprocessing>
      </item>
    </section>
  </objectbank>
</questestinterop>`;

  const archive = archiver('zip');
  const output = createWriteStream(destPath);
  archive.append(qtiXml, { name: 'external-bank.xml' });
  void archive.finalize();
  await pipeline(archive, output);
}

test.describe('QTI Import', () => {
  test('can navigate to the import page with feature flag enabled', async ({
    page,
    courseInstance,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('qti-content-import');

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    await expect(page).toHaveTitle(/Import QTI content/);
    await page.waitForSelector('.js-hydrated-component');

    await expect(page.getByText('Import QTI content')).toBeVisible();
    await expect(page.getByLabel('Export file')).toBeVisible();
  });

  test('shows 403 when feature flag is disabled', async ({ page, courseInstance }) => {
    const response = await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    expect(response?.status()).toBe(403);
  });

  test('import button appears on assessments page when flag is enabled', async ({
    page,
    courseInstance,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('qti-content-import');

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/assessments`,
    );
    await expect(page.getByRole('link', { name: 'Import content' })).toBeVisible();
  });

  test('import button appears on questions page when flag is enabled', async ({
    page,
    courseInstance,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('qti-content-import');

    await page.goto(`/pl/course_instance/${courseInstance.id}/instructor/course_admin/questions`);
    const link = page.getByRole('link', { name: 'Import questions' });

    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /\/instance_admin\/qti_import\?return_to=questions/);
  });

  test('can upload a QTI zip and see the review step', async ({
    page,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('qti-content-import');

    const zipPath = path.join(testCoursePath, 'qti-test-fixture.zip');
    await buildQtiZip(zipPath);

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    await page.waitForSelector('.js-hydrated-component');

    await page.getByLabel('Export file').setInputFiles(zipPath);
    await page.getByRole('button', { name: 'Import content' }).click();

    // The review step summarizes the importable assessment and its contained question.
    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });
    const importableSummary = page.locator('ul').filter({ hasText: 'assessment' });
    await expect(importableSummary.getByText('1 assessment', { exact: true })).toBeVisible();
    await expect(importableSummary.getByText('1 question', { exact: true })).toBeVisible();

    // The assessment starts included, so the importer is ready to create content.
    await expect(page.getByText('E2E Import Quiz')).toBeVisible();
    await expect(page.getByLabel('Include E2E Import Quiz')).toBeChecked();
    await expect(page.getByRole('button', { name: 'Import 1 assessment' })).toBeEnabled();
  });

  test('can upload a QTI zip without a manifest', async ({
    page,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('qti-content-import');

    const zipPath = path.join(testCoursePath, 'qti-no-manifest-fixture.zip');
    await buildQtiZip(zipPath, { includeManifest: false });

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    await page.waitForSelector('.js-hydrated-component');

    await page.getByLabel('Export file').setInputFiles(zipPath);
    await page.getByRole('button', { name: 'Import content' }).click();

    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('E2E Import Quiz')).toBeVisible();
  });

  test('reports unreferenced binary assets without importing them', async ({
    page,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('qti-content-import');

    const zipPath = path.join(testCoursePath, 'qti-unused-asset-fixture.zip');
    await buildQtiZipWithUnusedAsset(zipPath);

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    await page.waitForSelector('.js-hydrated-component');

    await page.getByLabel('Export file').setInputFiles(zipPath);
    await page.getByRole('button', { name: 'Import content' }).click();

    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('1 image and other asset')).toBeVisible();
    await expect(
      page.getByText(
        '1 asset file will not be included because it is not referenced in the questions or assessments.',
      ),
    ).toBeVisible();
    await page.getByText('Show 1 file').click();
    await expect(page.getByText('unused.png')).toBeVisible();
    await expect(page.getByText('notes.txt')).not.toBeVisible();
  });

  test('can upload a Canvas quiz export with plain imsqti resource type', async ({
    page,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('qti-content-import');

    const zipPath = path.join(testCoursePath, 'qti-plain-imsqti-fixture.zip');
    await buildQtiZip(zipPath, { resourceType: 'imsqti_xmlv1p2' });

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    await page.waitForSelector('.js-hydrated-component');

    await page.getByLabel('Export file').setInputFiles(zipPath);
    await page.getByRole('button', { name: 'Import content' }).click();

    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('E2E Import Quiz')).toBeVisible();
    await expect(page.getByText('(1 question)')).toBeVisible();
  });

  test('merges question banks included in the same course export', async ({
    page,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('qti-content-import');

    const zipPath = path.join(testCoursePath, 'qti-embedded-bank-course-fixture.imscc');
    await buildEmbeddedBankCourseZip(zipPath);

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    await page.waitForSelector('.js-hydrated-component');

    await page.getByLabel('Export file').setInputFiles(zipPath);
    await page.getByRole('button', { name: 'Import content' }).click();

    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Some questions are in Canvas question banks')).not.toBeVisible();
    await expect(page.getByText('Embedded Bank Quiz')).toBeVisible();
    await expect(page.getByText('(1 question)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import 1 assessment' })).toBeEnabled();
  });

  test('can resolve a missing question bank without a Canvas course id', async ({
    page,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('qti-content-import');

    const assessmentZipPath = path.join(testCoursePath, 'qti-missing-bank-ref.zip');
    const bankZipPath = path.join(testCoursePath, 'qti-missing-bank.zip');
    await buildExternalBankAssessmentZip(assessmentZipPath, { includeCourseId: false });
    await buildQuestionBankZip(bankZipPath);

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    await page.waitForSelector('.js-hydrated-component');

    await page.getByLabel('Export file').setInputFiles(assessmentZipPath);
    await page.getByRole('button', { name: 'Import content' }).click();

    await expect(page.getByText('Some questions are in Canvas question banks')).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByText(
        '1 of 1 question in this import will be missing without the additional exported content.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText('Canvas did not identify the source course ID for this bank.'),
    ).toBeVisible();
    await expect(page.getByText('Canvas course ID')).not.toBeVisible();

    await page.getByLabel('Supplemental export for "Bank Questions"').setInputFiles(bankZipPath);
    await page.getByRole('button', { name: 'Upload export for Bank Questions' }).click();

    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('E2E Bank Ref Quiz')).toBeVisible();
    await expect(page.getByText('(1 question)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import 1 assessment' })).toBeEnabled();
  });

  test('can resolve an external question bank before review', async ({
    page,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('qti-content-import');

    const assessmentZipPath = path.join(testCoursePath, 'qti-external-bank-ref.zip');
    const bankZipPath = path.join(testCoursePath, 'qti-external-bank.zip');
    await buildExternalBankAssessmentZip(assessmentZipPath);
    await buildQuestionBankZip(bankZipPath);

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    await page.waitForSelector('.js-hydrated-component');

    await page.getByLabel('Export file').setInputFiles(assessmentZipPath);
    await page.getByRole('button', { name: 'Import content' }).click();

    await expect(page.getByText('Some questions are in Canvas question banks')).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByText(
        '1 of 1 question in this import will be missing without the additional exported content.',
      ),
    ).toBeVisible();
    await expect(page.getByText('Canvas course ID')).toBeVisible();
    await expect(page.getByText('12345', { exact: true })).toBeVisible();

    await page
      .getByLabel('Supplemental export for "Bank Questions" from Canvas course 12345')
      .setInputFiles(bankZipPath);
    await page.getByRole('button', { name: 'Upload export for Bank Questions' }).click();

    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('E2E Bank Ref Quiz')).toBeVisible();
    await expect(page.getByText('(1 question)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import 1 assessment' })).toBeEnabled();
  });

  test('shows success after partially resolving missing question banks', async ({
    page,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('qti-content-import');

    const assessmentZipPath = path.join(testCoursePath, 'qti-multi-bank-ref.zip');
    const firstBankZipPath = path.join(testCoursePath, 'qti-first-bank.zip');
    const secondBankZipPath = path.join(testCoursePath, 'qti-second-bank.zip');
    const unmatchedBankZipPath = path.join(testCoursePath, 'qti-unmatched-bank.zip');
    await buildMultiExternalBankAssessmentZip(assessmentZipPath);
    await buildQuestionBankZip(firstBankZipPath);
    await buildQuestionBankZip(secondBankZipPath, {
      bankId: 'external_bank_2',
      questionId: 'bank_q_2',
      title: 'Second External Bank',
      questionTitle: 'Second Imported Bank Question',
    });
    await buildQuestionBankZip(unmatchedBankZipPath, {
      bankId: 'unmatched_bank',
      questionId: 'unmatched_q',
      title: 'Unmatched Bank',
      questionTitle: 'Unmatched Question',
    });

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    await page.waitForSelector('.js-hydrated-component');

    await page.getByLabel('Export file').setInputFiles(assessmentZipPath);
    await page.getByRole('button', { name: 'Import content' }).click();

    await expect(page.getByText('Some questions are in Canvas question banks')).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByText(
        '2 of 2 questions in this import will be missing without the additional exported content.',
      ),
    ).toBeVisible();
    await expect(page.getByText('12345', { exact: true })).toBeVisible();
    await expect(page.getByText('67890', { exact: true })).toBeVisible();

    const firstBankUploadButton = page.getByRole('button', {
      name: 'Upload export for Bank Questions 1',
    });
    const secondBankUploadButton = page.getByRole('button', {
      name: 'Upload export for Bank Questions 2',
    });

    await page
      .getByLabel('Supplemental export for "Bank Questions 1" from Canvas course 12345')
      .setInputFiles(unmatchedBankZipPath);
    await firstBankUploadButton.click();
    await expect(
      page.getByText('No matching question banks were found in that upload.'),
    ).toBeVisible({
      timeout: 15000,
    });
    await expect(firstBankUploadButton).toBeEnabled();
    await expect(firstBankUploadButton).toContainText('Upload export');
    await expect(firstBankUploadButton).not.toContainText('Processing...');

    // Hold the first supplemental upload open so we can verify that only its button shows
    // the processing state while other bank uploads are temporarily disabled.
    let continueBankUpload: () => void;
    const continueBankUploadPromise = new Promise<void>((resolve) => {
      continueBankUpload = resolve;
    });
    await page.route('**/qti_import/upload', async (route) => {
      await continueBankUploadPromise;
      await route.fallback();
    });

    await page
      .getByLabel('Supplemental export for "Bank Questions 1" from Canvas course 12345')
      .setInputFiles(firstBankZipPath);
    await firstBankUploadButton.click();

    await expect(page.getByText('Processing...')).toHaveCount(1);
    await expect(firstBankUploadButton).toContainText('Processing...');
    await expect(secondBankUploadButton).toBeDisabled();
    await expect(secondBankUploadButton).toContainText('Upload export');
    await expect(secondBankUploadButton).not.toContainText('Processing...');

    continueBankUpload!();
    await page.unroute('**/qti_import/upload');

    await expect(page.getByText('Matched 1 question bank from that upload.')).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByText(
        '1 of 2 questions in this import will be missing without the additional exported content.',
      ),
    ).toBeVisible();
    await expect(page.getByText('12345', { exact: true })).not.toBeVisible();
    await expect(page.getByText('67890', { exact: true })).toBeVisible();

    await page
      .getByLabel('Supplemental export for "Bank Questions 2" from Canvas course 67890')
      .setInputFiles(secondBankZipPath);
    await page.getByRole('button', { name: 'Upload export for Bank Questions 2' }).click();

    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('E2E Multi Bank Ref Quiz')).toBeVisible();
    await expect(page.getByText('(2 questions)')).toBeVisible();
  });

  test('can complete the full import flow', async ({
    page,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('qti-content-import');

    const zipPath = path.join(testCoursePath, 'qti-test-fixture.zip');
    await buildQtiZip(zipPath);

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    await page.waitForSelector('.js-hydrated-component');

    // Upload and review the export before creating the PrairieLearn assessment.
    await page.getByLabel('Export file').setInputFiles(zipPath);
    await page.getByRole('button', { name: 'Import content' }).click();
    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('E2E Import Quiz')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import 1 assessment' })).toBeEnabled();

    // Creating content should return to the assessments page with a success flash.
    await page.getByRole('button', { name: 'Import 1 assessment' }).click();
    await page.waitForURL(/\/instance_admin\/assessments/, { timeout: 30000 });

    await expect(page.getByText('1 assessment imported successfully.')).toBeVisible();
    await expect(page.getByText('E2E Import Quiz')).toBeVisible();
  });

  test('shows a clear error when review draft files have expired', async ({
    page,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('qti-content-import');

    const zipPath = path.join(testCoursePath, 'qti-expired-draft-fixture.zip');
    await buildQtiZip(zipPath);

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    await page.waitForSelector('.js-hydrated-component');

    const uploadResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/instructor/instance_admin/qti_import/upload') &&
        response.request().method() === 'POST',
    );
    await page.getByLabel('Export file').setInputFiles(zipPath);
    await page.getByRole('button', { name: 'Import content' }).click();
    const uploadResponse = await uploadResponsePromise;
    const uploadBody = (await uploadResponse.json()) as UploadResponse;

    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });

    await deleteQtiImportDraft(uploadBody.results[0].questions[0].draftId);
    await page.getByRole('button', { name: 'Import 1 assessment' }).click();

    await expect(
      page.getByText('The uploaded course content files are no longer available'),
    ).toBeVisible();
    await expect(page.getByRole('alert').getByRole('button', { name: 'Start over' })).toBeVisible();
  });

  test('can exclude an assessment from import', async ({
    page,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('qti-content-import');

    const zipPath = path.join(testCoursePath, 'qti-test-fixture.zip');
    await buildQtiZip(zipPath);

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    await page.waitForSelector('.js-hydrated-component');

    await page.getByLabel('Export file').setInputFiles(zipPath);
    await page.getByRole('button', { name: 'Import content' }).click();
    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });

    // Assessments are selected by default, so the importer is ready to create content.
    await expect(page.getByLabel('Include E2E Import Quiz')).toBeChecked();
    await expect(page.getByRole('button', { name: 'Import 1 assessment' })).toBeEnabled();

    await page.getByLabel('Include E2E Import Quiz').uncheck();

    // Excluding the only assessment leaves nothing importable.
    await expect(page.getByRole('button', { name: 'Import 0 assessments' })).toBeDisabled();
  });

  test('shows conflict UI when importing questions that already exist', async ({
    page,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('qti-content-import');

    const zipPath = path.join(testCoursePath, 'qti-conflict-fixture.zip');
    await buildQtiZip(zipPath);

    // Seed the course with the imported question.
    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    await page.waitForSelector('.js-hydrated-component');
    await page.getByLabel('Export file').setInputFiles(zipPath);
    await page.getByRole('button', { name: 'Import content' }).click();
    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Import 1 assessment' }).click();
    await page.waitForURL(/\/instance_admin\/assessments/, { timeout: 30000 });

    // Uploading the same export again should surface conflict controls.
    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    await page.waitForSelector('.js-hydrated-component');
    await page.getByLabel('Export file').setInputFiles(zipPath);
    await page.getByRole('button', { name: 'Import content' }).click();
    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });

    await expect(page.getByText(/conflicts? with existing questions/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Overwrite all' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rename all' })).toBeVisible();
  });

  test('can start over from the review step', async ({
    page,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('qti-content-import');

    const zipPath = path.join(testCoursePath, 'qti-test-fixture.zip');
    await buildQtiZip(zipPath);

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    await page.waitForSelector('.js-hydrated-component');

    await page.getByLabel('Export file').setInputFiles(zipPath);
    await page.getByRole('button', { name: 'Import content' }).click();
    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });

    // Start over should discard the review state and return to the upload form.
    await page.getByRole('button', { name: 'Start over' }).click();
    await expect(page.getByLabel('Export file')).toBeVisible();
  });
});
