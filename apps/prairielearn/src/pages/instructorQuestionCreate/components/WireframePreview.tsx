/**
 * Wireframe previews for basic template question cards.
 *
 * These are simple, wire-framey representations of what each question type
 * looks like. They're purely decorative (aria-hidden) and use basic CSS
 * shapes rather than real form elements or semantic HTML.
 *
 * Each preview is keyed by full QID in PREVIEW_MAP so that every basic
 * template question gets its own unique visual. Reusing a preview component
 * for multiple QIDs is intentionally discouraged by this structure.
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

function RadioRow({
  width,
  selected = false,
  text,
}: {
  width?: string;
  selected?: boolean;
  text?: string;
}) {
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
      {text ? (
        <span
          style={{
            fontSize: 9,
            fontFamily: 'system-ui, sans-serif',
            color: selected ? COLORS.accentDark : COLORS.shapeDark,
            fontWeight: selected ? 600 : 400,
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {text}
        </span>
      ) : (
        <div
          style={{
            height: 7,
            width: width ?? '55%',
            backgroundColor: selected ? COLORS.accent : COLORS.shape,
            borderRadius: 3,
          }}
        />
      )}
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

// ---------------------------------------------------------------------------
// Multiple choice variants
// ---------------------------------------------------------------------------

function MultipleChoiceFixedPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <RadioRow width="60%" />
      <RadioRow width="45%" selected />
      <RadioRow width="52%" />
    </div>
  );
}

function DropdownPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <div style={{ height: 8, width: '25%', backgroundColor: COLORS.shape, borderRadius: 4 }} />
        <div
          style={{
            height: 22,
            width: '35%',
            minWidth: 50,
            border: `2px solid ${COLORS.accentDark}`,
            borderRadius: 4,
            backgroundColor: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: 6,
            paddingRight: 4,
          }}
        >
          <div
            style={{
              height: 6,
              width: '55%',
              backgroundColor: COLORS.accent,
              borderRadius: 3,
            }}
          />
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
            <path
              d="M1 1l3 3 3-3"
              stroke={COLORS.accentDark}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div style={{ height: 8, width: '20%', backgroundColor: COLORS.shape, borderRadius: 4 }} />
      </div>
    </div>
  );
}

function TrueFalsePreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <RadioRow text="True" selected />
      <RadioRow text="False" />
    </div>
  );
}

function AllOfTheAbovePreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <RadioRow width="55%" />
      <RadioRow width="42%" />
      <RadioRow text="All of the above" selected />
    </div>
  );
}

function NoneOfTheAbovePreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <RadioRow width="55%" />
      <RadioRow width="42%" />
      <RadioRow text="None of the above" selected />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Other question type previews
// ---------------------------------------------------------------------------

function CheckboxFixedPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <CheckboxRow width="45%" checked />
      <CheckboxRow width="55%" />
      <CheckboxRow width="38%" checked />
    </div>
  );
}

function IntegerInputPreview() {
  return <InputField width="40%" text="42" />;
}

function NumberInputPreview() {
  return <InputField width="45%" text="3.14" />;
}

function StringInputPreview() {
  return <InputField width="fit-content" text="Hello, world!" />;
}

function SymbolicInputPreview() {
  return <InputField width="55%" text="x² + 2x" />;
}

function MatchingRow({
  labelWidth,
  optionWidth,
  selected = false,
}: {
  labelWidth: string;
  optionWidth: string;
  selected?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          height: 20,
          width: optionWidth,
          minWidth: 40,
          border: `2px solid ${selected ? COLORS.accentDark : COLORS.shapeDark}`,
          borderRadius: 4,
          backgroundColor: 'white',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 4,
          paddingRight: 4,
          flexShrink: 0,
        }}
      >
        {selected && (
          <div
            style={{
              height: 6,
              width: '70%',
              backgroundColor: COLORS.accent,
              borderRadius: 3,
            }}
          />
        )}
      </div>
      <div
        style={{
          height: 7,
          width: labelWidth,
          backgroundColor: COLORS.shape,
          borderRadius: 3,
          marginLeft: 'auto',
        }}
      />
    </div>
  );
}

function MatchingPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <MatchingRow labelWidth="40%" optionWidth="30%" />
      <MatchingRow labelWidth="30%" optionWidth="35%" selected />
      <MatchingRow labelWidth="45%" optionWidth="25%" />
    </div>
  );
}

function DragBlock({ width, accent = false }: { width: string; accent?: boolean }) {
  return (
    <div
      style={{
        height: 20,
        width,
        border: `2px solid ${accent ? COLORS.accentDark : COLORS.shapeDark}`,
        borderRadius: 4,
        backgroundColor: 'white',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 5,
        gap: 6,
      }}
    >
      <svg width="8" height="10" viewBox="0 0 8 10" fill="none">
        <circle cx="2" cy="2" r="1.5" fill={COLORS.shapeDark} />
        <circle cx="6" cy="2" r="1.5" fill={COLORS.shapeDark} />
        <circle cx="2" cy="5" r="1.5" fill={COLORS.shapeDark} />
        <circle cx="6" cy="5" r="1.5" fill={COLORS.shapeDark} />
        <circle cx="2" cy="8" r="1.5" fill={COLORS.shapeDark} />
        <circle cx="6" cy="8" r="1.5" fill={COLORS.shapeDark} />
      </svg>
      <div
        style={{
          height: 6,
          width: '60%',
          backgroundColor: accent ? COLORS.accent : COLORS.shape,
          borderRadius: 3,
        }}
      />
    </div>
  );
}

function OrderBlocksPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <DragBlock width="75%" />
      <DragBlock width="60%" accent />
      <DragBlock width="80%" />
    </div>
  );
}

function RichTextEditorPreview() {
  return (
    <div
      style={{
        border: `2px solid ${COLORS.shapeDark}`,
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: '4px 6px',
          backgroundColor: COLORS.shape,
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
          height: 36,
          backgroundColor: 'white',
          padding: '6px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ height: 6, width: '85%', backgroundColor: COLORS.shape, borderRadius: 3 }} />
        <div style={{ height: 6, width: '60%', backgroundColor: COLORS.shape, borderRadius: 3 }} />
      </div>
    </div>
  );
}

function FileEditorPreview() {
  return (
    <div
      style={{
        border: `2px solid ${COLORS.shapeDark}`,
        borderRadius: 4,
        backgroundColor: 'white',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex' }}>
        {/* Line numbers */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '6px 5px',
            backgroundColor: COLORS.bg,
            borderRight: `1px solid ${COLORS.shape}`,
            alignItems: 'flex-end',
          }}
        >
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              style={{
                fontSize: 7,
                fontFamily: 'monospace',
                color: COLORS.shapeDark,
                lineHeight: 1,
              }}
            >
              {n}
            </div>
          ))}
        </div>
        {/* Code lines */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '6px 8px',
            flex: 1,
          }}
        >
          <div style={{ display: 'flex', gap: 4, height: 7, alignItems: 'center' }}>
            <div
              style={{
                height: 6,
                width: 18,
                backgroundColor: COLORS.accent,
                borderRadius: 2,
              }}
            />
            <div
              style={{ height: 6, width: '50%', backgroundColor: COLORS.shape, borderRadius: 2 }}
            />
          </div>
          <div
            style={{
              height: 7,
              display: 'flex',
              alignItems: 'center',
              marginLeft: 12,
            }}
          >
            <div
              style={{
                height: 6,
                width: '70%',
                backgroundColor: COLORS.shape,
                borderRadius: 2,
              }}
            />
          </div>
          <div
            style={{
              height: 7,
              display: 'flex',
              alignItems: 'center',
              marginLeft: 12,
            }}
          >
            <div
              style={{
                height: 6,
                width: '45%',
                backgroundColor: COLORS.shape,
                borderRadius: 2,
              }}
            />
          </div>
          <div style={{ height: 7 }} />
        </div>
      </div>
    </div>
  );
}

function FileUploadPreview() {
  return (
    <div
      style={{
        height: 52,
        border: `2px dashed ${COLORS.shapeDark}`,
        borderRadius: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 2v8M5 5l3-3 3 3"
          stroke={COLORS.shapeDark}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3"
          stroke={COLORS.shapeDark}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div style={{ height: 6, width: 50, backgroundColor: COLORS.shape, borderRadius: 3 }} />
    </div>
  );
}

function ImageCapturePreview() {
  return (
    <div
      style={{
        height: 52,
        border: `2px dashed ${COLORS.shapeDark}`,
        borderRadius: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      <svg width="18" height="16" viewBox="0 0 18 16" fill="none">
        <rect
          x="1"
          y="3"
          width="16"
          height="12"
          rx="2"
          stroke={COLORS.shapeDark}
          strokeWidth="1.5"
        />
        <circle cx="9" cy="9" r="3" stroke={COLORS.shapeDark} strokeWidth="1.5" />
        <path
          d="M6 3l1-2h4l1 2"
          stroke={COLORS.shapeDark}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div style={{ height: 6, width: 60, backgroundColor: COLORS.shape, borderRadius: 3 }} />
    </div>
  );
}

/**
 * Keyed by full QID so each basic template question gets its own unique
 * preview, label, and description. Adding a new basic template question
 * requires adding a corresponding entry here.
 */
const BASIC_QUESTION_MAP: Partial<
  Record<string, { label: string; description: string; Preview: () => React.ReactNode }>
> = {
  'template/multiple-choice/fixed': {
    label: 'Multiple choice',
    description: 'Select a single correct answer',
    Preview: MultipleChoiceFixedPreview,
  },
  'template/multiple-choice/all-of-the-above': {
    label: 'All of the above',
    description: 'Include an "all of the above" option',
    Preview: AllOfTheAbovePreview,
  },
  'template/multiple-choice/none-of-the-above': {
    label: 'None of the above',
    description: 'Include a "none of the above" option',
    Preview: NoneOfTheAbovePreview,
  },
  'template/multiple-choice/true-false': {
    label: 'True/false',
    description: 'Choose between true and false',
    Preview: TrueFalsePreview,
  },
  'template/multiple-choice/dropdown': {
    label: 'Dropdown',
    description: 'Select an answer from a dropdown menu',
    Preview: DropdownPreview,
  },
  'template/checkbox/fixed': {
    label: 'Checkbox',
    description: 'Select multiple correct answers',
    Preview: CheckboxFixedPreview,
  },
  'template/integer-input/fixed': {
    label: 'Integer input',
    description: 'Enter a whole number',
    Preview: IntegerInputPreview,
  },
  'template/number-input/fixed': {
    label: 'Number input',
    description: 'Enter a decimal number or fraction',
    Preview: NumberInputPreview,
  },
  'template/string-input/fixed': {
    label: 'String input',
    description: 'Enter a text response',
    Preview: StringInputPreview,
  },
  'template/symbolic-input/fixed': {
    label: 'Symbolic input',
    description: 'Enter a mathematical expression',
    Preview: SymbolicInputPreview,
  },
  'template/matching/fixed': {
    label: 'Matching',
    description: 'Match items to their correct pairs',
    Preview: MatchingPreview,
  },
  'template/order-blocks/fixed': {
    label: 'Order blocks',
    description: 'Arrange blocks in the correct order',
    Preview: OrderBlocksPreview,
  },
  'template/rich-text-editor/basic': {
    label: 'Rich text editor',
    description: 'Write a formatted text response',
    Preview: RichTextEditorPreview,
  },
  'template/file-editor/fixed': {
    label: 'Code editor',
    description: 'Edit code in a built-in editor',
    Preview: FileEditorPreview,
  },
  'template/file-upload/fixed': {
    label: 'File upload',
    description: 'Upload a file as an answer',
    Preview: FileUploadPreview,
  },
  'template/image-capture/static': {
    label: 'Image capture',
    description: 'Take or upload a photo',
    Preview: ImageCapturePreview,
  },
};

/**
 * Returns true if the given QID has a dedicated wireframe preview.
 */
export function hasWireframePreview(qid: string): boolean {
  return qid in BASIC_QUESTION_MAP;
}

export function getCardInfo(qid: string): { label: string; description: string } | null {
  const entry = BASIC_QUESTION_MAP[qid];
  if (!entry) return null;
  return { label: entry.label, description: entry.description };
}

function FallbackPreview() {
  return <TextLines count={3} widths={['80%', '65%', '50%']} />;
}

export function WireframePreview({ qid }: { qid: string }) {
  const PreviewComponent = BASIC_QUESTION_MAP[qid]?.Preview ?? FallbackPreview;

  return (
    <div
      aria-hidden="true"
      style={{
        aspectRatio: '5 / 2',
        overflow: 'hidden',
        backgroundColor: COLORS.bg,
        padding: '1rem',
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

WireframePreview.displayName = 'WireframePreview';
