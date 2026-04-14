import { assert, describe, it } from 'vitest';

import {
  type CanvasStudent,
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

  it('matches by UID when SIS Login ID equals PL uid', () => {
    const plStudents: Student[] = [
      { uid: 'jblock3430', userName: 'Jasen Block', uin: null },
      { uid: 'billy7670', userName: 'Billy Buckridge', uin: null },
    ];

    const results = runAllStrategies(plStudents, canvasStudents);
    const uidResult = results.find((r) => r.strategy === 'uid')!;
    assert.equal(uidResult.result.matched.length, 2);
    assert.equal(uidResult.result.unmatchedPl.length, 0);
    assert.equal(uidResult.result.unmatchedCanvas.length, 1);
  });

  it('matches by name across formats', () => {
    const plStudents: Student[] = [
      { uid: 'user1@test.edu', userName: 'Jasen Block', uin: null },
      { uid: 'user2@test.edu', userName: 'Billy Buckridge', uin: null },
    ];

    const results = runAllStrategies(plStudents, canvasStudents);
    const nameResult = results.find((r) => r.strategy === 'name')!;
    assert.equal(nameResult.result.matched.length, 2);
  });

  it('preserves strategy display order (uid, uin, name)', () => {
    const plStudents: Student[] = [
      { uid: 'jblock3430', userName: 'Someone Else', uin: null },
      { uid: 'billy7670', userName: 'Another Person', uin: null },
    ];

    const results = runAllStrategies(plStudents, canvasStudents);
    assert.deepEqual(
      results.map((r) => r.strategy),
      ['uid', 'uin', 'name'],
    );
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
    const uinResult = results.find((r) => r.strategy === 'uin')!;
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
    const uinResult = results.find((r) => r.strategy === 'uin')!;
    assert.equal(uinResult.result.matched.length, 2);
    assert.equal(uinResult.result.unmatchedPl.length, 0);
  });

  it('matches by UID against Canvas SIS User ID', () => {
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
    const uidResult = results.find((r) => r.strategy === 'uid')!;
    assert.equal(uidResult.result.matched.length, 1);
    assert.equal(uidResult.result.unmatchedPl.length, 0);
  });

  it('does not create duplicate matches when both SIS fields have the same value', () => {
    const canvasDuplicate: CanvasStudent[] = [
      {
        name: 'Block, Jasen',
        id: '11',
        sisUserId: 'jblock3430',
        sisLoginId: 'jblock3430',
        section: 'XC 101',
      },
    ];

    const plStudents: Student[] = [{ uid: 'jblock3430', userName: 'Jasen Block', uin: null }];

    const results = runAllStrategies(plStudents, canvasDuplicate);
    const uidResult = results.find((r) => r.strategy === 'uid')!;
    assert.equal(uidResult.result.matched.length, 1);
    assert.equal(uidResult.result.ambiguous.length, 0);
  });

  it('matches by UIN strategy using UID when UIN is missing', () => {
    const canvasWithSis: CanvasStudent[] = [
      {
        name: 'Block, Jasen',
        id: '11',
        sisUserId: 'jblock3430',
        sisLoginId: '',
        section: 'XC 101',
      },
      {
        name: 'Buckridge, Billy',
        id: '2',
        sisUserId: '',
        sisLoginId: 'billy7670',
        section: 'XC 101',
      },
    ];

    const plStudents: Student[] = [
      { uid: 'jblock3430', userName: 'Jasen Block', uin: null },
      { uid: 'billy7670', userName: 'Billy Buckridge', uin: null },
    ];

    const results = runAllStrategies(plStudents, canvasWithSis);
    const uinResult = results.find((r) => r.strategy === 'uin')!;
    assert.equal(uinResult.result.matched.length, 2);
    assert.equal(uinResult.result.unmatchedPl.length, 0);
  });

  it('does not create duplicate matches in UIN strategy when both UID and UIN match the same Canvas student', () => {
    const canvasWithSis: CanvasStudent[] = [
      {
        name: 'Block, Jasen',
        id: '11',
        sisUserId: '658001234',
        sisLoginId: 'jasen@school.edu',
        section: 'XC 101',
      },
    ];

    const plStudents: Student[] = [
      { uid: 'jasen@school.edu', userName: 'Jasen Block', uin: '658001234' },
    ];

    const results = runAllStrategies(plStudents, canvasWithSis);
    const uinResult = results.find((r) => r.strategy === 'uin')!;
    assert.equal(uinResult.result.matched.length, 1);
    assert.equal(uinResult.result.ambiguous.length, 0);
  });

  it('identifies unmatched PL students', () => {
    const plStudents: Student[] = [
      { uid: 'nonexistent_user', userName: 'Nonexistent User', uin: null },
    ];

    const results = runAllStrategies(plStudents, canvasStudents);
    const uidResult = results.find((r) => r.strategy === 'uid')!;
    assert.equal(uidResult.result.unmatchedPl.length, 1);
    assert.equal(uidResult.result.matched.length, 0);
  });

  it('handles empty inputs', () => {
    const results = runAllStrategies([], []);
    assert.lengthOf(results, 3);
    for (const r of results) {
      assert.equal(r.result.matched.length, 0);
      assert.equal(r.result.ambiguous.length, 0);
    }
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
      ambiguous: [],
      unmatchedPl: [],
      unmatchedCanvas: [],
    });

    assert.equal(lookup.size, 1);
    assert.equal(lookup.get('jblock3430')?.name, 'Block, Jasen');
  });

  it('includes resolved ambiguous matches', () => {
    const canvas1: CanvasStudent = {
      name: 'Block, Jasen',
      id: '11',
      sisUserId: '',
      sisLoginId: 'jblock3430',
      section: 'XC 101',
    };
    const canvas2: CanvasStudent = {
      name: 'Block, Jason',
      id: '12',
      sisUserId: '',
      sisLoginId: 'jblock3431',
      section: 'XC 101',
    };

    const lookup = buildCanvasLookup({
      matched: [],
      ambiguous: [
        {
          plStudent: { uid: 'jblock@test.edu', userName: 'Jasen Block', uin: null },
          candidates: [canvas1, canvas2],
          selectedCanvasIndex: 0,
        },
      ],
      unmatchedPl: [],
      unmatchedCanvas: [],
    });

    assert.equal(lookup.size, 1);
    assert.equal(lookup.get('jblock@test.edu')?.sisLoginId, 'jblock3430');
  });

  it('skips unresolved ambiguous matches', () => {
    const canvas1: CanvasStudent = {
      name: 'Block, Jasen',
      id: '11',
      sisUserId: '',
      sisLoginId: 'jblock3430',
      section: 'XC 101',
    };

    const lookup = buildCanvasLookup({
      matched: [],
      ambiguous: [
        {
          plStudent: { uid: 'jblock@test.edu', userName: 'Jasen Block', uin: null },
          candidates: [canvas1],
          selectedCanvasIndex: null,
        },
      ],
      unmatchedPl: [],
      unmatchedCanvas: [],
    });

    assert.equal(lookup.size, 0);
  });
});
