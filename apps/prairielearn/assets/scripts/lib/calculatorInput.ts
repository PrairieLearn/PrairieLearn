import type { MathfieldElement } from 'mathlive';

import {
  type RestrictedCalculatorMode,
  isSupportedCalculatorInput,
} from '../../../src/lib/client/calculatorRestrictions.js';

interface CalculatorAtom {
  type: string;
  value?: string;
  leftDelim?: string;
  rightDelim?: string;
  body: CalculatorAtom[];
  siblings: CalculatorAtom[];
  parent: CalculatorAtom;
  addChildrenAfter(children: CalculatorAtom[], after: CalculatorAtom): void;
  removeChild(child: CalculatorAtom): void;
  removeBranch(name: 'body'): CalculatorAtom[];
}

interface CalculatorMathLiveInternals {
  model: {
    at(position: number): CalculatorAtom;
    offsetOf(atom: CalculatorAtom): number;
    getSiblingsRange(position: number): [number, number];
    extractAtoms(range: [number, number]): CalculatorAtom[];
    deferNotifications(
      options: { content: boolean; selection: boolean; type: string },
      edit: () => void,
    ): void;
    contentWillChange(options: { inputType: string; data: string }): boolean;
    getState(): unknown;
    setState(state: unknown, options: { silenceNotifications: boolean }): void;
    getValue(): string;
    contentDidChange(options: unknown): void;
  };
  stopRecording(): void;
  startRecording(): void;
  snapshot(): void;
  onCompositionUpdate(value: string): void;
}

function getMathLiveInternals(input: MathfieldElement) {
  return (input as unknown as { _mathfield: CalculatorMathLiveInternals })._mathfield;
}

function hasOnlyClosingParenthesis(atom: CalculatorAtom) {
  return (
    atom.type === 'leftright' &&
    atom.rightDelim === ')' &&
    (atom.leftDelim === '.' || atom.leftDelim === '?')
  );
}

export function wrapInMultiplicationParentheses(input: MathfieldElement) {
  const field = getMathLiveInternals(input);
  const { model } = field;
  const position = input.position;
  if (!model.contentWillChange({ inputType: 'insertText', data: '(' })) return;
  const before = model.getState();
  // Move the existing atoms, as MathLive's smart fences do. Its #0 insertion
  // template round-trips them through LaTeX, committing any nested pending fences.
  model.deferNotifications({ content: true, selection: true, type: 'insertText' }, () => {
    const cursor = model.at(position);
    const parent = cursor.parent;
    const [, end] = model.getSiblingsRange(position);
    const contents = model.extractAtoms([position, end]);
    // A pasted outer pair may be two literal siblings rather than a MathLive fence.
    // Its closing delimiter is a boundary, but belongs to the opener left of the caret.
    let outerDepth = 0;
    for (const { type, value } of cursor.siblings) {
      if (type === 'mopen' && value === '(') outerDepth++;
      if (type === 'mclose' && value === ')') outerDepth = Math.max(0, outerDepth - 1);
    }
    let depth = 0;
    // Structured pairs are single siblings. Literal parentheses (e.g. pasted LaTeX)
    // can also occur as separate siblings; only an unmatched close ends this group.
    const closeIndex = contents.findIndex((atom) => {
      const { type, value } = atom;
      if (depth === 0 && hasOnlyClosingParenthesis(atom)) return true;
      if (type === 'mopen' && value === '(') depth++;
      if (type === 'mclose' && value === ')') {
        if (depth === 0) return true;
        depth--;
      }
      return false;
    });
    const close = contents[closeIndex];
    const halfFence = close && hasOnlyClosingParenthesis(close);
    const reuseClose = halfFence || (!!close && !outerDepth);
    const reuseParent = !close && !depth && !outerDepth && hasOnlyClosingParenthesis(parent);
    // Only the completed edit should appear in undo history.
    field.stopRecording();
    try {
      input.insert(`\\cdot\\left(\\right${reuseClose || reuseParent ? ')' : '?'}`, {
        selectionMode: 'after',
      });
    } finally {
      field.startRecording();
    }
    const group = model.at(input.position);
    const body = close ? contents.slice(0, closeIndex) : contents;
    // Deleting an opening delimiter leaves its body inside a one-sided fence.
    if (halfFence) body.push(...close.removeBranch('body'));
    group.body = body;
    if (close) parent.addChildrenAfter(contents.slice(closeIndex + (reuseClose ? 1 : 0)), group);
    if (reuseParent) {
      parent.parent.addChildrenAfter(parent.removeBranch('body'), parent);
      parent.parent.removeChild(parent);
    }
    // Leave the caret after the dot and opening fence, before the original contents.
    input.position = model.offsetOf(group.body[0]);
  });
  field.snapshot();
  const start = model.at(input.position);
  // Backspace immediately after an automatic pair should reverse the whole edit,
  // including the dot, without deleting an explicitly typed multiplication sign.
  input.addEventListener(
    'beforeinput',
    (event) => {
      if (
        (event.inputType || event.data) !== 'deleteContentBackward' ||
        !input.selectionIsCollapsed ||
        model.at(input.position) !== start
      )
        return;
      event.preventDefault();
      model.setState(before, { silenceNotifications: false });
      field.snapshot();
    },
    { once: true },
  );
}

/**
 * Per-instance MathLive 0.110 guard; do not patch the global parser or other answer fields.
 * Run assessmentTools.spec.ts when upgrading MathLive: rich paste relies on these private hooks.
 */
export function guardCalculatorInput(
  input: MathfieldElement,
  mode: RestrictedCalculatorMode,
  onReject: () => void,
) {
  const internal = getMathLiveInternals(input);
  const model = internal.model;
  const setValue = input.setValue.bind(input);
  input.setValue = (value, options) => {
    if (value === undefined) return;
    if (!isSupportedCalculatorInput(value, mode)) {
      onReject();
      return;
    }
    setValue(value, options);
  };
  if (!isSupportedCalculatorInput(input.value, mode)) setValue('');
  let acceptedState = model.getState();
  let restoring = false;
  // Rich MathLive clipboard data inserts atoms directly, bypassing the text checks.
  // Intercept the model notification so rejected atoms never reach the renderer.
  const contentDidChange = model.contentDidChange.bind(model);
  model.contentDidChange = (options) => {
    if (restoring) return;
    if (!isSupportedCalculatorInput(model.getValue(), mode)) {
      restoring = true;
      try {
        model.setState(acceptedState, { silenceNotifications: true });
      } finally {
        restoring = false;
      }
      onReject();
      return;
    }
    acceptedState = model.getState();
    contentDidChange(options);
  };
  // Snapshot before edits (including undo/redo), and reject plain-text paste early.
  input.addEventListener('beforeinput', (event) => {
    acceptedState = model.getState();
    const incoming =
      event.dataTransfer?.getData('application/x-latex') ||
      event.dataTransfer?.getData('text/plain') ||
      event.data;
    if (!incoming || incoming === event.inputType || /^(insert|delete|history)/.test(incoming)) {
      return;
    }
    if (!isSupportedCalculatorInput(incoming.replaceAll(/\$+/g, ''), mode)) {
      event.preventDefault();
      onReject();
    }
  });
  // IME composition has its own preview path before it commits to the model.
  const compositionUpdate = internal.onCompositionUpdate.bind(internal);
  internal.onCompositionUpdate = (value) => {
    if (!isSupportedCalculatorInput(value, mode)) {
      onReject();
      return;
    }
    compositionUpdate(value);
  };
}

export function configureCalculatorInput(input: MathfieldElement, mode: RestrictedCalculatorMode) {
  // Replace MathLive's default shortcut table, which includes calculus and other
  // operations not present on the restricted keypads.
  input.inlineShortcuts = {
    ans: '\\operatorname{ans}',
    ...(mode === 'scientific'
      ? {
          sin: '\\sin',
          cos: '\\cos',
          tan: '\\tan',
          sqrt: '\\sqrt{#0}',
          root: '\\sqrt[#?]{#0}',
          ln: '\\ln',
          log: '\\log_{#?}{#0}',
          pi: '\\pi',
          abs: '\\left|#0\\right|',
          '^': '#@^{(#?)}',
          '**': '#@^{(#?)}',
        }
      : {}),
  };
  // MathLive can also resolve shortcuts through this fallback hook; an empty
  // result prevents it from recognizing names outside our explicit table.
  input.onInlineShortcut = () => '';
  // These affordances can insert commands independently of our keypad.
  input.menuItems = [];
  // Keep navigation, selection, clipboard, and undo/redo. Insertion bindings
  // need their own allowlist because they bypass inline shortcuts.
  input.keybindings = input.keybindings.filter(({ command }) => {
    const selector = Array.isArray(command) ? command[0] : command;
    if (selector === 'insert' && Array.isArray(command)) {
      const latex = String(command[1]);
      return latex.startsWith('\\frac') || (mode === 'scientific' && latex.startsWith('\\sqrt'));
    }
    return /^(move|extend|delete|select|undo|redo|copy|cut|paste|scroll|commit|complete)/.test(
      selector,
    );
  });
  // Capture before MathLive handles the key: backslash/Escape enter raw LaTeX
  // mode. Basic also blocks letters and exponent/subscript entry while leaving
  // Ctrl/Cmd shortcuts available.
  input.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key === '\\' ||
        event.key === 'Escape' ||
        (mode === 'basic' && !event.ctrlKey && !event.metaKey && /^[a-zA-Z^_]$/.test(event.key))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true },
  );
}
