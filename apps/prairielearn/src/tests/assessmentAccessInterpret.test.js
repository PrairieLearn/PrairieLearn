// @ts-check
const { assert } = require('chai');
const cheerio = require('cheerio');
const fetch = require('node-fetch').default;

const { config } = require('../lib/config');
const helperServer = require('./helperServer');

const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

let accessPageUrl;
let $accessPage;

const definedRules = [
  {
    uids: 'student1@illinois.edu, student2@illinois.edu',
    startDate: '2023-04-15 12:00:01 (CDT)',
    endDate: '2023-08-05 11:59:59 (CDT)',
    credit: 110,
  },
  {
    uids: 'No UIDs',
    startDate: '2023-05-15 12:00:01 (CDT)',
    endDate: '2023-07-05 11:59:59 (CDT)',
    credit: 120,
    no_effect: true,
  },
  {
    startDate: '2023-04-10 12:00:01 (CDT)',
    endDate: '2023-08-10 11:59:59 (CDT)',
    credit: 100,
  },
  {
    startDate: '2023-06-10 12:00:01 (CDT)',
    endDate: '2023-10-10 11:59:59 (CDT)',
    credit: 90,
    password: 'part2',
  },
  {
    startDate: '2023-03-10 12:00:01 (CST)',
    endDate: '2023-07-10 11:59:59 (CDT)',
    credit: 80,
    timeLimit: 120,
    password: 'part3',
  },
  {
    startDate: '2023-05-10 12:00:01 (CDT)',
    endDate: '2023-09-10 11:59:59 (CDT)',
    credit: 70,
    password: 'part4',
    no_effect: true,
  },
  {
    startDate: '2023-02-10 12:00:01 (CST)',
    endDate: '2023-11-10 11:59:59 (CST)',
    credit: 60,
    password: 'part5',
  },
  {
    endDate: '2023-12-10 09:59:59 (CST)',
    credit: 55,
    password: 'part6',
  },
  {
    endDate: '2023-12-10 11:59:59 (CST)',
    credit: 50,
    password: 'part7',
  },
  {
    uids: 'student2@illinois.edu',
    startDate: '2023-07-15 12:00:01 (CDT)',
    endDate: '2023-11-05 11:59:59 (CST)',
    credit: 40,
    no_effect: true,
  },
  {
    startDate: '2023-01-10 12:00:01 (CST)',
    active: false,
  },
];

const interpretedRulesSpecific = [
  {
    dates: 'Until 2023-02-10 12:00:00',
    credit: 55,
    password: 'part6',
    after: 'Cannot see score or answers',
  },
  {
    dates: 'From 2023-02-10 12:00:01 to 2023-03-10 12:00:00',
    credit: 60,
    password: 'part5',
    after: 'Can see score, but not answers',
  },
  {
    dates: 'From 2023-03-10 12:00:01 to 2023-04-10 12:00:00',
    credit: 80,
    password: 'part3',
  },
  {
    dates: 'From 2023-04-10 12:00:01 to 2023-04-15 12:00:00',
    credit: 100,
  },
  {
    dates: 'From 2023-04-15 12:00:01 to 2023-08-05 11:59:59',
    credit: 110,
  },
  {
    dates: 'From 2023-08-05 12:00:00 to 2023-08-10 11:59:59',
    credit: 100,
  },
  {
    dates: 'From 2023-08-10 12:00:00 to 2023-10-10 11:59:59',
    credit: 90,
    password: 'part2',
  },
  {
    dates: 'From 2023-10-10 12:00:00 to 2023-11-10 11:59:59',
    credit: 60,
    password: 'part5',
    after: 'Can see score, but not answers',
  },
  {
    dates: 'From 2023-11-10 12:00:00 to 2023-12-10 09:59:59',
    credit: 55,
    password: 'part6',
    after: 'Cannot see score or answers',
  },
  {
    dates: 'On 2023-12-10, from 10:00:00 to 11:59:59',
    credit: 50,
    password: 'part7',
    after: 'Cannot see score or answers',
  },
  {
    dates: 'From 2023-12-10 12:00:00',
    active: false,
  },
];

const interpretedRulesGeneral = [
  {
    dates: 'Until 2023-02-10 12:00:00',
    credit: 55,
    password: 'part6',
    after: 'Cannot see score or answers',
  },
  {
    dates: 'From 2023-02-10 12:00:01 to 2023-03-10 12:00:00',
    credit: 60,
    password: 'part5',
    after: 'Can see score, but not answers',
  },
  {
    dates: 'From 2023-03-10 12:00:01 to 2023-04-10 12:00:00',
    credit: 80,
    password: 'part3',
  },
  {
    dates: 'From 2023-04-10 12:00:01 to 2023-08-10 11:59:59',
    credit: 100,
  },
  {
    dates: 'From 2023-08-10 12:00:00 to 2023-10-10 11:59:59',
    credit: 90,
    password: 'part2',
  },
  {
    dates: 'From 2023-10-10 12:00:00 to 2023-11-10 11:59:59',
    credit: 60,
    password: 'part5',
    after: 'Can see score, but not answers',
  },
  {
    dates: 'From 2023-11-10 12:00:00 to 2023-12-10 09:59:59',
    credit: 55,
    password: 'part6',
    after: 'Cannot see score or answers',
  },
  {
    dates: 'On 2023-12-10, from 10:00:00 to 11:59:59',
    credit: 50,
    password: 'part7',
    after: 'Cannot see score or answers',
  },
  {
    dates: 'From 2023-12-10 12:00:00',
    active: false,
  },
];

const testActiveBadge = async (date, generalIndex, exceptionIndex) => {
  const response = await fetch(accessPageUrl, {
    headers: { cookie: `pl_requested_date=${date}` },
  });
  assert.equal(response.status, 200);
  $accessPage = cheerio.load(await response.text());

  const generalAccessBadge = $accessPage(
    '[data-testid="table-interpreted-general"] [data-testid="active-rule-badge"]',
  );
  assert.equal(generalAccessBadge.length, 1);
  const generalRow = generalAccessBadge.parents('tr').eq(0);
  assert.equal(generalRow.parent().find('tr:has(td)').index(generalRow), generalIndex);

  const exceptionAccessBadge = $accessPage(
    '[data-testid="table-interpreted-exception"] [data-testid="active-rule-badge"]',
  );
  assert.equal(exceptionAccessBadge.length, 1);
  const exceptionRow = exceptionAccessBadge.parents('tr').eq(0);
  assert.equal(exceptionRow.parent().find('tr:has(td)').index(exceptionRow), exceptionIndex);
};

describe('Access page', function () {
  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  before('create exception student', async () => {
    const assessment_info = (await sqldb.queryOneRowAsync(sql.select_assessment, {})).rows[0];
    accessPageUrl = `${baseUrl}/course_instance/${assessment_info.course_instance_id}/instructor/assessment/${assessment_info.id}/access`;
    const result = await sqldb.callAsync('users_select_or_insert', [
      'student2@illinois.edu',
      'Exception Student',
      '0000001234',
      'Shibboleth',
    ]);
    await sqldb.queryOneRowAsync(sql.insert_enrollment, {
      user_id: result.rows[0].user_id,
      course_instance_id: assessment_info.course_instance_id,
    });
  });

  before('load access page', async () => {
    const response = await fetch(accessPageUrl);
    assert.equal(response.status, 200);
    $accessPage = cheerio.load(await response.text());
  });

  it('check defined access rules', async () => {
    const table = $accessPage('[data-testid="table-defined-access-rules"]');
    assert.equal(table.length, 1);
    const rows = table.find('tbody tr');
    assert.equal(rows.length, definedRules.length);
    let headers = {};
    table.find('thead th').each((index, element) => {
      headers[$accessPage(element).text() || '0'] = index;
    });
    definedRules.forEach((rule, index) => {
      const row = rows.eq(index);
      const cells = row.find('td');
      assert.equal(cells.eq(headers['UIDs']).text().trim(), rule.uids ?? '—');
      assert.equal(cells.eq(headers['Start date']).text().trim(), rule.startDate || '—');
      assert.equal(cells.eq(headers['End date']).text().trim(), rule.endDate || '—');
      assert.equal(
        cells.eq(headers['Active']).text().trim(),
        rule.active ?? true ? 'Active' : 'Not Active',
      );
      assert.equal(cells.eq(headers['Password']).text().trim(), rule.password || '—');
      assert.equal(
        cells.eq(headers['Credit']).text().trim(),
        rule.credit ? `${rule.credit}%` : '—',
      );
      assert.equal(
        cells.eq(headers['Time limit']).text().trim(),
        rule.timeLimit ? `${rule.timeLimit} min` : '—',
      );
      assert.equal(!!cells.eq(0).text().includes('Not used'), !!rule.no_effect);
    });
  });

  it('check interpreted access rules: general', async () => {
    const table = $accessPage('[data-testid="table-interpreted-general"]');
    assert.equal(table.length, 1);
    const rows = table.find('tbody tr');
    assert.equal(rows.length, interpretedRulesGeneral.length);
    let headers = {};
    table
      .find('thead tr')
      .eq(1)
      .find('th')
      .each((index, element) => {
        headers[$accessPage(element).text() || index] = index;
      });
    interpretedRulesGeneral.forEach((rule, index) => {
      const row = rows.eq(index);
      const cells = row.find('td');
      assert.equal(cells.eq(headers['When']).text().trim(), rule.dates);
      assert.equal(
        cells.eq(3).text().trim(),
        rule.active ?? true ? 'Can start the assessment' : 'Cannot start assessment',
      );
      if (rule.active ?? true) {
        assert.equal(cells.eq(headers['Password']).text().trim(), rule.password || '—');
        assert.equal(
          cells.eq(headers['Credit']).text().trim(),
          rule.credit ? `${rule.credit}%` : '—',
        );
      }
      assert.equal(cells.eq(-1).text().trim(), rule.after ?? 'Can see score and answers');
    });
  });

  it('check interpreted access rules: exception', async () => {
    const table = $accessPage('[data-testid="table-interpreted-exception"]');
    assert.equal(table.length, 1);
    const uidRow = table.find('tbody tr th');
    assert.equal(uidRow.length, 1);
    assert.equal(uidRow.text().trim(), 'student1@illinois.edu, Exception Student');
    const rows = table.find('tbody tr:has(td)');
    assert.equal(rows.length, interpretedRulesSpecific.length);
    let headers = {};
    table
      .find('thead tr')
      .eq(1)
      .find('th')
      .each((index, element) => {
        headers[$accessPage(element).text() || index] = index;
      });
    interpretedRulesSpecific.forEach((rule, index) => {
      const row = rows.eq(index);
      const cells = row.find('td');
      assert.equal(cells.eq(headers['When']).text().trim(), rule.dates);
      assert.equal(
        cells.eq(3).text().trim(),
        rule.active ?? true ? 'Can start the assessment' : 'Cannot start assessment',
      );
      if (rule.active ?? true) {
        assert.equal(cells.eq(headers['Password']).text().trim(), rule.password || '—');
        assert.equal(
          cells.eq(headers['Credit']).text().trim(),
          rule.credit ? `${rule.credit}%` : '—',
        );
      }
      assert.equal(cells.eq(-1).text().trim(), rule.after ?? 'Can see score and answers');
    });
  });

  it('shows the appropriate access rule as active', async () => {
    await testActiveBadge('2023-01-16T13:12:00-06:00', 0, 0);
    await testActiveBadge('2023-02-16T13:12:00-06:00', 1, 1);
    await testActiveBadge('2023-04-16T13:12:00-05:00', 3, 4);
    await testActiveBadge('2023-08-06T13:12:00-05:00', 3, 5);
    await testActiveBadge('2023-11-16T13:12:00-06:00', 6, 8);
    await testActiveBadge('2023-12-10T11:12:00-06:00', 7, 9);
    await testActiveBadge('2024-01-16T13:12:00-06:00', 8, 10);
  });
});
