import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import archiver from 'archiver';

import { expect, test } from './fixtures.js';

/**
 * Build a minimal QTI 1.2 quiz export zip on disk.
 * Contains one multiple-choice question with two options.
 */
async function buildQtiZip(destPath: string): Promise<void> {
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
    <resource identifier="test_assess_1" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment">
      <file href="test_assess_1/test_assess_1.xml"/>
    </resource>
  </resources>
</manifest>`;

  const archive = archiver('zip');
  const output = createWriteStream(destPath);
  archive.append(manifest, { name: 'imsmanifest.xml' });
  archive.append(qtiXml, { name: 'test_assess_1/test_assess_1.xml' });
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

    // Wait for the review step to appear
    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });

    // Verify the import summary lists the expected counts
    const importableSummary = page.locator('ul').filter({ hasText: 'assessment' });
    await expect(importableSummary.getByText('1 assessment', { exact: true })).toBeVisible();
    await expect(importableSummary.getByText('1 question', { exact: true })).toBeVisible();

    // Verify the assessment details are shown in the review list
    await expect(page.getByText('E2E Import Quiz')).toBeVisible();
    await expect(page.getByLabel('Include E2E Import Quiz')).toBeChecked();

    // Verify the create button reflects the included count
    await expect(page.getByRole('button', { name: 'Import 1 assessment' })).toBeEnabled();
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

    // Upload
    await page.getByLabel('Export file').setInputFiles(zipPath);
    await page.getByRole('button', { name: 'Import content' }).click();
    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });

    // Review step — verify assessment is listed and included
    await expect(page.getByText('E2E Import Quiz')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import 1 assessment' })).toBeEnabled();

    // Create — should redirect to assessments page with a success flash
    await page.getByRole('button', { name: 'Import 1 assessment' }).click();
    await page.waitForURL(/\/instance_admin\/assessments/, { timeout: 30000 });

    await expect(page.getByText('1 assessment imported successfully.')).toBeVisible();
    await expect(page.getByText('E2E Import Quiz')).toBeVisible();
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

    // Verify the assessment starts checked with the create button enabled
    await expect(page.getByLabel('Include E2E Import Quiz')).toBeChecked();
    await expect(page.getByRole('button', { name: 'Import 1 assessment' })).toBeEnabled();

    // Uncheck the assessment
    await page.getByLabel('Include E2E Import Quiz').uncheck();

    // Create button should reflect 0 assessments and be disabled
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

    // First import: create the questions
    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    await page.waitForSelector('.js-hydrated-component');
    await page.getByLabel('Export file').setInputFiles(zipPath);
    await page.getByRole('button', { name: 'Import content' }).click();
    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Import 1 assessment' }).click();
    await page.waitForURL(/\/instance_admin\/assessments/, { timeout: 30000 });

    // Second import: same zip again — should trigger conflict
    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/qti_import`,
    );
    await page.waitForSelector('.js-hydrated-component');
    await page.getByLabel('Export file').setInputFiles(zipPath);
    await page.getByRole('button', { name: 'Import content' }).click();
    await expect(page.getByText('What can be imported')).toBeVisible({ timeout: 15000 });

    // The conflict bar appears inside the assessment card body.
    // It says "N question(s) conflict(s) with existing questions".
    await expect(page.getByText(/conflicts? with existing questions/)).toBeVisible();

    // The "Overwrite all" / "Rename all" bulk buttons are visible
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

    // Click start over
    await page.getByRole('button', { name: 'Start over' }).click();

    // Should be back on the upload step
    await expect(page.getByLabel('Export file')).toBeVisible();
  });
});
