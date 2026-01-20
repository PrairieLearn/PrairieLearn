import { type ColorJson, ColorJsonSchema } from '../schemas/infoCourse.js';

interface ColorPickerProps {
  value: string;
  onChange: (color: ColorJson) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="d-flex flex-wrap gap-2" role="radiogroup" aria-label="Select color">
      {ColorJsonSchema.options.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          className="btn btn-sm"
          style={{
            width: '32px',
            height: '32px',
            backgroundColor: `var(--color-${color})`,
            border: value === color ? '2px solid #0d6efd' : '1px solid #dee2e6',
          }}
          title={color}
          aria-label={`Color: ${color}`}
          aria-checked={value === color}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}
