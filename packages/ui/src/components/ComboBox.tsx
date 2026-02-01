import clsx from 'clsx';
import { type ReactNode, useState } from 'react';
import { useFilter } from 'react-aria';
import {
  ComboBox as AriaComboBox,
  type ComboBoxProps as AriaComboBoxProps,
  Autocomplete,
  Button,
  FieldError,
  Group,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  SearchField,
  Select,
  SelectValue,
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

export interface TagPickerProps<T = void> {
  items: ComboBoxItem<T>[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Name for hidden form inputs. */
  name?: string;
  /** ID for the input element. */
  id?: string;
  /** Accessible label for the component. */
  'aria-labelledby'?: string;
  label?: string;
  description?: string;
  errorMessage?: string;
  renderItem?: (item: ComboBoxItem<T>) => ReactNode;
  /** Renders just the content inside the tag (text/icon). The badge styling is applied by tagClassName. */
  renderTagContent?: (data: T) => ReactNode;
  /** Returns the class name for the tag badge wrapper. Defaults to "badge bg-secondary". */
  tagClassName?: (data: T) => string;
}

function defaultRenderItem<T>(item: ComboBoxItem<T>) {
  return <span>{item.label}</span>;
}

function defaultRenderTagContent(_data: unknown) {
  return null; // Will be overridden by label fallback in component
}

function defaultTagClassName(_data: unknown) {
  return 'badge bg-secondary';
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
  const [filterText, setFilterText] = useState('');

  // Filter by searchableText while textValue (label) controls display
  const filteredItems = items.filter((item) =>
    contains(item.searchableText ?? item.label, filterText),
  );

  return (
    <div className="position-relative">
      {name && <input name={name} type="hidden" value={value ?? ''} />}

      <AriaComboBox
        {...props}
        items={filteredItems}
        selectedKey={value}
        isDisabled={disabled}
        isInvalid={!!errorMessage}
        menuTrigger="focus"
        allowsEmptyCollection
        onInputChange={setFilterText}
        onSelectionChange={(key) => onChange(key as string | null)}
      >
        {({ isOpen }) => (
          <>
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
              placement="bottom"
              style={{ maxHeight: '300px', width: 'var(--trigger-width)' }}
            >
              <ListBox
                className="list-unstyled m-0"
                renderEmptyState={() => (
                  <div className="dropdown-item text-muted">No options found</div>
                )}
              >
                {(item: ComboBoxItem<T>) => (
                  <ListBoxItem
                    id={item.id}
                    className={({ isFocused, isSelected }) =>
                      clsx(
                        'dropdown-item d-flex align-items-center gap-2',
                        isFocused && 'active',
                        isSelected && 'fw-semibold',
                      )
                    }
                    style={{ cursor: 'pointer' }}
                    textValue={item.label}
                  >
                    <span className="flex-grow-1">{renderItem(item)}</span>
                  </ListBoxItem>
                )}
              </ListBox>
            </Popover>
          </>
        )}
      </AriaComboBox>
    </div>
  );
}

/**
 * Multi-selection picker with removable tags using Select with selectionMode="multiple".
 */
export function TagPicker<T = void>({
  items,
  value,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  name,
  id,
  'aria-labelledby': ariaLabelledby,
  label,
  description,
  errorMessage,
  renderItem = defaultRenderItem,
  renderTagContent = defaultRenderTagContent,
  tagClassName = defaultTagClassName,
}: TagPickerProps<T>) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="position-relative">
      {name &&
        (value.length > 0 ? (
          value.map((v) => <input key={v} name={name} type="hidden" value={v} />)
        ) : (
          <input name={name} type="hidden" value="" />
        ))}

      <Select<ComboBoxItem<T>, 'multiple'>
        aria-labelledby={ariaLabelledby}
        selectionMode="multiple"
        value={value}
        isDisabled={disabled}
        isInvalid={!!errorMessage}
        onChange={(keys) => onChange(keys as string[])}
        onOpenChange={setIsOpen}
      >
        {label && <Label className="form-label">{label}</Label>}

        <Button
          id={id}
          className={clsx(
            'form-control d-flex flex-wrap align-items-center gap-1 text-start',
            disabled && 'bg-body-secondary',
            isOpen && 'border-primary shadow-sm',
            errorMessage && 'is-invalid',
          )}
          style={{ minHeight: '38px', cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          <SelectValue<
            ComboBoxItem<T>
          > className="flex-grow-1 d-flex flex-wrap align-items-center gap-1">
            {({ selectedItems: selectItems, state }) => {
              const selectedItems = selectItems.filter(
                (item): item is ComboBoxItem<T> => item != null,
              );
              if (selectedItems.length === 0) {
                return <span className="text-muted">{placeholder}</span>;
              }
              return (
                <TagGroup
                  aria-label="Selected items"
                  style={{ display: 'contents' }}
                  onRemove={
                    !disabled
                      ? (keys) => {
                          if (Array.isArray(state.value)) {
                            state.setValue(state.value.filter((k) => !keys.has(k)));
                          }
                        }
                      : undefined
                  }
                >
                  <TagList items={selectedItems} style={{ display: 'contents' }}>
                    {(item) => (
                      <Tag
                        id={item.id}
                        className={clsx(
                          tagClassName(item.data as T),
                          'd-inline-flex align-items-center gap-1',
                        )}
                        style={{ lineHeight: 1.2 }}
                        textValue={item.label}
                      >
                        {renderTagContent(item.data as T) ?? item.label}
                        {!disabled && (
                          <Button
                            aria-label={`Remove ${item.label}`}
                            className="border-0 bg-transparent p-0 lh-1"
                            slot="remove"
                            style={{ fontSize: '0.75em', marginRight: '-0.25em' }}
                          >
                            <i
                              className="bi bi-x-lg d-flex align-items-center justify-content-center"
                              aria-hidden="true"
                              style={{ width: '1.25em', height: '1.25em' }}
                            />
                          </Button>
                        )}
                      </Tag>
                    )}
                  </TagList>
                </TagGroup>
              );
            }}
          </SelectValue>
          <i
            aria-hidden="true"
            className={clsx(
              'bi ms-auto',
              isOpen ? 'bi-chevron-up' : 'bi-chevron-down',
              'text-muted',
            )}
          />
        </Button>

        {description && (
          <Text className="form-text text-muted" slot="description">
            {description}
          </Text>
        )}

        <FieldError className="invalid-feedback d-block">{errorMessage}</FieldError>

        <Popover
          className="dropdown-menu show py-0 overflow-auto"
          offset={2}
          placement="bottom start"
          style={{ maxHeight: '300px', width: 'var(--trigger-width)' }}
        >
          <Autocomplete filter={contains}>
            <SearchField aria-label="Search" className="p-2 border-bottom">
              <Input className="form-control form-control-sm" placeholder="Search..." />
            </SearchField>
            <ListBox
              className="list-unstyled m-0"
              items={items}
              renderEmptyState={() => (
                <div className="dropdown-item text-muted">No options found</div>
              )}
            >
              {(item: ComboBoxItem<T>) => (
                <ListBoxItem
                  id={item.id}
                  className={({ isFocused }) =>
                    clsx('dropdown-item d-flex align-items-center gap-2', isFocused && 'active')
                  }
                  style={{ cursor: 'pointer' }}
                  textValue={item.searchableText ?? item.label}
                >
                  {({ isSelected }) => (
                    <>
                      <input
                        checked={isSelected}
                        className="form-check-input m-0"
                        tabIndex={-1}
                        type="checkbox"
                        readOnly
                      />
                      <div className="flex-grow-1">{renderItem(item)}</div>
                    </>
                  )}
                </ListBoxItem>
              )}
            </ListBox>
          </Autocomplete>
        </Popover>
      </Select>
    </div>
  );
}
