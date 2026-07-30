import clsx from 'clsx';
import { Button, FieldError, ListBox, ListBoxItem, Popover, Select } from 'react-aria-components';

// This component isn't fully generic yet — it was built for the access control
// settings UI. The API may change as we identify more use cases.

export interface RichSelectItem<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

export interface RichSelectProps<T extends string = string> {
  items: RichSelectItem<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  errorMessage?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  minWidth?: number;
}

export function RichSelect<T extends string = string>({
  items,
  value,
  onChange,
  disabled = false,
  id,
  placeholder,
  errorMessage,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  minWidth,
}: RichSelectProps<T>) {
  const selectedLabel = items.find((item) => item.value === value)?.label;
  const listItems = items.map((item) => ({ ...item, id: item.value }));

  return (
    <Select
      selectedKey={value}
      isDisabled={disabled}
      isInvalid={!!errorMessage}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      onSelectionChange={(key) => onChange(key as T)}
    >
      {({ isOpen }) => (
        <>
          <Button
            className={clsx(
              'form-select text-start',
              isOpen && 'border-primary shadow-sm',
              errorMessage && 'is-invalid',
            )}
            id={id}
          >
            {selectedLabel ?? <span className="text-muted">{placeholder}</span>}
          </Button>
          <FieldError className="invalid-feedback d-block">{errorMessage}</FieldError>
          <Popover
            className="dropdown-menu show py-1 overflow-auto"
            offset={2}
            placement="bottom start"
            style={{
              maxHeight: '300px',
              width: minWidth ? `max(${minWidth}px, var(--trigger-width))` : 'var(--trigger-width)',
            }}
          >
            <ListBox className="list-unstyled m-0 px-1" items={listItems}>
              {(item) => (
                <ListBoxItem
                  id={item.id}
                  className="d-flex align-items-start gap-2 px-3 py-2 rounded"
                  style={({ isFocused }) => ({
                    cursor: 'pointer',
                    backgroundColor: isFocused ? 'var(--bs-primary-bg-subtle)' : undefined,
                  })}
                  textValue={item.label}
                >
                  {({ isSelected }) => (
                    <>
                      <input
                        checked={isSelected}
                        className="form-check-input m-0 mt-1"
                        tabIndex={-1}
                        type="radio"
                        readOnly
                      />
                      <div>
                        <div>{item.label}</div>
                        {item.description && (
                          <small className="text-muted">{item.description}</small>
                        )}
                      </div>
                    </>
                  )}
                </ListBoxItem>
              )}
            </ListBox>
          </Popover>
        </>
      )}
    </Select>
  );
}
