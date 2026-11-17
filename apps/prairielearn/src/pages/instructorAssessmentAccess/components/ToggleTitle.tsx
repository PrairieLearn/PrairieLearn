import { Form } from 'react-bootstrap';

export function ToggleTitle({
  id,
  checked,
  onChange,
  label,
  disabled,
  title,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Form.Check
      type="checkbox"
      id={id}
      label={<strong>{label}</strong>}
      checked={checked}
      disabled={disabled}
      title={title}
      onChange={({ currentTarget }) => onChange(currentTarget.checked)}
    />
  );
}
