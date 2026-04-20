import { Form } from 'react-bootstrap';

export function ToggleTitle({
  id,
  checked,
  onChange,
  label,
  showLabel = true,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  showLabel?: boolean;
}) {
  return (
    <Form.Check
      type="checkbox"
      id={id}
      label={
        showLabel ? <strong>{label}</strong> : <span className="visually-hidden">{label}</span>
      }
      checked={checked}
      onChange={({ currentTarget }) => onChange(currentTarget.checked)}
    />
  );
}
