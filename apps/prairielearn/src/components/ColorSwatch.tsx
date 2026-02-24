export function ColorSwatch({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      // `form-control-color` provides the correct sizing. We override the
      // cursor and padding to make it appear just as a plain, non-interactive
      // color swatch.
      className="form-control-color p-0"
      style={{ cursor: 'default' }}
      aria-hidden="true"
    >
      <rect
        width="32"
        height="32"
        style={{
          fill: `var(--color-${color})`,
          rx: 'var(--bs-border-radius)',
          ry: 'var(--bs-border-radius)',
        }}
      />
    </svg>
  );
}
