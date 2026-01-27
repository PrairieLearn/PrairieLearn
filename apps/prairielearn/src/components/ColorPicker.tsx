import clsx from 'clsx';

import { type ColorJson, ColorJsonSchema } from '../schemas/infoCourse.js';

export function ColorPicker({
  value,
  onChange,
  invalid,
  id,
}: {
  value: string;
  onChange: (color: ColorJson) => void;
  invalid?: boolean;
  id?: string;
}) {
  return (
    <div className="d-flex gap-2 align-items-center">
      <select
        className={clsx('form-select', invalid && 'is-invalid')}
        id={id}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value as ColorJson)}
      >
        {ColorJsonSchema.options.map((color) => (
          <option key={color} value={color}>
            {color}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 32 32"
        className="form-control-color p-0"
        style={{ cursor: 'default' }}
        aria-hidden="true"
      >
        <rect
          width="32"
          height="32"
          rx="var(--bs-border-radius)"
          ry="var(--bs-border-radius)"
          style={{
            fill: `var(--color-${value})`,
          }}
        />
      </svg>
    </div>
  );
}
