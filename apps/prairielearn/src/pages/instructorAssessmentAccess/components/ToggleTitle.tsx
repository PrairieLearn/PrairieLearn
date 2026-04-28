import { Form } from 'react-bootstrap';

export function ToggleTitle({
  id,
  checked,
  onChange,
  label,
  showLabel = true,
  disabled,
  title,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  showLabel?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Form.Check
      type="checkbox"
      id={id}
      label={
        showLabel ? <strong>{label}</strong> : <span className="visually-hidden">{label}</span>
      }
      checked={checked}
      disabled={disabled}
      title={title}
      onChange={({ currentTarget }) => onChange(currentTarget.checked)}
    />
  );
}
