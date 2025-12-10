import { assert, describe, it } from 'vitest';

import { determineOperationsForEntities } from './entity-list.js';

interface TestEntity {
  name: string;
}

interface TestEntityWithHeading {
  name: string;
  heading: string;
}

describe('determineOperationsForEntities', () => {
  it('handles empty lists', () => {
    const result = determineOperationsForEntities<TestEntity>({
      courseEntities: [],
      existingEntities: [],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name }),
      comparisonProperties: [],
      isInfoCourseValid: true,
      deleteUnused: true,
    });

    assert.lengthOf(result.entitiesToCreate, 0);
    assert.lengthOf(result.entitiesToUpdate, 0);
    assert.lengthOf(result.entitiesToDelete, 0);
  });

  it('handles adding explicit entities', () => {
    const result = determineOperationsForEntities<TestEntity>({
      courseEntities: [{ name: 'A' }, { name: 'B' }],
      existingEntities: [],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name, implicit: true }),
      comparisonProperties: [],
      isInfoCourseValid: true,
      deleteUnused: true,
    });

    assert.lengthOf(result.entitiesToCreate, 2);
    assert.deepEqual(result.entitiesToCreate[0], { name: 'A', implicit: false, number: 1 });
    assert.deepEqual(result.entitiesToCreate[1], { name: 'B', implicit: false, number: 2 });

    assert.lengthOf(result.entitiesToUpdate, 0);
    assert.lengthOf(result.entitiesToDelete, 0);
  });

  it('handles adding implicit entities', () => {
    const result = determineOperationsForEntities<TestEntity>({
      courseEntities: [],
      existingEntities: [],
      knownNames: new Set(['A', 'B']),
      makeImplicitEntity: (name: string) => ({ name }),
      comparisonProperties: [],
      isInfoCourseValid: true,
      deleteUnused: true,
    });

    assert.lengthOf(result.entitiesToCreate, 2);
    assert.deepEqual(result.entitiesToCreate[0], { name: 'A', implicit: true, number: 1 });
    assert.deepEqual(result.entitiesToCreate[1], { name: 'B', implicit: true, number: 2 });

    assert.lengthOf(result.entitiesToUpdate, 0);
    assert.lengthOf(result.entitiesToDelete, 0);
  });

  it('handles adding extra entities', () => {
    const result = determineOperationsForEntities<TestEntity>({
      courseEntities: [],
      extraEntities: [
        { name: 'A', implicit: true },
        { name: 'B', implicit: true },
      ],
      existingEntities: [],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name }),
      comparisonProperties: [],
      isInfoCourseValid: true,
      deleteUnused: true,
    });

    assert.lengthOf(result.entitiesToCreate, 2);
    assert.deepEqual(result.entitiesToCreate[0], { name: 'A', implicit: true, number: 1 });
    assert.deepEqual(result.entitiesToCreate[1], { name: 'B', implicit: true, number: 2 });

    assert.lengthOf(result.entitiesToUpdate, 0);
    assert.lengthOf(result.entitiesToDelete, 0);
  });

  it('handles adding extra entities with explicit overrides', () => {
    const result = determineOperationsForEntities<TestEntityWithHeading>({
      courseEntities: [
        { name: 'A', heading: 'A' },
        { name: 'Default', heading: 'Custom default' },
      ],
      extraEntities: [
        {
          name: 'Default',
          heading: 'Default entity',
          implicit: true,
        },
      ],
      existingEntities: [],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({
        name,
        heading: `${name} (implicit)`,
      }),
      comparisonProperties: ['heading'],
      isInfoCourseValid: true,
      deleteUnused: true,
    });

    assert.lengthOf(result.entitiesToCreate, 2);
    assert.deepEqual(result.entitiesToCreate[0], {
      name: 'A',
      heading: 'A',
      implicit: false,
      number: 1,
    });
    assert.deepEqual(result.entitiesToCreate[1], {
      name: 'Default',
      heading: 'Custom default',
      implicit: false,
      number: 2,
    });

    assert.lengthOf(result.entitiesToDelete, 0);
  });

  it('handles adding explicit and implicit entities', () => {
    const result = determineOperationsForEntities<TestEntity>({
      courseEntities: [{ name: 'A' }, { name: 'B' }],
      existingEntities: [],
      knownNames: new Set(['A', 'B', 'D', 'C']),
      makeImplicitEntity: (name: string) => ({ name }),
      comparisonProperties: [],
      isInfoCourseValid: true,
      deleteUnused: true,
    });

    assert.lengthOf(result.entitiesToCreate, 4);
    assert.deepEqual(result.entitiesToCreate[0], { name: 'A', implicit: false, number: 1 });
    assert.deepEqual(result.entitiesToCreate[1], { name: 'B', implicit: false, number: 2 });
    assert.deepEqual(result.entitiesToCreate[2], { name: 'C', implicit: true, number: 3 });
    assert.deepEqual(result.entitiesToCreate[3], { name: 'D', implicit: true, number: 4 });

    assert.lengthOf(result.entitiesToUpdate, 0);
    assert.lengthOf(result.entitiesToDelete, 0);
  });

  it('handles updating explicit entities', () => {
    const result = determineOperationsForEntities<TestEntityWithHeading>({
      courseEntities: [
        { name: 'A', heading: 'A new' },
        { name: 'B', heading: 'B new' },
      ],
      existingEntities: [
        { name: 'A', heading: 'A', implicit: false, number: 1 },
        { name: 'B', heading: 'B', implicit: false, number: 2 },
      ],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name, heading: name }),
      comparisonProperties: ['heading'],
      isInfoCourseValid: true,
      deleteUnused: true,
    });

    assert.lengthOf(result.entitiesToCreate, 0);

    assert.lengthOf(result.entitiesToUpdate, 2);
    assert.deepEqual(result.entitiesToUpdate[0], {
      name: 'A',
      heading: 'A new',
      implicit: false,
      number: 1,
    });
    assert.deepEqual(result.entitiesToUpdate[1], {
      name: 'B',
      heading: 'B new',
      implicit: false,
      number: 2,
    });

    assert.lengthOf(result.entitiesToDelete, 0);
  });

  it('does not update unchanged entities', () => {
    const result = determineOperationsForEntities<TestEntityWithHeading>({
      courseEntities: [
        { name: 'A', heading: 'A' },
        { name: 'B', heading: 'B' },
      ],
      existingEntities: [
        { name: 'A', heading: 'A', implicit: false, number: 1 },
        { name: 'B', heading: 'B', implicit: false, number: 2 },
      ],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name, heading: name }),
      comparisonProperties: ['heading'],
      isInfoCourseValid: true,
      deleteUnused: true,
    });

    assert.lengthOf(result.entitiesToCreate, 0);
    assert.lengthOf(result.entitiesToUpdate, 0);
    assert.lengthOf(result.entitiesToDelete, 0);
  });

  it('handles transitioning from implicit to explicit entities', () => {
    const result = determineOperationsForEntities<TestEntityWithHeading>({
      courseEntities: [
        { name: 'A', heading: 'A new' },
        { name: 'B', heading: 'B new' },
      ],
      existingEntities: [
        { name: 'A', heading: 'A', implicit: true, number: 1 },
        { name: 'B', heading: 'B', implicit: true, number: 2 },
      ],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name, heading: name }),
      comparisonProperties: ['heading'],
      isInfoCourseValid: true,
      deleteUnused: true,
    });

    assert.lengthOf(result.entitiesToCreate, 0);

    assert.lengthOf(result.entitiesToUpdate, 2);
    assert.deepEqual(result.entitiesToUpdate[0], {
      name: 'A',
      heading: 'A new',
      implicit: false,
      number: 1,
    });
    assert.deepEqual(result.entitiesToUpdate[1], {
      name: 'B',
      heading: 'B new',
      implicit: false,
      number: 2,
    });

    assert.lengthOf(result.entitiesToDelete, 0);
  });

  it('handles transitioning from explicit to implicit entities', () => {
    const result = determineOperationsForEntities<TestEntityWithHeading>({
      courseEntities: [],
      existingEntities: [
        { name: 'A', heading: 'A', implicit: false, number: 1 },
        { name: 'B', heading: 'B', implicit: false, number: 2 },
      ],
      knownNames: new Set(['A', 'B']),
      makeImplicitEntity: (name: string) => ({
        name,
        heading: `${name} (implicit)`,
      }),
      comparisonProperties: ['heading'],
      isInfoCourseValid: true,
      deleteUnused: true,
    });

    assert.lengthOf(result.entitiesToCreate, 0);

    assert.lengthOf(result.entitiesToUpdate, 2);
    assert.deepEqual(result.entitiesToUpdate[0], {
      name: 'A',
      heading: 'A (implicit)',
      implicit: true,
      number: 1,
    });
    assert.deepEqual(result.entitiesToUpdate[1], {
      name: 'B',
      heading: 'B (implicit)',
      implicit: true,
      number: 2,
    });

    assert.lengthOf(result.entitiesToDelete, 0);
  });

  it('handles deleting explicit entities', () => {
    const result = determineOperationsForEntities<TestEntityWithHeading>({
      courseEntities: [],
      existingEntities: [
        { name: 'A', heading: 'A', implicit: false, number: 1 },
        { name: 'B', heading: 'B', implicit: false, number: 2 },
      ],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name, heading: name }),
      comparisonProperties: ['heading'],
      isInfoCourseValid: true,
      deleteUnused: true,
    });

    assert.lengthOf(result.entitiesToCreate, 0);
    assert.lengthOf(result.entitiesToUpdate, 0);

    assert.lengthOf(result.entitiesToDelete, 2);
    assert.deepEqual(result.entitiesToDelete, ['A', 'B']);
  });

  it('handles deleting implicit entities', () => {
    const result = determineOperationsForEntities<TestEntityWithHeading>({
      courseEntities: [],
      existingEntities: [
        { name: 'A', heading: 'A', implicit: true, number: 1 },
        { name: 'B', heading: 'B', implicit: true, number: 2 },
      ],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name, heading: name }),
      comparisonProperties: ['heading'],
      isInfoCourseValid: true,
      deleteUnused: true,
    });

    assert.lengthOf(result.entitiesToCreate, 0);
    assert.lengthOf(result.entitiesToUpdate, 0);

    assert.lengthOf(result.entitiesToDelete, 2);
    assert.deepEqual(result.entitiesToDelete, ['A', 'B']);
  });

  it('does not delete if it should not', () => {
    const result = determineOperationsForEntities<TestEntityWithHeading>({
      courseEntities: [],
      existingEntities: [
        { name: 'A', heading: 'A', implicit: false, number: 1 },
        { name: 'B', heading: 'B', implicit: true, number: 2 },
      ],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name, heading: name }),
      comparisonProperties: ['heading'],
      isInfoCourseValid: true,
      deleteUnused: false,
    });

    assert.lengthOf(result.entitiesToCreate, 0);
    assert.lengthOf(result.entitiesToUpdate, 0);
    assert.lengthOf(result.entitiesToDelete, 0);
  });

  it('uses existing entities if infoCourse.json is invalid', () => {
    const result = determineOperationsForEntities<TestEntityWithHeading>({
      courseEntities: [],
      existingEntities: [
        { name: 'A', heading: 'A', implicit: false, number: 1 },
        { name: 'B', heading: 'B', implicit: false, number: 2 },
      ],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name, heading: name }),
      comparisonProperties: ['heading'],
      isInfoCourseValid: false,
      deleteUnused: true,
    });

    assert.lengthOf(result.entitiesToCreate, 0);
    assert.lengthOf(result.entitiesToUpdate, 0);
    assert.lengthOf(result.entitiesToDelete, 0);
  });
});
