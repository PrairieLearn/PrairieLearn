import { isEqual, pick } from 'es-toolkit';

interface NamedEntity {
  name: string;
}

type ExistingEntity<Entity> = Entity & {
  number: number;
  implicit: boolean;
};

type ExtraEntity<Entity> = Entity & {
  implicit: boolean;
};

type DesiredEntity<Entity> = Entity & { number: number; implicit: boolean };

/**
 * This function is used to determine which entities need to be created, updated, or deleted.
 * An "entity" is a named object that exists in a course (a tag, a topic, an assessment
 * set, or an assessment module). Entities may be listed explicitly (e.g. in `infoCourse.json`)
 * or implicitly, e.g. by use in questions or assessments.
 *
 * This function takes in a variety of information, including the actual state of the
 * course the current list of entities from the database. In produces arrays of entities to
 * create and update, and entity names to delete.
 */
export function determineOperationsForEntities<Entity extends NamedEntity>({
  courseEntities,
  extraEntities,
  existingEntities,
  knownNames,
  makeImplicitEntity,
  comparisonProperties,
  isInfoCourseValid,
  deleteUnused,
}: {
  /** The entities that are listed explicitly in the course. */
  courseEntities: Entity[];
  /** Any extra entities that should always exist. */
  extraEntities?: ExtraEntity<Entity>[];
  /** The entities that already exist in the database. */
  existingEntities: ExistingEntity<Entity>[];
  /** The names of all known entities as used in questions or assessments. */
  knownNames: Set<string>;
  /** A function to produce an "implicit" entity for a given name. */
  makeImplicitEntity: (name: string) => Entity;
  /**
   * A list of properties to use when comparing entities for equality.
   * Need not include `name`, `number`, or `implicit`, these will always
   * be used for comparisons.
   */
  comparisonProperties: Exclude<keyof ExistingEntity<Entity>, 'name' | 'number' | 'implicit'>[];
  /** Whether or not the `infoCourse.json` file is valid. */
  isInfoCourseValid: boolean;
  /** Whether or not unused entities should be deleted. */
  deleteUnused: boolean;
}): {
  entitiesToCreate: DesiredEntity<Entity>[];
  entitiesToUpdate: DesiredEntity<Entity>[];
  entitiesToDelete: string[];
} {
  const fullComparisonProperties = [
    'name' as keyof Entity,
    'number' as keyof Entity,
    'implicit' as keyof Entity,
    'comment' as keyof Entity,
    ...comparisonProperties,
  ];

  const existingEntitiesMap = new Map(existingEntities.map((entity) => [entity.name, entity]));
  const desiredEntities = new Map<string, DesiredEntity<Entity>>();

  // If `infoCourse.json` is invalid, keep all existing entities in place.
  // Otherwise, sync whatever is in the JSON file.
  if (isInfoCourseValid) {
    for (const entity of courseEntities) {
      desiredEntities.set(entity.name, {
        ...entity,
        implicit: false,
        number: desiredEntities.size + 1,
      });
    }
  } else {
    for (const entity of existingEntities) {
      desiredEntities.set(entity.name, {
        ...entity,
        number: desiredEntities.size + 1,
      });
    }
  }

  // Consider each entity name that's actually used. If it doesn't already exist,
  // add an implicit version. Sort for consistent ordering.
  for (const name of Array.from(knownNames).sort()) {
    if (desiredEntities.has(name)) continue;

    desiredEntities.set(name, {
      ...makeImplicitEntity(name),
      implicit: true,
      number: desiredEntities.size + 1,
    } satisfies DesiredEntity<Entity>);
  }

  // Add any extra entities at the end.
  if (extraEntities?.length) {
    for (const entity of extraEntities) {
      // Give precedence to user-provided entities if they have the same name.
      if (desiredEntities.has(entity.name)) continue;

      desiredEntities.set(entity.name, {
        ...entity,
        number: desiredEntities.size + 1,
      });
    }
  }

  // Based on the set of desired entities, determine which ones must be
  // created, updated, or deleted.
  const entitiesToCreate = new Map<string, DesiredEntity<Entity>>();
  const entitiesToUpdate = new Map<string, DesiredEntity<Entity>>();
  const entitiesToDelete = new Set<string>();

  for (const [name, entity] of desiredEntities) {
    const existingEntity = existingEntitiesMap.get(name);

    if (!existingEntity) {
      entitiesToCreate.set(name, entity);
    } else if (
      !isEqual(
        pick(existingEntity, fullComparisonProperties),
        pick(entity, fullComparisonProperties),
      )
    ) {
      // We'll only update the entity if it has changed.
      entitiesToUpdate.set(name, entity);
    }
  }

  if (deleteUnused) {
    for (const name of existingEntitiesMap.keys()) {
      if (!desiredEntities.has(name)) {
        entitiesToDelete.add(name);
      }
    }
  }

  return {
    entitiesToCreate: Array.from(entitiesToCreate.values()),
    entitiesToUpdate: Array.from(entitiesToUpdate.values()),
    entitiesToDelete: Array.from(entitiesToDelete.values()),
  };
}
