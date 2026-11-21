import { useState } from 'react';

import { ComboBox, type ComboBoxItem, LabelPicker, TagPicker } from '@prairielearn/ui';

import {
  EditTagsTopicsModal,
  type EditTagsTopicsModalState,
} from '../../../components/EditTagsTopicsModal.js';
import { TagBadge } from '../../../components/TagBadge.js';
import { TagDescription } from '../../../components/TagDescription.js';
import { TopicBadge } from '../../../components/TopicBadge.js';
import { TopicDescription } from '../../../components/TopicDescription.js';
import {
  type StaffTag,
  StaffTagSchema,
  type StaffTopic,
  StaffTopicSchema,
} from '../../../lib/client/safe-db-types.js';
import { ColorJsonSchema } from '../../../schemas/infoCourse.js';

export type TopicTagVariant = 'inline' | 'modal' | 'popover';

type Entity = StaffTopic | StaffTag;
type EntityType = 'topic' | 'tag';

function makeEntity<E extends Entity>(
  entityType: EntityType,
  { name, color, description }: { name: string; color: string; description: string },
): E {
  const raw = {
    // Placeholder IDs; these entities only exist client-side until the form is saved.
    id: String(Number.MAX_SAFE_INTEGER - name.length),
    course_id: '1',
    name,
    color,
    description,
    implicit: false,
    json_comment: null,
    number: 0,
  };
  return (entityType === 'topic' ? StaffTopicSchema.parse(raw) : StaffTagSchema.parse(raw)) as E;
}

/** Suggest the first palette color not already used, so new entities stand out. */
function suggestColor(existing: Entity[]) {
  const used = new Set(existing.map((e) => e.color));
  return ColorJsonSchema.options.find((c) => !used.has(c) && !c.startsWith('gray')) ?? 'gray1';
}

function EntityBadge({ entityType, entity }: { entityType: EntityType; entity: Entity }) {
  return entityType === 'topic' ? <TopicBadge topic={entity} /> : <TagBadge tag={entity} />;
}

function EntityDescription({ entityType, entity }: { entityType: EntityType; entity: Entity }) {
  if (entityType === 'topic') return <TopicDescription topic={entity} />;
  return <TagDescription tag={entity} />;
}

function NewEntitiesNote({
  entityType,
  entities,
  manageUrl,
  variant,
}: {
  entityType: EntityType;
  entities: Entity[];
  manageUrl: string;
  variant: TopicTagVariant;
}) {
  if (entities.length === 0) return null;
  const noun = entityType === 'topic' ? 'topic' : entities.length === 1 ? 'tag' : 'tags';
  return (
    <div className="form-text d-flex align-items-start gap-2 mt-2" role="status">
      <i className="bi bi-plus-circle-dotted mt-1" aria-hidden="true" />
      <div>
        New {noun}{' '}
        {entities.map((e) => (
          <span key={e.name} className="me-1">
            <EntityBadge entityType={entityType} entity={e} />
          </span>
        ))}
        {variant === 'inline' ? (
          <>
            will be created when you save. Set a color and description on the{' '}
            <a href={manageUrl} target="_blank" rel="noreferrer">
              {entityType === 'topic' ? 'Topics' : 'Tags'} page
            </a>
            .
          </>
        ) : (
          <>will be added to the course when you save.</>
        )}
      </div>
    </div>
  );
}

function ItemContent({ entityType, entity }: { entityType: EntityType; entity: Entity }) {
  const showDescription = !entity.implicit && entity.description;
  return (
    <div className="preferences-combobox-item">
      <EntityBadge entityType={entityType} entity={entity} />
      {showDescription && (
        <div>
          <small className="text-muted">
            <EntityDescription entityType={entityType} entity={entity} />
          </small>
        </div>
      )}
    </div>
  );
}

function PopoverItemContent({ entityType, entity }: { entityType: EntityType; entity: Entity }) {
  return (
    <div className="d-flex align-items-start gap-2">
      <span
        className="rounded-circle flex-shrink-0 mt-1 border"
        style={{
          width: '0.85rem',
          height: '0.85rem',
          backgroundColor: `var(--color-${entity.color})`,
        }}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <div className="fw-semibold small text-truncate">{entity.name}</div>
        {!entity.implicit && entity.description && (
          <div className="small text-body-secondary text-truncate">
            <EntityDescription entityType={entityType} entity={entity} />
          </div>
        )}
      </div>
    </div>
  );
}

export function TopicTagField<E extends Entity>({
  entityType,
  variant,
  courseEntities,
  value,
  onChange,
  manageUrl,
}: {
  entityType: EntityType;
  variant: TopicTagVariant;
  courseEntities: E[];
  value: string[];
  onChange: (value: string[]) => void;
  manageUrl: string;
}) {
  const [newEntities, setNewEntities] = useState<E[]>([]);
  const [modalState, setModalState] = useState<EditTagsTopicsModalState<E>>({ type: 'closed' });

  const allEntities = [...courseEntities, ...newEntities];
  const isTopic = entityType === 'topic';
  const label = isTopic ? 'Topic' : 'Tags';
  const noun = isTopic ? 'topic' : 'tag';
  const id = isTopic ? 'topic' : 'tags';

  const sorted = isTopic
    ? allEntities
    : [...allEntities].sort((a, b) => {
        if (a.implicit !== b.implicit) return a.implicit ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
  const items: ComboBoxItem<E>[] = sorted.map((e) => ({
    id: e.name,
    data: e,
    label: e.name,
    searchableText: `${e.name} ${e.description}`,
  }));

  function addEntity(entity: E) {
    setNewEntities((prev) => [...prev, entity]);
    onChange(isTopic ? [entity.name] : [...value, entity.name]);
  }

  function handleCreate(name: string) {
    if (variant === 'inline') {
      addEntity(makeEntity<E>(entityType, { name, color: 'gray1', description: '' }));
    } else if (variant === 'modal') {
      setModalState({
        type: 'create',
        entityType,
        entity: makeEntity<E>(entityType, {
          name,
          color: suggestColor(allEntities),
          description: '',
        }),
      });
    } else {
      addEntity(
        makeEntity<E>(entityType, { name, color: suggestColor(allEntities), description: '' }),
      );
    }
  }

  const pendingNew = newEntities.filter((e) => value.includes(e.name));
  const renderCreateOption = (input: string) => (
    <>
      Create {noun} <strong>“{input}”</strong>
      {variant === 'modal' && <span className="text-body-secondary">…</span>}
    </>
  );

  const field =
    variant === 'popover' ? (
      <LabelPicker
        label={label}
        name={id}
        items={items}
        value={value}
        selectionMode={isTopic ? 'single' : 'multiple'}
        popoverTitle={isTopic ? 'Set topic' : 'Apply tags to this question'}
        searchPlaceholder={isTopic ? 'Filter topics' : 'Filter tags'}
        emptyText={isTopic ? 'No topic' : 'No tags'}
        renderItem={(item) => <PopoverItemContent entityType={entityType} entity={item.data!} />}
        renderValue={(selected) => (
          <div className="d-flex flex-wrap gap-1">
            {selected.map((item) => (
              <EntityBadge key={item.id} entityType={entityType} entity={item.data!} />
            ))}
          </div>
        )}
        renderCreateOption={renderCreateOption}
        footer={
          <a
            href={manageUrl}
            target="_blank"
            rel="noreferrer"
            className="link-secondary text-decoration-none d-inline-flex align-items-center gap-1"
          >
            <i className="bi bi-pencil" aria-hidden="true" />
            Edit {isTopic ? 'topics' : 'tags'}
            <i className="bi bi-box-arrow-up-right small" aria-hidden="true" />
            <span className="visually-hidden">(opens in a new tab)</span>
          </a>
        }
        onChange={onChange}
        onCreate={handleCreate}
      />
    ) : (
      <>
        <label className="form-label" id={`${id}-label`} htmlFor={id}>
          {label}
        </label>
        {isTopic ? (
          <ComboBox
            id={id}
            name={id}
            items={items}
            value={value[0] ?? null}
            placeholder="Select or create a topic"
            aria-labelledby={`${id}-label`}
            renderItem={(item) => <ItemContent entityType={entityType} entity={item.data!} />}
            renderCreateOption={renderCreateOption}
            onChange={(v) => onChange(v ? [v] : [])}
            onCreate={handleCreate}
          />
        ) : (
          <TagPicker
            id={id}
            name={id}
            items={items}
            value={value}
            placeholder="Select or create tags"
            aria-labelledby={`${id}-label`}
            renderItem={(item) => <ItemContent entityType={entityType} entity={item.data!} />}
            renderTagContent={(data) => data.name}
            tagClassName={(data) => `badge color-${data.color}`}
            renderCreateOption={renderCreateOption}
            onChange={onChange}
            onCreate={handleCreate}
          />
        )}
      </>
    );

  return (
    <>
      {field}
      <NewEntitiesNote
        entityType={entityType}
        entities={pendingNew}
        manageUrl={manageUrl}
        variant={variant}
      />
      {variant === 'modal' && (
        <EditTagsTopicsModal
          state={modalState}
          onClose={() => setModalState({ type: 'closed' })}
          onSave={(entity) => {
            addEntity(entity);
            setModalState({ type: 'closed' });
          }}
        />
      )}
    </>
  );
}
