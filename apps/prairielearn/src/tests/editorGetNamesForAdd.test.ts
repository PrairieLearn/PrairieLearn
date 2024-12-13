import { assert } from 'chai';
import { step } from 'mocha-steps';

import { CourseInstanceAddEditor } from '../lib/editors.js';

const editor = new CourseInstanceAddEditor({
  locals: {},
  short_name: '',
  long_name: '',
  start_access_date: '',
  end_access_date: '',
});

describe('Editor getNamesForAdd Tests', () => {
  step('No specified short_name should default to New', () => {});
  step('Unique short_name, long_name', () => {
    const names = editor.getNamesForAdd(
      ['Fa18', 'Fa19'],
      ['Fall 2018', 'Fall 2019'],
      'Fa20',
      'Fall 2020',
    );
    assert.equal(names['shortName'], 'Fa20');
    assert.equal(names['longName'], 'Fall 2020');
  });
  step('Duplicated short_name without number, unique long_name', () => {
    const names = editor.getNamesForAdd(
      ['Fa18', 'Fa19'],
      ['Fall 2018', 'Fall 2019'],
      'Fa19',
      'Fall 2019 Section 1',
    );
    assert.equal(names['shortName'], 'Fa19_2');
    assert.equal(names['longName'], 'Fall 2019 Section 1 (2)');
  });
  step('Duplicated short_name with number, unique long_name', () => {
    const names = editor.getNamesForAdd(
      ['Fa18', 'Fa19', 'Fa19_2', 'Fa19_3', 'Fa19_4'],
      [
        'Fall 2018',
        'Fall 2019',
        'Fall 2019 Section 1 (2)',
        'Fall 2019 Section 1 (3)',
        'Fall 2019 Section 1 (4)',
      ],
      'Fa19',
      'Fall 2019 Section 2',
    );
    assert.equal(names['shortName'], 'Fa19_5');
    assert.equal(names['longName'], 'Fall 2019 Section 2 (5)');
  });
  step('Unique short_name, duplicated long_name without number', () => {
    const names = editor.getNamesForAdd(
      ['Fa18', 'Fa19'],
      ['Fall 2018', 'Fall 2019'],
      'Fall19',
      'Fall 2019',
    );
    assert.equal(names['shortName'], 'Fall19_2');
    assert.equal(names['longName'], 'Fall 2019 (2)');
  });
  step('Unique short_name, duplicated long_name with number', () => {
    const names = editor.getNamesForAdd(
      ['Fa18', 'Fa19', 'Fall19_2', 'Fall19_3'],
      ['Fall 2018', 'Fall 2019', 'Fall 2019 (2)', 'Fall 2019 (3)'],
      'Fall_19',
      'Fall 2019',
    );
    assert.equal(names['shortName'], 'Fall_19_4');
    assert.equal(names['longName'], 'Fall 2019 (4)');
  });
  step('Duplicated short_name without number, duplicated long_name without number', () => {
    const names = editor.getNamesForAdd(
      ['Fa18', 'Fa19'],
      ['Fall 2018', 'Fall 2019'],
      'Fa19',
      'Fall 2019',
    );
    assert.equal(names['shortName'], 'Fa19_2');
    assert.equal(names['longName'], 'Fall 2019 (2)');
  });
  step(
    'Duplicated short_name with number, duplicated long_name with number, numbers the same',
    () => {
      const names = editor.getNamesForAdd(
        ['Fa18', 'Fa19', 'Fa19_2', 'Fa19_3'],
        ['Fall 2018', 'Fall 2019', 'Fall 2019 (2)', 'Fall 2019 (3)'],
        'Fa19',
        'Fall 2019',
      );
      assert.equal(names['shortName'], 'Fa19_4');
      assert.equal(names['longName'], 'Fall 2019 (4)');
    },
  );
  step(
    'Duplicated short_name with number, duplicated long_name with number, short_name number > long_name number',
    () => {
      const names = editor.getNamesForAdd(
        ['Fa18', 'Fa19', 'Fa19_2', 'Fa19_3'],
        ['Fall 2018', 'Fall 2019', 'Fall 2019 (2)'],
        'Fa19',
        'Fall 2019',
      );
      assert.equal(names['shortName'], 'Fa19_4');
      assert.equal(names['longName'], 'Fall 2019 (4)');
    },
  );
  step(
    'Duplicated short_name with number, duplicated long_name with number, short_name number < long_name number',
    () => {
      const names = editor.getNamesForAdd(
        ['Fa18', 'Fa19', 'Fa19_2'],
        ['Fall 2018', 'Fall 2019', 'Fall 2019 (2)', 'Fall 2019 (3)'],
        'Fa19',
        'Fall 2019',
      );
      assert.equal(names['shortName'], 'Fa19_4');
      assert.equal(names['longName'], 'Fall 2019 (4)');
    },
  );
});
