import { assert } from 'chai';

import { determineOperationsForEntities } from './entity-list.js';

describe('determineOperationsForEntities', () => {
  it('handles empty lists', () => {
    const result = determineOperationsForEntities({
      courseEntities: [],
      existingEntities: [],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name, implicit: true }),
      isInfoCourseValid: true,
      deleteUnused: true,
    });

    assert.lengthOf(result.entitiesToCreate, 0);
    assert.lengthOf(result.entitiesToUpdate, 0);
    assert.lengthOf(result.entitiesToDelete, 0);
  });

  it('handles adding explicit entities', () => {
    const result = determineOperationsForEntities({
      courseEntities: [
        { name: 'A', implicit: false },
        { name: 'B', implicit: false },
      ],
      existingEntities: [],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name, implicit: true }),
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
    const result = determineOperationsForEntities({
      courseEntities: [],
      existingEntities: [],
      knownNames: new Set(['A', 'B']),
      makeImplicitEntity: (name: string) => ({ name, implicit: true }),
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
    const result = determineOperationsForEntities({
      courseEntities: [],
      extraEntities: [
        { name: 'A', implicit: true },
        { name: 'B', implicit: true },
      ],
      existingEntities: [],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name, implicit: true }),
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
    const result = determineOperationsForEntities({
      courseEntities: [
        { name: 'A', heading: 'A', implicit: false },
        { name: 'Default', heading: 'Custom default', implicit: false },
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
        implicit: true,
      }),
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
    const result = determineOperationsForEntities({
      courseEntities: [
        { name: 'A', implicit: false },
        { name: 'B', implicit: false },
      ],
      existingEntities: [],
      knownNames: new Set(['A', 'B', 'D', 'C']),
      makeImplicitEntity: (name: string) => ({ name, implicit: true }),
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
    const result = determineOperationsForEntities<{
      name: string;
      heading: string;
      implicit: boolean;
    }>({
      courseEntities: [
        { name: 'A', heading: 'A new', implicit: false },
        { name: 'B', heading: 'B new', implicit: false },
      ],
      existingEntities: [
        { name: 'A', heading: 'A', implicit: false, number: 1 },
        { name: 'B', heading: 'B', implicit: false, number: 2 },
      ],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name, heading: name, implicit: true }),
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

  it('handles transitioning from implicit to explicit entities', () => {
    const result = determineOperationsForEntities<{
      name: string;
      heading: string;
      implicit: boolean;
    }>({
      courseEntities: [
        { name: 'A', heading: 'A new', implicit: false },
        { name: 'B', heading: 'B new', implicit: false },
      ],
      existingEntities: [
        { name: 'A', heading: 'A', implicit: true, number: 1 },
        { name: 'B', heading: 'B', implicit: true, number: 2 },
      ],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name, heading: name, implicit: true }),
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
    const result = determineOperationsForEntities<{
      name: string;
      heading: string;
      implicit: boolean;
    }>({
      courseEntities: [],
      existingEntities: [
        { name: 'A', heading: 'A', implicit: false, number: 1 },
        { name: 'B', heading: 'B', implicit: false, number: 2 },
      ],
      knownNames: new Set(['A', 'B']),
      makeImplicitEntity: (name: string) => ({
        name,
        heading: `${name} (implicit)`,
        implicit: true,
      }),
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
    const result = determineOperationsForEntities<{
      name: string;
      heading: string;
      implicit: boolean;
    }>({
      courseEntities: [],
      existingEntities: [
        { name: 'A', heading: 'A', implicit: false, number: 1 },
        { name: 'B', heading: 'B', implicit: false, number: 2 },
      ],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name, heading: name, implicit: true }),
      isInfoCourseValid: true,
      deleteUnused: true,
    });

    assert.lengthOf(result.entitiesToCreate, 0);
    assert.lengthOf(result.entitiesToUpdate, 0);

    assert.lengthOf(result.entitiesToDelete, 2);
    assert.deepEqual(result.entitiesToDelete, ['A', 'B']);
  });

  it('handles deleting implicit entities', () => {
    const result = determineOperationsForEntities<{
      name: string;
      heading: string;
      implicit: boolean;
    }>({
      courseEntities: [],
      existingEntities: [
        { name: 'A', heading: 'A', implicit: true, number: 1 },
        { name: 'B', heading: 'B', implicit: true, number: 2 },
      ],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name, heading: name, implicit: true }),
      isInfoCourseValid: true,
      deleteUnused: true,
    });

    assert.lengthOf(result.entitiesToCreate, 0);
    assert.lengthOf(result.entitiesToUpdate, 0);

    assert.lengthOf(result.entitiesToDelete, 2);
    assert.deepEqual(result.entitiesToDelete, ['A', 'B']);
  });

  it('does not delete if it should not', async () => {
    const result = determineOperationsForEntities<{
      name: string;
      heading: string;
      implicit: boolean;
    }>({
      courseEntities: [],
      existingEntities: [
        { name: 'A', heading: 'A', implicit: false, number: 1 },
        { name: 'B', heading: 'B', implicit: true, number: 2 },
      ],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name, heading: name, implicit: true }),
      isInfoCourseValid: true,
      deleteUnused: false,
    });

    assert.lengthOf(result.entitiesToCreate, 0);
    assert.lengthOf(result.entitiesToUpdate, 0);
    assert.lengthOf(result.entitiesToDelete, 0);
  });

  it('uses existing entities if infoCourse.json is invalid', () => {
    const result = determineOperationsForEntities<{
      name: string;
      heading: string;
      implicit: boolean;
    }>({
      courseEntities: [],
      existingEntities: [
        { name: 'A', heading: 'A', implicit: false, number: 1 },
        { name: 'B', heading: 'B', implicit: false, number: 2 },
      ],
      knownNames: new Set(),
      makeImplicitEntity: (name: string) => ({ name, heading: name, implicit: true }),
      isInfoCourseValid: false,
      deleteUnused: true,
    });

    assert.lengthOf(result.entitiesToCreate, 0);

    assert.lengthOf(result.entitiesToUpdate, 2);
    assert.deepEqual(result.entitiesToUpdate[0], {
      name: 'A',
      heading: 'A',
      implicit: false,
      number: 1,
    });
    assert.deepEqual(result.entitiesToUpdate[1], {
      name: 'B',
      heading: 'B',
      implicit: false,
      number: 2,
    });

    assert.lengthOf(result.entitiesToDelete, 0);
  });
});
