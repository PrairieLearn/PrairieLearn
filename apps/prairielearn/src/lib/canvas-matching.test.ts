import { assert, describe, it } from 'vitest';

import {
  type CanvasStudent,
  type StrategyResult,
  type Student,
  buildCanvasLookup,
  parseCanvasCsv,
  runAllStrategies,
} from './canvas-matching.js';

const SAMPLE_CANVAS_CSV = `Student,ID,SIS User ID,SIS Login ID,Section,Quiz 1 (23)
    Points Possible,,,,,10.00
"Block, Jasen",11,,jblock3430,XC 101,8.00
"Buckridge, Billy",2,,billy7670,XC 101,9.00
"Gislason, Hope",7,,gislason_hope5249,XC 101,7.00
`;

function findStrategy(results: StrategyResult[], name: string) {
  return results.find((r) => r.strategy.name === name)!;
}

describe('parseCanvasCsv', () => {
  it('parses a valid Canvas CSV', () => {
    const { students, error } = parseCanvasCsv(SAMPLE_CANVAS_CSV);
    assert.isNull(error);
    assert.lengthOf(students, 3);
    assert.equal(students[0].name, 'Block, Jasen');
    assert.equal(students[0].sisLoginId, 'jblock3430');
    assert.equal(students[0].section, 'XC 101');
    assert.equal(students[0].id, '11');
  });

  it('skips the Points Possible row', () => {
    const { students } = parseCanvasCsv(SAMPLE_CANVAS_CSV);
    assert.isTrue(students.every((s) => s.name !== 'Points Possible'));
  });

  it('returns an error for missing headers', () => {
    const csv = 'Name,Email\nJohn,john@test.com\n';
    const { students, error } = parseCanvasCsv(csv);
    assert.isNotNull(error);
    assert.include(error, 'Missing required Canvas columns');
    assert.lengthOf(students, 0);
  });

  it('returns an error for empty CSV', () => {
    const { error } = parseCanvasCsv('');
    assert.isNotNull(error);
  });

  it('handles quoted fields with commas', () => {
    const csv = `Student,ID,SIS User ID,SIS Login ID,Section
    Points Possible,,,,
"Smith, John ""Johnny""",5,,jsmith,XC 101
`;
    const { students, error } = parseCanvasCsv(csv);
    assert.isNull(error);
    assert.lengthOf(students, 1);
    assert.equal(students[0].name, 'Smith, John "Johnny"');
  });
});

describe('runAllStrategies', () => {
  const canvasStudents: CanvasStudent[] = [
    { name: 'Block, Jasen', id: '11', sisUserId: '', sisLoginId: 'jblock3430', section: 'XC 101' },
    {
      name: 'Buckridge, Billy',
      id: '2',
      sisUserId: '',
      sisLoginId: 'billy7670',
      section: 'XC 101',
    },
    {
      name: 'Gislason, Hope',
      id: '7',
      sisUserId: '',
      sisLoginId: 'gislason_hope5249',
      section: 'XC 101',
    },
  ];

  it('matches by UID against SIS Login ID', () => {
    const plStudents: Student[] = [
      { uid: 'jblock3430', userName: 'Jasen Block', uin: null },
      { uid: 'billy7670', userName: 'Billy Buckridge', uin: null },
    ];

    const results = runAllStrategies(plStudents, canvasStudents);
    const result = findStrategy(results, 'uid-sislogin');
    assert.equal(result.result.matched.length, 2);
    assert.equal(result.result.unmatchedPl.length, 0);
    assert.equal(result.result.unmatchedCanvas.length, 1);
  });

  it('matches by UID against SIS User ID', () => {
    const canvasWithSisUser: CanvasStudent[] = [
      {
        name: 'Block, Jasen',
        id: '11',
        sisUserId: 'jblock3430',
        sisLoginId: '',
        section: 'XC 101',
      },
    ];

    const plStudents: Student[] = [{ uid: 'jblock3430', userName: 'Jasen Block', uin: null }];

    const results = runAllStrategies(plStudents, canvasWithSisUser);
    const result = findStrategy(results, 'uid-sisuser');
    assert.equal(result.result.matched.length, 1);
    assert.equal(result.result.unmatchedPl.length, 0);
  });

  it('matches by name across formats', () => {
    const plStudents: Student[] = [
      { uid: 'user1@test.edu', userName: 'Jasen Block', uin: null },
      { uid: 'user2@test.edu', userName: 'Billy Buckridge', uin: null },
    ];

    const results = runAllStrategies(plStudents, canvasStudents);
    const nameResult = findStrategy(results, 'name');
    assert.equal(nameResult.result.matched.length, 2);
  });

  it('returns all strategy names', () => {
    const plStudents: Student[] = [{ uid: 'jblock3430', userName: 'Someone', uin: null }];

    const results = runAllStrategies(plStudents, canvasStudents);
    const names = results.map((r) => r.strategy.name);
    assert.includeMembers(names, [
      'uid-sislogin',
      'uid-sisuser',
      'uin-sisuser',
      'uin-sislogin',
      'name',
      'email-sislogin',
      'email-sisuser',
    ]);
  });

  it('matches by UIN against Canvas SIS User ID', () => {
    const canvasWithSis: CanvasStudent[] = [
      {
        name: 'Block, Jasen',
        id: '11',
        sisUserId: '658001234',
        sisLoginId: 'jblock3430',
        section: 'XC 101',
      },
      {
        name: 'Buckridge, Billy',
        id: '2',
        sisUserId: '658005678',
        sisLoginId: 'billy7670',
        section: 'XC 101',
      },
    ];

    const plStudents: Student[] = [
      { uid: 'jasen@school.edu', userName: 'Jasen Block', uin: '0658001234' },
      { uid: 'billy@school.edu', userName: 'Billy Buckridge', uin: '658005678' },
    ];

    const results = runAllStrategies(plStudents, canvasWithSis);
    const uinResult = findStrategy(results, 'uin-sisuser');
    assert.equal(uinResult.result.matched.length, 2);
    assert.equal(uinResult.result.unmatchedPl.length, 0);
  });

  it('matches by UIN against Canvas SIS Login ID', () => {
    const canvasWithSisLogin: CanvasStudent[] = [
      {
        name: 'Block, Jasen',
        id: '11',
        sisUserId: '',
        sisLoginId: '658001234',
        section: 'XC 101',
      },
      {
        name: 'Buckridge, Billy',
        id: '2',
        sisUserId: '',
        sisLoginId: '658005678',
        section: 'XC 101',
      },
    ];

    const plStudents: Student[] = [
      { uid: 'jasen@school.edu', userName: 'Jasen Block', uin: '658001234' },
      { uid: 'billy@school.edu', userName: 'Billy Buckridge', uin: '0658005678' },
    ];

    const results = runAllStrategies(plStudents, canvasWithSisLogin);
    const uinResult = findStrategy(results, 'uin-sislogin');
    assert.equal(uinResult.result.matched.length, 2);
    assert.equal(uinResult.result.unmatchedPl.length, 0);
  });

  it('identifies ambiguous PL students with duplicate keys', () => {
    const plStudents: Student[] = [
      { uid: 'jblock3430', userName: 'Jasen Block', uin: null },
      { uid: 'jblock3430', userName: 'Jasen Block Clone', uin: null },
    ];

    const results = runAllStrategies(plStudents, canvasStudents);
    const result = findStrategy(results, 'uid-sislogin');
    assert.equal(result.result.matched.length, 0);
    assert.equal(result.result.ambiguousPl.length, 2);
  });

  it('identifies ambiguous Canvas students with duplicate keys', () => {
    const canvasDuplicate: CanvasStudent[] = [
      {
        name: 'Block, Jasen',
        id: '11',
        sisUserId: '',
        sisLoginId: 'jblock3430',
        section: 'XC 101',
      },
      {
        name: 'Block, Jason',
        id: '12',
        sisUserId: '',
        sisLoginId: 'jblock3430',
        section: 'XC 101',
      },
    ];

    const plStudents: Student[] = [{ uid: 'jblock3430', userName: 'Jasen Block', uin: null }];

    const results = runAllStrategies(plStudents, canvasDuplicate);
    const result = findStrategy(results, 'uid-sislogin');
    assert.equal(result.result.matched.length, 0);
    assert.equal(result.result.ambiguousCanvas.length, 2);
    assert.equal(result.result.unmatchedPl.length, 1);
  });

  it('identifies unmatched PL students', () => {
    const plStudents: Student[] = [
      { uid: 'nonexistent_user', userName: 'Nonexistent User', uin: null },
    ];

    const results = runAllStrategies(plStudents, canvasStudents);
    const result = findStrategy(results, 'uid-sislogin');
    assert.equal(result.result.unmatchedPl.length, 1);
    assert.equal(result.result.matched.length, 0);
  });

  it('handles empty inputs', () => {
    const results = runAllStrategies([], []);
    assert.lengthOf(results, 7);
    for (const r of results) {
      assert.equal(r.result.matched.length, 0);
      assert.equal(r.result.ambiguousPl.length, 0);
      assert.equal(r.result.ambiguousCanvas.length, 0);
    }
  });

  it('matches by email prefix against SIS Login ID', () => {
    const plStudents: Student[] = [
      { uid: 'jblock3430@school.edu', userName: 'Jasen Block', uin: null },
      { uid: 'billy7670@school.edu', userName: 'Billy Buckridge', uin: null },
    ];

    const results = runAllStrategies(plStudents, canvasStudents);
    const result = findStrategy(results, 'email-sislogin');
    assert.equal(result.result.matched.length, 2);
    assert.equal(result.result.unmatchedPl.length, 0);
  });

  it('matches by email prefix against SIS User ID', () => {
    const canvasWithSisUser: CanvasStudent[] = [
      {
        name: 'Block, Jasen',
        id: '11',
        sisUserId: 'jblock3430',
        sisLoginId: '',
        section: 'XC 101',
      },
    ];

    const plStudents: Student[] = [
      { uid: 'jblock3430@school.edu', userName: 'Jasen Block', uin: null },
    ];

    const results = runAllStrategies(plStudents, canvasWithSisUser);
    const result = findStrategy(results, 'email-sisuser');
    assert.equal(result.result.matched.length, 1);
    assert.equal(result.result.unmatchedPl.length, 0);
  });

  it('skips email-prefix strategies for UIDs without @', () => {
    const plStudents: Student[] = [{ uid: 'jblock3430', userName: 'Jasen Block', uin: null }];

    const results = runAllStrategies(plStudents, canvasStudents);
    const result = findStrategy(results, 'email-sislogin');
    assert.equal(result.result.matched.length, 0);
    assert.equal(result.result.unmatchedPl.length, 1);
  });

  it('treats students with empty keys as unmatched', () => {
    const plStudents: Student[] = [{ uid: 'someone@test.edu', userName: null, uin: null }];

    const results = runAllStrategies(plStudents, canvasStudents);
    const nameResult = findStrategy(results, 'name');
    assert.equal(nameResult.result.unmatchedPl.length, 1);
    assert.equal(nameResult.result.matched.length, 0);
  });
});

describe('buildCanvasLookup', () => {
  it('builds a lookup from matched results', () => {
    const canvas: CanvasStudent = {
      name: 'Block, Jasen',
      id: '11',
      sisUserId: '',
      sisLoginId: 'jblock3430',
      section: 'XC 101',
    };
    const lookup = buildCanvasLookup({
      matched: [
        {
          plStudent: { uid: 'jblock3430', userName: 'Jasen Block', uin: null },
          canvasStudent: canvas,
        },
      ],
      ambiguousPl: [],
      ambiguousCanvas: [],
      unmatchedPl: [],
      unmatchedCanvas: [],
    });

    assert.equal(lookup.size, 1);
    assert.equal(lookup.get('jblock3430')?.name, 'Block, Jasen');
  });

  it('returns empty lookup when no matches', () => {
    const lookup = buildCanvasLookup({
      matched: [],
      ambiguousPl: [{ uid: 'someone', userName: 'Someone', uin: null }],
      ambiguousCanvas: [],
      unmatchedPl: [],
      unmatchedCanvas: [],
    });

    assert.equal(lookup.size, 0);
  });
});
