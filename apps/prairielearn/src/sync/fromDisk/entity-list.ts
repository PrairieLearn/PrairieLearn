interface NamedEntity {
  name: string;
}

type ExistingEntity<Entity> = Entity & {
  // TODO: make non-nullable once we make this non-null in the database schemas.
  number: number | null;
  implicit: boolean;
};

type ExtraEntity<Entity> = Entity & {
  implicit: boolean;
};

type DesiredEntity<Entity> = Entity & { number: number; implicit: boolean };

export function determineOperationsForEntities<Entity extends NamedEntity>({
  courseEntities,
  extraEntities,
  existingEntities,
  knownNames,
  makeImplicitEntity,
  makeDefaultEntity,
  isInfoCourseValid,
  deleteUnused,
}: {
  courseEntities: Entity[];
  extraEntities?: ExtraEntity<Entity>[];
  existingEntities: ExistingEntity<Entity>[];
  knownNames: Set<string>;
  makeImplicitEntity: (name: string) => Entity;
  makeDefaultEntity?: () => Entity | null;
  isInfoCourseValid: boolean;
  deleteUnused: boolean;
}): {
  entitiesToCreate: DesiredEntity<Entity>[];
  entitiesToUpdate: DesiredEntity<Entity>[];
  entitiesToDelete: string[];
} {
  const existingEntityNames = new Set(existingEntities.map((entity) => entity.name));
  const desiredEntities = new Map<string, DesiredEntity<Entity>>();

  // If `infoCourse.json` is invalid, keep all existing assessment sets in place.
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
    // Skip `Default`, we want this to be last to we'll handle it separately.
    if (name === 'Default') continue;

    if (desiredEntities.has(name)) continue;

    desiredEntities.set(name, {
      ...makeImplicitEntity(name),
      implicit: true,
      number: desiredEntities.size + 1,
    });
  }

  // Add a 'Default' entity if one doesn't already exist.
  if (!desiredEntities.has('Default')) {
    const defaultEntity = makeDefaultEntity?.();
    if (defaultEntity) {
      desiredEntities.set('Default', {
        ...defaultEntity,
        implicit: false,
        number: desiredEntities.size + 1,
      });
    }
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

  // Based on the set of desired assessment modules, determine which ones must be
  // added, updated, or deleted.
  const entitiesToAdd = new Map<string, DesiredEntity<Entity>>();
  const entitiesToUpdate = new Map<string, DesiredEntity<Entity>>();
  const entitiesToDelete = new Set<string>();

  for (const [name, module] of desiredEntities) {
    if (existingEntityNames.has(name)) {
      // TODO: check for equality, skip update if not needed.
      entitiesToUpdate.set(name, module);
    } else {
      entitiesToAdd.set(name, module);
    }
  }

  if (deleteUnused) {
    for (const name of existingEntityNames) {
      if (!desiredEntities.has(name)) {
        entitiesToDelete.add(name);
      }
    }
  }

  return {
    entitiesToCreate: Array.from(entitiesToAdd.values()),
    entitiesToUpdate: Array.from(entitiesToUpdate.values()),
    entitiesToDelete: Array.from(entitiesToDelete.values()),
  };
}
