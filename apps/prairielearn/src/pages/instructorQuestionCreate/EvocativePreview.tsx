/**
 * Evocative wireframe previews for basic template question cards.
 *
 * These are simple, wire-framey representations of what each question type
 * looks like. They're purely decorative (aria-hidden) and use basic CSS
 * shapes rather than real form elements or semantic HTML.
 */

const COLORS = {
  bg: '#f8f9fa',
  shape: '#dee2e6',
  shapeDark: '#ced4da',
  accent: '#8aadc8',
  accentDark: '#6b93b3',
};

function TextLines({ count = 2, widths }: { count?: number; widths?: string[] }) {
  const defaultWidths = ['80%', '60%', '45%'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            height: 8,
            width: widths?.[i] ?? defaultWidths[i % defaultWidths.length],
            backgroundColor: COLORS.shape,
            borderRadius: 4,
          }}
        />
      ))}
    </div>
  );
}

function RadioRow({ width = '55%', selected = false }: { width?: string; selected?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          border: `2px solid ${selected ? COLORS.accentDark : COLORS.shapeDark}`,
          backgroundColor: selected ? COLORS.accent : undefined,
          boxShadow: selected ? 'inset 0 0 0 2px white' : undefined,
          flexShrink: 0,
        }}
      />
      <div
        style={{
          height: 7,
          width,
          backgroundColor: selected ? COLORS.accent : COLORS.shape,
          borderRadius: 3,
        }}
      />
    </div>
  );
}

function CheckboxRow({ width = '55%', checked = false }: { width?: string; checked?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: 2,
          border: `2px solid ${checked ? COLORS.accentDark : COLORS.shapeDark}`,
          backgroundColor: checked ? COLORS.accent : undefined,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path
              d="M1.5 4L3.5 6L6.5 2"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <div
        style={{
          height: 7,
          width,
          backgroundColor: checked ? COLORS.accent : COLORS.shape,
          borderRadius: 3,
        }}
      />
    </div>
  );
}

function InputField({ width = '100%', text }: { width?: string; text?: string }) {
  return (
    <div
      style={{
        height: 24,
        width,
        border: `2px solid ${COLORS.shapeDark}`,
        borderRadius: 4,
        backgroundColor: 'white',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 6,
        paddingRight: 6,
      }}
    >
      {text && (
        <span
          style={{
            fontSize: 10,
            fontFamily: 'monospace',
            color: COLORS.accentDark,
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {text}
        </span>
      )}
    </div>
  );
}

function LabeledInput({
  labelWidth = '20%',
  inputWidth = '50%',
  text,
}: {
  labelWidth?: string;
  inputWidth?: string;
  text?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          height: 8,
          width: labelWidth,
          backgroundColor: COLORS.shapeDark,
          borderRadius: 4,
          flexShrink: 0,
        }}
      />
      <InputField width={inputWidth} text={text} />
    </div>
  );
}

function MultipleChoicePreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <TextLines count={2} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        <RadioRow width="60%" />
        <RadioRow width="45%" selected />
        <RadioRow width="52%" />
        <RadioRow width="38%" />
      </div>
    </div>
  );
}

function CheckboxPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <TextLines count={2} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        <CheckboxRow width="45%" checked />
        <CheckboxRow width="55%" />
        <CheckboxRow width="38%" checked />
        <CheckboxRow width="50%" checked />
      </div>
    </div>
  );
}

function IntegerInputPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <TextLines count={2} />
      <LabeledInput labelWidth="15%" inputWidth="40%" text="42" />
    </div>
  );
}

function NumberInputPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <TextLines count={2} />
      <LabeledInput labelWidth="15%" inputWidth="45%" text="3.14" />
    </div>
  );
}

function StringInputPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <TextLines count={2} />
      <InputField width="70%" text="Hello, world!" />
    </div>
  );
}

function SymbolicInputPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <TextLines count={2} widths={['75%', '50%']} />
      <LabeledInput labelWidth="20%" inputWidth="55%" text="x² + 2x" />
    </div>
  );
}

function RichTextEditorPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <TextLines count={2} />
      <div>
        {/* Toolbar */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: '4px 6px',
            backgroundColor: COLORS.shape,
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
            borderBottom: `1px solid ${COLORS.shapeDark}`,
          }}
        >
          <div
            style={{ width: 14, height: 10, backgroundColor: COLORS.shapeDark, borderRadius: 2 }}
          />
          <div
            style={{ width: 14, height: 10, backgroundColor: COLORS.shapeDark, borderRadius: 2 }}
          />
          <div
            style={{ width: 14, height: 10, backgroundColor: COLORS.shapeDark, borderRadius: 2 }}
          />
          <div
            style={{ width: 20, height: 10, backgroundColor: COLORS.shapeDark, borderRadius: 2 }}
          />
          <div
            style={{ width: 14, height: 10, backgroundColor: COLORS.shapeDark, borderRadius: 2 }}
          />
        </div>
        {/* Editor area */}
        <div
          style={{
            height: 48,
            border: `2px solid ${COLORS.shapeDark}`,
            borderTop: 'none',
            borderBottomLeftRadius: 4,
            borderBottomRightRadius: 4,
            backgroundColor: 'white',
            padding: '6px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div
            style={{ height: 6, width: '85%', backgroundColor: COLORS.shape, borderRadius: 3 }}
          />
          <div
            style={{ height: 6, width: '60%', backgroundColor: COLORS.shape, borderRadius: 3 }}
          />
          <div
            style={{ height: 6, width: '40%', backgroundColor: COLORS.shape, borderRadius: 3 }}
          />
        </div>
      </div>
    </div>
  );
}

function FallbackPreview() {
  return <TextLines count={3} widths={['80%', '65%', '50%']} />;
}

const PREVIEW_MAP: Record<string, () => React.JSX.Element> = {
  'multiple-choice': MultipleChoicePreview,
  checkbox: CheckboxPreview,
  'integer-input': IntegerInputPreview,
  'number-input': NumberInputPreview,
  'string-input': StringInputPreview,
  'symbolic-input': SymbolicInputPreview,
  'rich-text-editor': RichTextEditorPreview,
};

/**
 * Extracts the element type from a template question QID.
 * e.g. "template/multiple-choice/fixed" → "multiple-choice"
 */
function getElementType(qid: string): string {
  const parts = qid.split('/');
  return parts[1] ?? '';
}

export function EvocativePreview({ qid }: { qid: string }) {
  const elementType = getElementType(qid);
  const PreviewComponent = PREVIEW_MAP[elementType] ?? FallbackPreview;

  return (
    <div
      aria-hidden="true"
      style={{
        aspectRatio: '3 / 2',
        overflow: 'hidden',
        backgroundColor: COLORS.bg,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'flex-start',
        userSelect: 'none',
      }}
    >
      <div style={{ width: '100%' }}>
        <PreviewComponent />
      </div>
    </div>
  );
}

EvocativePreview.displayName = 'EvocativePreview';
