import clsx from 'clsx';
import { type Key, type ReactNode, useMemo, useState } from 'react';
import { useFilter } from 'react-aria';
import {
  ComboBox as AriaComboBox,
  type ComboBoxProps as AriaComboBoxProps,
  Button,
  FieldError,
  Group,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Tag,
  TagGroup,
  TagList,
  Text,
} from 'react-aria-components';

/** An item in the ComboBox or TagPicker dropdown. */
export interface ComboBoxItem<T = void> {
  id: string;
  label: string;
  /** Custom data passed to renderItem. */
  data?: T;
  /** Text used for filtering (defaults to label). */
  searchableText?: string;
}

type ManagedAriaProps =
  | 'children'
  | 'items'
  | 'selectedKey'
  | 'defaultSelectedKey'
  | 'onSelectionChange'
  | 'inputValue'
  | 'defaultInputValue'
  | 'onInputChange'
  | 'onOpenChange'
  | 'menuTrigger'
  | 'allowsEmptyCollection'
  | 'isDisabled'
  | 'isInvalid';

export interface ComboBoxProps<T = void> extends Omit<
  AriaComboBoxProps<ComboBoxItem<T>>,
  ManagedAriaProps
> {
  items: ComboBoxItem<T>[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Name for hidden form input. */
  name?: string;
  /** ID for the input element. */
  id?: string;
  label?: string;
  description?: string;
  errorMessage?: string;
  renderItem?: (item: ComboBoxItem<T>) => ReactNode;
}

export interface TagPickerProps<T = void> extends Omit<
  AriaComboBoxProps<ComboBoxItem<T>>,
  ManagedAriaProps
> {
  items: ComboBoxItem<T>[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Name for hidden form inputs. */
  name?: string;
  /** ID for the input element. */
  id?: string;
  label?: string;
  description?: string;
  errorMessage?: string;
  renderItem?: (item: ComboBoxItem<T>) => ReactNode;
  renderTag?: (item: ComboBoxItem<T>) => ReactNode;
}

function defaultRenderItem<T>(item: ComboBoxItem<T>) {
  return <span>{item.label}</span>;
}

function defaultRenderTag<T>(item: ComboBoxItem<T>) {
  return <span className="badge bg-secondary">{item.label}</span>;
}

/**
 * Single-selection combobox with filtering.
 */
export function ComboBox<T = void>({
  items,
  value,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  name,
  id,
  label,
  description,
  errorMessage,
  renderItem = defaultRenderItem,
  ...props
}: ComboBoxProps<T>) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState('');

  const selectedItem = useMemo(
    () => items.find((item) => item.id === value) ?? null,
    [items, value],
  );

  // Input value is derived: show filter text when open, selected label when closed
  const inputValue = isOpen ? filterText : (selectedItem?.label ?? '');

  const filteredItems = useMemo(() => {
    if (!inputValue.trim()) return items;
    return items.filter((item) => {
      const searchable = item.searchableText ?? item.label;
      return contains(searchable, inputValue);
    });
  }, [items, inputValue, contains]);

  const handleSelectionChange = (key: Key | null) => {
    const stringKey = typeof key === 'string' ? key : null;
    const newSelectedItem = stringKey ? items.find((item) => item.id === stringKey) : null;
    onChange(stringKey);
    // Set filter text to new label for immediate display before props update
    setFilterText(newSelectedItem?.label ?? '');
  };

  const handleInputChange = (inputVal: string) => {
    setFilterText(inputVal);
    if (inputVal === '' && value !== null) {
      onChange(null);
    }
  };

  const handleOpenChange = (open: boolean, trigger?: 'focus' | 'input' | 'manual') => {
    setIsOpen(open);
    // Initialize filter text to selected label when opening via focus
    if (open && trigger === 'focus') {
      setFilterText(selectedItem?.label ?? '');
    }
  };

  return (
    <div className="position-relative">
      {name && <input name={name} type="hidden" value={value ?? ''} />}

      <AriaComboBox
        {...props}
        selectedKey={value}
        inputValue={inputValue}
        isDisabled={disabled}
        isInvalid={!!errorMessage}
        menuTrigger="focus"
        allowsEmptyCollection
        onSelectionChange={handleSelectionChange}
        onInputChange={handleInputChange}
        onOpenChange={handleOpenChange}
      >
        {label && <Label className="form-label">{label}</Label>}

        <Group
          className={clsx(
            'form-control d-flex align-items-center gap-1',
            disabled && 'bg-body-secondary',
            isOpen && 'border-primary shadow-sm',
            errorMessage && 'is-invalid',
          )}
          style={{ minHeight: '38px', cursor: disabled ? 'not-allowed' : 'text' }}
        >
          <Input
            className="border-0 flex-grow-1 bg-transparent"
            id={id}
            placeholder={placeholder}
            style={{ outline: 'none' }}
          />
          <Button aria-label="Show suggestions" className="border-0 bg-transparent p-0 ms-auto">
            <i
              aria-hidden="true"
              className={clsx('bi', isOpen ? 'bi-chevron-up' : 'bi-chevron-down', 'text-muted')}
            />
          </Button>
        </Group>

        {description && (
          <Text className="form-text text-muted" slot="description">
            {description}
          </Text>
        )}

        <FieldError className="invalid-feedback d-block">{errorMessage}</FieldError>

        <Popover
          className="dropdown-menu show py-0 overflow-auto"
          offset={2}
          style={{ maxHeight: '300px', width: 'var(--trigger-width)' }}
        >
          <ListBox
            className="list-unstyled m-0"
            items={filteredItems}
            renderEmptyState={() => (
              <div className="dropdown-item text-muted">No options found</div>
            )}
          >
            {(item) => (
              <ListBoxItem
                id={item.id}
                className={({ isFocused }) =>
                  clsx('dropdown-item d-flex align-items-center gap-2', isFocused && 'active')
                }
                style={{ cursor: 'pointer' }}
                textValue={item.label}
              >
                {({ isSelected }) => (
                  <>
                    <span className="flex-grow-1">{renderItem(item)}</span>
                    {isSelected && <i className="bi bi-check ms-auto" aria-hidden="true" />}
                  </>
                )}
              </ListBoxItem>
            )}
          </ListBox>
        </Popover>
      </AriaComboBox>
    </div>
  );
}

/**
 * Multi-selection combobox with removable tags.
 */
export function TagPicker<T = void>({
  items,
  value,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  name,
  id,
  label,
  description,
  errorMessage,
  renderItem = defaultRenderItem,
  renderTag = defaultRenderTag,
  ...props
}: TagPickerProps<T>) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedItems = useMemo(
    () => items.filter((item) => value.includes(item.id)),
    [items, value],
  );

  const filteredItems = useMemo(() => {
    if (!inputValue.trim()) return items;
    return items.filter((item) => {
      const searchable = item.searchableText ?? item.label;
      return contains(searchable, inputValue);
    });
  }, [items, inputValue, contains]);

  const handleRemoveTag = (keys: Set<Key>) => {
    const newValue = value.filter((v) => !keys.has(v));
    onChange(newValue);
  };

  const handleSelect = (key: Key | null) => {
    const itemId = typeof key === 'string' ? key : null;
    if (!itemId) return;
    if (value.includes(itemId)) {
      onChange(value.filter((v) => v !== itemId));
    } else {
      onChange([...value, itemId]);
    }
    setInputValue('');
  };

  return (
    <div className="position-relative">
      {name &&
        (selectedItems.length > 0 ? (
          selectedItems.map((item) => (
            <input key={item.id} name={name} type="hidden" value={item.id} />
          ))
        ) : (
          <input name={name} type="hidden" value="" />
        ))}

      <AriaComboBox
        {...props}
        inputValue={inputValue}
        isDisabled={disabled}
        isInvalid={!!errorMessage}
        menuTrigger="focus"
        selectedKey={null}
        allowsEmptyCollection
        onInputChange={setInputValue}
        onOpenChange={setIsOpen}
        onSelectionChange={handleSelect}
      >
        {label && <Label className="form-label">{label}</Label>}

        <Group
          className={clsx(
            'form-control d-flex flex-wrap align-items-center gap-1',
            disabled && 'bg-body-secondary',
            isOpen && 'border-primary shadow-sm',
            errorMessage && 'is-invalid',
          )}
          style={{ minHeight: '38px', cursor: disabled ? 'not-allowed' : 'text' }}
        >
          {selectedItems.length > 0 && (
            <TagGroup
              aria-label="Selected items"
              onRemove={!disabled ? handleRemoveTag : undefined}
            >
              <TagList>
                {selectedItems.map((item) => (
                  <Tag
                    key={item.id}
                    id={item.id}
                    className="d-inline-flex align-items-center"
                    style={{ lineHeight: 1.2 }}
                    textValue={item.label}
                  >
                    {renderTag(item)}
                    {!disabled && (
                      <Button
                        aria-label={`Remove ${item.label}`}
                        className="btn-close btn-close-sm ms-1 p-0 border-0 bg-transparent"
                        slot="remove"
                        style={{ fontSize: '0.6rem' }}
                      />
                    )}
                  </Tag>
                ))}
              </TagList>
            </TagGroup>
          )}

          <div className="flex-grow-1 d-flex align-items-center">
            <Input
              className="border-0 flex-grow-1 bg-transparent"
              id={id}
              placeholder={selectedItems.length === 0 ? placeholder : ''}
              style={{ outline: 'none', minWidth: '60px' }}
            />
            <Button aria-label="Show suggestions" className="border-0 bg-transparent p-0 ms-auto">
              <i
                aria-hidden="true"
                className={clsx('bi', isOpen ? 'bi-chevron-up' : 'bi-chevron-down', 'text-muted')}
              />
            </Button>
          </div>
        </Group>

        {description && (
          <Text className="form-text text-muted" slot="description">
            {description}
          </Text>
        )}

        <FieldError className="invalid-feedback d-block">{errorMessage}</FieldError>

        <Popover
          className="dropdown-menu show py-0 overflow-auto"
          offset={2}
          style={{ maxHeight: '300px', width: 'var(--trigger-width)' }}
        >
          <ListBox
            className="list-unstyled m-0"
            items={filteredItems}
            renderEmptyState={() => (
              <div className="dropdown-item text-muted">No options found</div>
            )}
          >
            {(item) => {
              const isSelected = value.includes(item.id);
              return (
                <ListBoxItem
                  id={item.id}
                  className={({ isFocused }) =>
                    clsx('dropdown-item d-flex align-items-center gap-2', isFocused && 'active')
                  }
                  style={{ cursor: 'pointer' }}
                  textValue={item.label}
                >
                  <input
                    checked={isSelected}
                    className="form-check-input m-0"
                    tabIndex={-1}
                    type="checkbox"
                    readOnly
                  />
                  <div className="flex-grow-1">{renderItem(item)}</div>
                </ListBoxItem>
              );
            }}
          </ListBox>
        </Popover>
      </AriaComboBox>
    </div>
  );
}
