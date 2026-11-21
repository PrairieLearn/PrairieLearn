import clsx from 'clsx';
import { type ReactNode, useRef, useState } from 'react';
import { useFilter } from 'react-aria';
import {
  ComboBox as AriaComboBox,
  type ComboBoxProps as AriaComboBoxProps,
  Button,
  Collection,
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
  | 'isInvalid'
  | 'value'
  | 'defaultValue'
  | 'onChange';

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
  /**
   * Accept a trimmed custom value. When set, a "create" option is shown at the
   * end of the list whenever the input doesn't exactly match an existing item.
   */
  onCreate?: (value: string) => void;
  /** Renders the contents of the "create" option. */
  renderCreateOption?: (value: string) => ReactNode;
  /**
   * An action pinned to the bottom of the list, such as a link to manage the
   * available items. It is a list option so it can be reached with the keyboard.
   */
  footerAction?: ComboBoxFooterAction;
}

export interface TagPickerProps<T = void> {
  /** Accept a trimmed custom value. */
  onCreate?: (value: string) => void;
  /** Label for the button that commits a custom value. */
  createButtonLabel?: string;
  /**
   * When provided along with `onCreate`, custom values are created from an
   * option at the end of the list instead of from a button next to the input.
   */
  renderCreateOption?: (value: string) => ReactNode;
  /** Control the pending input text separately from the selected tags. */
  inputValue?: string;
  onInputChange?: (value: string) => void;
  items: ComboBoxItem<T>[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Name for hidden form inputs. */
  name?: string;
  /** ID for the input element. */
  id?: string;
  /** ID of the element whose text labels this component. */
  'aria-labelledby'?: string;
  label?: string;
  description?: string;
  errorMessage?: string;
  renderItem?: (item: ComboBoxItem<T>) => ReactNode;
  /** Renders just the content inside the tag (text/icon). The badge styling is applied by tagClassName. */
  renderTagContent?: (data: T) => ReactNode;
  /** Returns the class name for the tag badge wrapper. Defaults to "badge bg-secondary". */
  tagClassName?: (data: T) => string;
  /**
   * An action pinned to the bottom of the list, such as a link to manage the
   * available items. It is a list option so it can be reached with the keyboard.
   */
  footerAction?: ComboBoxFooterAction;
}

export interface ComboBoxFooterAction {
  label: ReactNode;
  /** Plain-text label used for accessibility and typeahead. */
  textValue: string;
  /** Bootstrap icon name, e.g. `bi-pencil`. */
  icon?: string;
  onAction: () => void;
}

/** Sentinel key for the "create" option; it can never collide with a real item ID. */
const CREATE_OPTION_KEY = '__pl_create_option__';

function defaultRenderCreateOption(value: string) {
  return (
    <>
      Create <strong>{value}</strong>
    </>
  );
}

function shouldShowCreateOption<T>(items: ComboBoxItem<T>[], text: string, extra: string[] = []) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLocaleLowerCase();
  return (
    !items.some((item) => item.label.toLocaleLowerCase() === lower) &&
    !extra.some((v) => v.toLocaleLowerCase() === lower)
  );
}

function CreateOption({ value, children }: { value: string; children: ReactNode }) {
  return (
    <ListBoxItem
      id={CREATE_OPTION_KEY}
      className={({ isFocused }) =>
        clsx('dropdown-item d-flex align-items-center gap-2 border-top', isFocused && 'active')
      }
      style={{ cursor: 'pointer' }}
      textValue={`Create ${value}`}
    >
      <i className="bi bi-plus-lg" aria-hidden="true" />
      <span className="flex-grow-1 text-truncate">{children}</span>
    </ListBoxItem>
  );
}

const FOOTER_OPTION_KEY = '__pl_footer_option__';

function FooterOption({ action }: { action: ComboBoxFooterAction }) {
  return (
    <ListBoxItem
      id={FOOTER_OPTION_KEY}
      className={({ isFocused }) =>
        clsx(
          'dropdown-item d-flex align-items-center gap-2 border-top small',
          isFocused ? 'active' : 'text-body-secondary',
        )
      }
      // Stick to the bottom of the scrolling popover so it's always visible.
      style={({ isFocused }) => ({
        cursor: 'pointer',
        position: 'sticky',
        bottom: 0,
        backgroundColor: isFocused ? undefined : 'var(--bs-dropdown-bg)',
      })}
      textValue={action.textValue}
    >
      {action.icon && <i className={clsx('bi', action.icon)} aria-hidden="true" />}
      <span className="flex-grow-1 text-truncate">{action.label}</span>
    </ListBoxItem>
  );
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
  onCreate,
  renderCreateOption = defaultRenderCreateOption,
  footerAction,
  ...props
}: ComboBoxProps<T>) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const selectedLabel = items.find((item) => item.id === value)?.label;
  const [filterText, setFilterText] = useState(selectedLabel ?? '');
  // React Aria resets the input when the value changes to a key that isn't in
  // its collection yet, which happens for one render after creating an item.
  const justCreatedRef = useRef(false);
  // When the input just shows the current selection, show the full list.
  const isShowingSelection = selectedLabel !== undefined && filterText === selectedLabel;

  // Filter by searchableText while textValue (label) controls display
  const filteredItems = isShowingSelection
    ? items
    : items.filter((item) => contains(item.searchableText ?? item.label, filterText));
  const showCreate = !!onCreate && !isShowingSelection && shouldShowCreateOption(items, filterText);
  const createValue = filterText.trim();

  return (
    <div className="position-relative">
      {name && <input name={name} type="hidden" value={value ?? ''} />}

      <AriaComboBox
        {...props}
        value={value}
        isDisabled={disabled}
        isInvalid={!!errorMessage}
        menuTrigger="focus"
        defaultFilter={() => true}
        inputValue={filterText}
        allowsEmptyCollection
        onChange={(key) => {
          if (key === FOOTER_OPTION_KEY) {
            footerAction?.onAction();
            return;
          }
          if (key === CREATE_OPTION_KEY) {
            justCreatedRef.current = true;
            onCreate?.(createValue);
            setFilterText(createValue);
            return;
          }
          setFilterText(items.find((item) => item.id === key)?.label ?? '');
          onChange(key?.toString() ?? null);
        }}
        onInputChange={(inputValue) => {
          if (justCreatedRef.current) {
            justCreatedRef.current = false;
            if (inputValue === '') return;
          }
          setFilterText(inputValue);
          if (inputValue === '') {
            onChange(null);
          }
        }}
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
              shouldFlip={false}
              style={{ maxHeight: '300px', width: 'var(--trigger-width)' }}
            >
              <ListBox
                className="list-unstyled m-0"
                renderEmptyState={() => (
                  <div className="dropdown-item text-muted">No options found</div>
                )}
              >
                <Collection items={filteredItems}>
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
                </Collection>
                {showCreate && (
                  <CreateOption value={createValue}>{renderCreateOption(createValue)}</CreateOption>
                )}
                {footerAction && <FooterOption action={footerAction} />}
              </ListBox>
            </Popover>
          </>
        )}
      </AriaComboBox>
    </div>
  );
}

/**
 * Multi-selection combobox with removable tags.
 */
export function TagPicker<T = void>({
  items,
  onCreate,
  createButtonLabel = 'Add',
  renderCreateOption,
  inputValue,
  onInputChange,
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
  footerAction,
}: TagPickerProps<T>) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const inputRef = useRef<HTMLInputElement>(null);
  const [uncontrolledInputValue, setUncontrolledInputValue] = useState('');
  const filterText = inputValue ?? uncontrolledInputValue;

  function setFilterText(text: string) {
    setUncontrolledInputValue(text);
    onInputChange?.(text);
  }

  function createValue() {
    const nextValue = filterText.trim();
    if (nextValue && !value.includes(nextValue)) onCreate?.(nextValue);
    setFilterText('');
    inputRef.current?.focus();
  }

  const createAsOption = !!onCreate && !!renderCreateOption;
  const createAsButton = !!onCreate && !renderCreateOption;
  const filteredItems = items.filter(
    (item) =>
      (!createAsButton || !value.includes(item.id)) &&
      contains(item.searchableText ?? item.label, filterText),
  );
  const showCreateOption = createAsOption && shouldShowCreateOption(items, filterText, value);
  const pendingCreateValue = filterText.trim();
  const selectedItems = items.filter((item) => value.includes(item.id));

  return (
    <div className="position-relative">
      {name &&
        value.length > 0 &&
        value.map((v) => <input key={v} name={name} type="hidden" value={v} />)}

      {/* Keep the two collection contexts as siblings. Nesting TagGroup inside
          ComboBox mixes their React Aria collection state when the input filters. */}
      {selectedItems.length > 0 && (
        <TagGroup
          aria-label="Selected items"
          className="mb-2"
          onRemove={!disabled ? (keys) => onChange(value.filter((v) => !keys.has(v))) : undefined}
        >
          <TagList items={selectedItems} className="d-flex flex-wrap align-items-center gap-1">
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
                    className="border-0 bg-transparent p-0 lh-1"
                    slot="remove"
                    style={{ fontSize: '0.75em', marginRight: '-0.25em' }}
                  >
                    <i
                      className="bi bi-x d-flex align-items-center justify-content-center"
                      aria-hidden="true"
                      style={{ width: '1.25em', height: '1.25em' }}
                    />
                  </Button>
                )}
              </Tag>
            )}
          </TagList>
        </TagGroup>
      )}

      <AriaComboBox<ComboBoxItem<T>, 'multiple'>
        aria-labelledby={ariaLabelledby}
        isDisabled={disabled}
        isInvalid={!!errorMessage}
        inputValue={filterText}
        menuTrigger="focus"
        selectionMode="multiple"
        value={value}
        defaultFilter={() => true}
        allowsEmptyCollection={!createAsButton}
        allowsCustomValue={!!onCreate}
        onChange={(keys) => {
          const nextKeys = keys as string[];
          if (nextKeys.includes(FOOTER_OPTION_KEY)) {
            footerAction?.onAction();
            return;
          }
          if (nextKeys.includes(CREATE_OPTION_KEY)) {
            createValue();
            return;
          }
          setFilterText('');
          onChange(nextKeys);
        }}
        onInputChange={setFilterText}
      >
        {({ isOpen: isComboBoxOpen }) => (
          <>
            {label && <Label className="form-label">{label}</Label>}

            <Group
              className={clsx(
                'form-control d-flex align-items-center gap-1',
                disabled && 'bg-body-secondary',
                isComboBoxOpen && 'border-primary shadow-sm',
                errorMessage && 'is-invalid',
              )}
              style={{ minHeight: '38px', cursor: disabled ? 'not-allowed' : 'text' }}
            >
              <Input
                ref={inputRef}
                className="border-0 flex-grow-1 bg-transparent"
                id={id}
                placeholder={placeholder}
                style={{ outline: 'none', minWidth: 0 }}
                onKeyDown={(event) => {
                  if (!createAsButton || event.nativeEvent.isComposing) return;
                  if (event.key !== 'Enter' && event.key !== ',') return;
                  if (event.key === 'Enter' && isComboBoxOpen) return;
                  event.preventDefault();
                  event.stopPropagation();
                  createValue();
                }}
              />
              {createAsButton && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary flex-shrink-0"
                  disabled={disabled || !filterText.trim()}
                  onClick={createValue}
                >
                  {createButtonLabel}
                </button>
              )}
              {(!createAsButton || filteredItems.length > 0) && (
                <Button
                  aria-label="Show suggestions"
                  className="border-0 bg-transparent p-0 ms-auto"
                >
                  <i
                    aria-hidden="true"
                    className={clsx(
                      'bi',
                      isComboBoxOpen ? 'bi-chevron-up' : 'bi-chevron-down',
                      'text-muted',
                    )}
                  />
                </Button>
              )}
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
              shouldFlip={false}
              style={{ maxHeight: '300px', width: 'var(--trigger-width)' }}
            >
              <ListBox
                className="list-unstyled m-0"
                renderEmptyState={() => (
                  <div className="dropdown-item text-muted">No options found</div>
                )}
              >
                <Collection items={filteredItems}>
                  {(item: ComboBoxItem<T>) => (
                    <ListBoxItem
                      id={item.id}
                      className="dropdown-item d-flex align-items-center gap-2"
                      style={({ isFocused }) => ({
                        cursor: 'pointer',
                        backgroundColor: isFocused ? 'var(--bs-primary-bg-subtle)' : undefined,
                      })}
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
                </Collection>
                {showCreateOption && (
                  <CreateOption value={pendingCreateValue}>
                    {renderCreateOption(pendingCreateValue)}
                  </CreateOption>
                )}
                {footerAction && <FooterOption action={footerAction} />}
              </ListBox>
            </Popover>
          </>
        )}
      </AriaComboBox>
    </div>
  );
}
