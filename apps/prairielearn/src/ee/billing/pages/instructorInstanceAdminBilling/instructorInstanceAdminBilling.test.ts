import { assert } from 'chai';
import cheerio = require('cheerio');
import fetch from 'node-fetch';

import { enableEnterpriseEdition, withoutEnterpriseEdition } from '../../../tests/ee-helpers';
import helperServer = require('../../../../tests/helperServer');
import { updateRequiredPlansForCourseInstance } from '../../plans';
import { config } from '../../../../lib/config';
import { features } from '../../../../lib/features';

const siteUrl = 'http://localhost:' + config.serverPort;

describe('instructorInstanceAdminBilling', () => {
  enableEnterpriseEdition();

  beforeEach(helperServer.before());
  afterEach(helperServer.after);

  it('404s if feature is not enabled', async () => {
    await features.runWithGlobalOverrides({ 'course-instance-billing': false }, async () => {
      const url = '/pl/course_instance/1/instructor/instance_admin/billing';
      const res = await fetch(siteUrl + url);
      assert.isFalse(res.ok);
      assert.equal(res.status, 404);
    });
  });

  it('404s if not enterprise edition', async () => {
    await withoutEnterpriseEdition(async () => {
      await features.runWithGlobalOverrides({ 'course-instance-billing': true }, async () => {
        const url = '/pl/course_instance/1/instructor/instance_admin/billing';
        const res = await fetch(siteUrl + url);
        assert.isFalse(res.ok);
        assert.equal(res.status, 404);
      });
    });
  });

  it('shows current state', async () => {
    await features.runWithGlobalOverrides({ 'course-instance-billing': true }, async () => {
      await updateRequiredPlansForCourseInstance('1', ['basic', 'compute']);
      const url = '/pl/course_instance/1/instructor/instance_admin/billing';
      const res = await fetch(siteUrl + url);
      assert.isTrue(res.ok);
      const $ = cheerio.load(await res.text());
      assert.equal($('#studentBillingEnabled').attr('checked'), 'checked');
      assert.equal($('#computeEnabled').attr('checked'), 'checked');
    });
  });
});
