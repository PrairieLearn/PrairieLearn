import { assert } from 'chai';

import { getNamesForAdd } from './editors.js';

describe('editors', () => {
  describe('getNamesForAdd', () => {
    describe('No specified short_name and long_name', () => {
      it('should set short_name to New_1 and long_name to New (1)', () => {
        const names = getNamesForAdd(['Fa18', 'Fa19'], ['Fall 2018', 'Fall 2019']);
        assert.equal(names['shortName'], 'New_1');
        assert.equal(names['longName'], 'New (1)');
      });
    });

    describe('Specified unique short_name and long_name', () => {
      it('should use the provided short_name and long_name without appending a number', () => {
        const names = getNamesForAdd(
          ['Fa18', 'Fa19'],
          ['Fall 2018', 'Fall 2019'],
          'Fa20',
          'Fall 2020',
        );
        assert.equal(names['shortName'], 'Fa20');
        assert.equal(names['longName'], 'Fall 2020');
      });
    });

    describe('Duplicated short_name without number, unique long_name', () => {
      it('should append _2 to the short_name and (2) to the long_name', () => {
        const names = getNamesForAdd(
          ['Fa18', 'Fa19'],
          ['Fall 2018', 'Fall 2019'],
          'Fa19',
          'Fall 2019 Section 1',
        );
        assert.equal(names['shortName'], 'Fa19_2');
        assert.equal(names['longName'], 'Fall 2019 Section 1 (2)');
      });
    });

    describe('Duplicated short_name with number, unique long_name', () => {
      it('should increment the number for the short_name and append it to both short_name and long_name', () => {
        const names = getNamesForAdd(
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
    });

    describe('Unique short_name, duplicated long_name without number', () => {
      it('should append _2 to the short_name and (2) to the long_name', () => {
        const names = getNamesForAdd(
          ['Fa18', 'Fa19'],
          ['Fall 2018', 'Fall 2019'],
          'Fall19',
          'Fall 2019',
        );
        assert.equal(names['shortName'], 'Fall19_2');
        assert.equal(names['longName'], 'Fall 2019 (2)');
      });
    });

    describe('Unique short_name, duplicated long_name with number', () => {
      it('should increment the number for the long_name and append it to both short_name and long_name', () => {
        const names = getNamesForAdd(
          ['Fa18', 'Fa19', 'Fall19_2', 'Fall19_3'],
          ['Fall 2018', 'Fall 2019', 'Fall 2019 (2)', 'Fall 2019 (3)'],
          'Fall_19',
          'Fall 2019',
        );
        assert.equal(names['shortName'], 'Fall_19_4');
        assert.equal(names['longName'], 'Fall 2019 (4)');
      });
    });

    describe('Duplicated short_name without number, duplicated long_name without number', () => {
      it('should append _2 to the short_name and (2) to the long_name', () => {
        const names = getNamesForAdd(
          ['Fa18', 'Fa19'],
          ['Fall 2018', 'Fall 2019'],
          'Fa19',
          'Fall 2019',
        );
        assert.equal(names['shortName'], 'Fa19_2');
        assert.equal(names['longName'], 'Fall 2019 (2)');
      });
    });

    describe('Duplicated short_name with number, duplicated long_name with number, numbers the same', () => {
      it('should increment both the short_name number and long_name number', () => {
        const names = getNamesForAdd(
          ['Fa18', 'Fa19', 'Fa19_2', 'Fa19_3'],
          ['Fall 2018', 'Fall 2019', 'Fall 2019 (2)', 'Fall 2019 (3)'],
          'Fa19',
          'Fall 2019',
        );
        assert.equal(names['shortName'], 'Fa19_4');
        assert.equal(names['longName'], 'Fall 2019 (4)');
      });
    });

    describe('Duplicated short_name with number, duplicated long_name with number, short_name number > long_name number', () => {
      it('should use the higher number from short_name to generate the next increment', () => {
        const names = getNamesForAdd(
          ['Fa18', 'Fa19', 'Fa19_2', 'Fa19_3'],
          ['Fall 2018', 'Fall 2019', 'Fall 2019 (2)'],
          'Fa19',
          'Fall 2019',
        );
        assert.equal(names['shortName'], 'Fa19_4');
        assert.equal(names['longName'], 'Fall 2019 (4)');
      });
    });

    describe('Duplicated short_name with number, duplicated long_name with number, short_name number < long_name number', () => {
      it('should use the higher number from long_name to generate the next increment', () => {
        const names = getNamesForAdd(
          ['Fa18', 'Fa19', 'Fa19_2'],
          ['Fall 2018', 'Fall 2019', 'Fall 2019 (2)', 'Fall 2019 (3)'],
          'Fa19',
          'Fall 2019',
        );
        assert.equal(names['shortName'], 'Fa19_4');
        assert.equal(names['longName'], 'Fall 2019 (4)');
      });
    });
  });
});
