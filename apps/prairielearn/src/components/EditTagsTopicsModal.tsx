import clsx from 'clsx';
import { useState } from 'react';
import { Modal } from 'react-bootstrap';

import { type StaffTag, type StaffTopic } from '../lib/client/safe-db-types.js';
import { ColorJsonSchema } from '../schemas/infoCourse.js';

import { ColorSwatch } from './ColorSwatch.js';
import { TagBadge } from './TagBadge.js';
import { TopicBadge } from './TopicBadge.js';

export type EditTagsTopicsModalState<Entity extends StaffTopic | StaffTag> =
  | { type: 'closed' }
  | { type: 'create'; entityType: 'topic' | 'tag'; entity: Entity }
  | { type: 'edit'; entityType: 'topic' | 'tag'; entity: Entity };

export function EditTagsTopicsModal<Entity extends StaffTopic | StaffTag>({
  state,
  onClose,
  onSave,
}: {
  state: EditTagsTopicsModalState<Entity>;
  onClose: () => void;
  onSave: (entity: Entity) => void;
}) {
  // Extract the entity to edit/create, or null if closed
  const entityToEdit =
    state.type === 'create' ? state.entity : state.type === 'edit' ? state.entity : null;

  const [entity, setEntity] = useState<Entity | null>(entityToEdit);
  const [invalidName, setInvalidName] = useState(false);
  const [invalidColor, setInvalidColor] = useState(false);

  function handleModalEntering() {
    if (!entityToEdit) return;
    setEntity(entityToEdit);
    setInvalidName(false);
    setInvalidColor(false);
  }

  function handleModalExited() {
    setEntity(null);
    setInvalidName(false);
    setInvalidColor(false);
  }

  function handleSubmit() {
    if (!entity) return;

    const isNameValid = !!entity.name;
    const isColorValid = !!entity.color;

    setInvalidName(!isNameValid);
    setInvalidColor(!isColorValid);

    if (isNameValid && isColorValid) {
      onSave(entity);
    }
  }

  const isOpen = state.type !== 'closed';
  const isCreateMode = state.type === 'create';

  return (
    <Modal
      show={isOpen}
      onHide={onClose}
      onEntering={handleModalEntering}
      onExited={handleModalExited}
    >
      <Modal.Header closeButton>
        <Modal.Title>
          {isCreateMode
            ? state.entityType === 'topic'
              ? 'Add topic'
              : 'Add tag'
            : state.type === 'edit' && state.entityType === 'topic'
              ? 'Edit topic'
              : 'Edit tag'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {entity ? (
          <>
            <div className="d-flex flex-column align-items-center mb-4">
              {state.type !== 'closed' && state.entityType === 'topic' ? (
                <TopicBadge
                  topic={{
                    name: entity.name || 'Topic preview',
                    color: entity.color,
                  }}
                />
              ) : (
                <TagBadge
                  tag={{
                    name: entity.name || 'Tag preview',
                    color: entity.color,
                  }}
                />
              )}
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="name">
                Name
              </label>
              <input
                type="text"
                className={clsx('form-control', invalidName && 'is-invalid')}
                id="name"
                value={entity.name}
                onChange={(e) =>
                  setEntity({
                    ...entity,
                    name: e.currentTarget.value,
                  })
                }
              />
              {invalidName && (
                <div className="invalid-feedback">
                  {state.type !== 'closed' && state.entityType === 'topic' ? 'Topic' : 'Tag'} name
                  is required
                </div>
              )}
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="color">
                Color
              </label>
              <div className="d-flex gap-2 align-items-center">
                <select
                  className={clsx('form-select', invalidColor && 'is-invalid')}
                  id="color"
                  value={entity.color}
                  onChange={(e) =>
                    setEntity({
                      ...entity,
                      color: e.currentTarget.value,
                    })
                  }
                >
                  {ColorJsonSchema.options.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
                <ColorSwatch color={entity.color} />
              </div>
              {invalidColor && (
                <div className="invalid-feedback">
                  {state.type !== 'closed' && state.entityType === 'topic' ? 'Topic' : 'Tag'} color
                  is required
                </div>
              )}
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="description">
                Description
              </label>
              <input
                type="text"
                className="form-control"
                id="description"
                value={entity.description}
                onChange={(e) =>
                  setEntity({
                    ...entity,
                    description: e.currentTarget.value,
                  })
                }
              />
            </div>
          </>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-primary me-2" onClick={handleSubmit}>
          {isCreateMode
            ? state.entityType === 'topic'
              ? 'Add topic'
              : 'Add tag'
            : state.type === 'edit' && state.entityType === 'topic'
              ? 'Update topic'
              : 'Update tag'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </Modal.Footer>
    </Modal>
  );
}
