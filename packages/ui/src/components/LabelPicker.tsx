import clsx from 'clsx';
import { type ReactNode, useState } from 'react';
import { useFilter } from 'react-aria';
import {
  Autocomplete,
  Button,
  Collection,
  Dialog,
  DialogTrigger,
  Heading,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
  SearchField,
} from 'react-aria-components';

import type { ComboBoxItem } from './ComboBox.js';

const CREATE_OPTION_KEY = '__pl_create_option__';

export interface LabelPickerProps<T = void> {
  /** Visible label for the field; also used to name the popover. */
  label: string;
  items: ComboBoxItem<T>[];
  value: string[];
  onChange: (value: string[]) => void;
  selectionMode: 'single' | 'multiple';
  /** Name for hidden form inputs. */
  name?: string;
  disabled?: boolean;
  /** Heading shown at the top of the popover. */
  popoverTitle?: string;
  searchPlaceholder?: string;
  /** Shown in place of the selected values when nothing is selected. */
  emptyText?: ReactNode;
  renderItem?: (item: ComboBoxItem<T>, state: { isSelected: boolean }) => ReactNode;
  /** Renders the selected values beneath the label. */
  renderValue: (items: ComboBoxItem<T>[]) => ReactNode;
  /** Accept a trimmed custom value from the search field. */
  onCreate?: (value: string) => void;
  renderCreateOption?: (value: string) => ReactNode;
  /** Extra content rendered at the bottom of the popover, e.g. a management link. */
  footer?: ReactNode;
}

/**
 * A GitHub-style label picker: the field shows the current selection, and a
 * gear button opens a searchable popover to change it.
 */
export function LabelPicker<T = void>({
  label,
  items,
  value,
  onChange,
  selectionMode,
  name,
  disabled = false,
  popoverTitle,
  searchPlaceholder = 'Filter',
  emptyText = 'None',
  renderItem = (item) => item.label,
  renderValue,
  onCreate,
  renderCreateOption = (v) => (
    <>
      Create <strong>{v}</strong>
    </>
  ),
  footer,
}: LabelPickerProps<T>) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  // Snapshot of the selection when the popover opened. Those items are listed
  // first, and stay put while the user toggles items so the list doesn't jump.
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  const trimmed = filterText.trim();
  const orderedItems = [
    ...items.filter((item) => pinnedIds.includes(item.id)),
    ...items.filter((item) => !pinnedIds.includes(item.id)),
  ];
  const filteredItems = orderedItems.filter((item) =>
    contains(item.searchableText ?? item.label, filterText),
  );
  const showCreate =
    !!onCreate &&
    !!trimmed &&
    !items.some((item) => item.label.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
  const selectedItems = value
    .map((v) => items.find((item) => item.id === v))
    .filter((item): item is ComboBoxItem<T> => item !== undefined);

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (open) setPinnedIds(value);
    if (!open) setFilterText('');
  }

  return (
    <div>
      {name && value.map((v) => <input key={v} name={name} type="hidden" value={v} />)}
      <DialogTrigger isOpen={isOpen} onOpenChange={handleOpenChange}>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <span className="form-label mb-0">{label}</span>
          <Button
            className="btn btn-sm btn-link text-body-secondary text-decoration-none p-0 d-inline-flex align-items-center gap-1"
            isDisabled={disabled}
            aria-label={`Edit ${label.toLocaleLowerCase()}`}
          >
            <i className="bi bi-gear" aria-hidden="true" />
            <span aria-hidden="true">Edit</span>
          </Button>
        </div>
        <Popover
          className="card shadow"
          placement="bottom end"
          offset={4}
          style={{ width: 'min(340px, calc(100vw - 32px))' }}
        >
          <Dialog className="outline-0" aria-label={popoverTitle ?? label}>
            <div className="d-flex align-items-center justify-content-between px-3 pt-2 pb-1">
              <Heading slot="title" className="h6 mb-0 small fw-semibold">
                {popoverTitle ?? label}
              </Heading>
              <Button
                className="btn-close"
                style={{ fontSize: '0.65rem' }}
                aria-label="Close"
                onPress={() => handleOpenChange(false)}
              />
            </div>
            <Autocomplete inputValue={filterText} onInputChange={setFilterText}>
              <SearchField aria-label={searchPlaceholder} className="px-3 py-2 border-bottom">
                <div className="position-relative">
                  <i
                    className="bi bi-search position-absolute top-50 translate-middle-y text-body-secondary"
                    style={{ left: '0.6rem', fontSize: '0.8rem' }}
                    aria-hidden="true"
                  />
                  <Input
                    className="form-control form-control-sm"
                    placeholder={searchPlaceholder}
                    style={{ paddingLeft: '1.8rem' }}
                    // Opening the picker is an explicit request to search, as in GitHub's label picker.
                    // oxlint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                  />
                </div>
              </SearchField>
              <ListBox
                aria-label={label}
                className="list-unstyled m-0 py-1 overflow-auto outline-0"
                style={{ maxHeight: '320px' }}
                selectionMode={selectionMode}
                selectedKeys={value}
                disallowEmptySelection={selectionMode === 'single'}
                renderEmptyState={() => (
                  <div className="px-3 py-2 text-body-secondary small">No matches</div>
                )}
                onSelectionChange={(keys) => {
                  const next = keys === 'all' ? items.map((i) => i.id) : [...keys].map(String);
                  if (next.includes(CREATE_OPTION_KEY)) {
                    onCreate?.(trimmed);
                    setFilterText('');
                    if (selectionMode === 'single') handleOpenChange(false);
                    return;
                  }
                  // Preserve the user's existing ordering, appending new selections.
                  const ordered = [
                    ...value.filter((v) => next.includes(v)),
                    ...next.filter((v) => !value.includes(v)),
                  ];
                  onChange(ordered);
                  if (selectionMode === 'single') handleOpenChange(false);
                }}
              >
                <Collection items={filteredItems}>
                  {(item: ComboBoxItem<T>) => (
                    <ListBoxItem
                      id={item.id}
                      textValue={item.label}
                      className={({ isFocused }) =>
                        clsx(
                          'd-flex align-items-start gap-2 px-3 py-2 outline-0',
                          isFocused && 'bg-primary-subtle',
                        )
                      }
                      style={{ cursor: 'pointer' }}
                    >
                      {({ isSelected }) => (
                        <>
                          <i
                            className={clsx(
                              'bi',
                              selectionMode === 'multiple' ? 'bi-check-lg' : 'bi-check2',
                              !isSelected && 'invisible',
                            )}
                            aria-hidden="true"
                          />
                          <div className="flex-grow-1 min-w-0">
                            {renderItem(item, { isSelected })}
                          </div>
                        </>
                      )}
                    </ListBoxItem>
                  )}
                </Collection>
                {showCreate && (
                  <ListBoxItem
                    id={CREATE_OPTION_KEY}
                    textValue={`Create ${trimmed}`}
                    className={({ isFocused }) =>
                      clsx(
                        'd-flex align-items-center gap-2 px-3 py-2 border-top outline-0',
                        isFocused && 'bg-primary-subtle',
                      )
                    }
                    style={{ cursor: 'pointer' }}
                  >
                    <i className="bi bi-plus-lg" aria-hidden="true" />
                    <span className="text-truncate">{renderCreateOption(trimmed)}</span>
                  </ListBoxItem>
                )}
              </ListBox>
            </Autocomplete>
            {footer && <div className="border-top px-3 py-2 small">{footer}</div>}
          </Dialog>
        </Popover>
      </DialogTrigger>
      {selectedItems.length > 0 ? (
        renderValue(selectedItems)
      ) : (
        <div className="text-body-secondary small">{emptyText}</div>
      )}
    </div>
  );
}
