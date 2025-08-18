 *
 * @param name Name of the element to look up the tag
 */
window.PLSymbolicInput = async function (name) {
  const mf = document.getElementById('symbolic-input-' + name);

  // Always keep basic right-click items and append to other menu items
  endMenuItems = mf.menuItems.filter(
    (item) =>
      item.id &&
      (item.id == 'cut' || item.id == 'copy' || item.id == 'paste' || item.id == 'select-all'),
  );

  mf.menuItems = [
    {
      id: 'fraction',
      label: () => `<span class='ML__insert-template'><sup>x</sup>&frasl;<sub>y</sub></span>`,
      onMenuSelect: () => mf.insert('\\frac{#@}{#?}'),
    },
    {
      id: 'power',
      label: () => `<span class='ML__insert-template'>x<sup>y</sup></span>`,
      onMenuSelect: () => mf.insert('${#@^{#?}}$'),
    },
    {
      id: 'sqrt',
      label: '√',
      onMenuSelect: () => mf.insert('\\sqrt{#@}'),
    },
    {
      id: 'pi',
      label: 'π',
      onMenuSelect: () => mf.insert('\\pi'),
    },
    {
      id: 'infinity',
      label: '∞',
      onMenuSelect: () => mf.insert('\\infty'),
    },
    { type: 'divider' },
    ...endMenuItems,
  ];

  mathVirtualKeyboard.layouts = [
    {
      label: 'math',
      rows: [
        [
          { class: 'small', latex: '{#@}^{#?}', width: 1 },
          { class: 'small', latex: '{#@}^{2}', width: 1 },
          {
            class: 'small',
            latex: '\\sin',
            insert: '\\sin({#0})',
            width: 1,
            variants: [
              { class: 'small', latex: '\\csc', insert: '\\csc({#0})' },
              { class: 'small', latex: '\\arcsin', insert: '\\arcsin({#0})' },
              { class: 'small', latex: '\\mathrm{asinh}', insert: '\\operatorname{asinh}({#0})' },
            ],
          },
          '[separator]',
          '7',
          '8',
          '9',
          '+',
          '[separator]',
          'e',
          '\\infty',
          '\\pi',
        ],
        [
          { class: 'small', latex: '\\frac{#@}{#0}', width: 1.3 },
          { class: 'small', latex: '\\sqrt', insert: '\\sqrt{(#0)}', width: 1 },
          {
            class: 'small',
            latex: '\\cos',
            insert: '\\cos({#0})',
            width: 1,
            variants: [
              { class: 'small', latex: '\\sec', insert: '\\sec({#0})' },
              { class: 'small', latex: '\\arccos', insert: '\\arccos({#0})' },
              { class: 'small', latex: '\\mathrm{acosh}', insert: '\\operatorname{acosh}({#0})' },
            ],
          },
          '[separator]',
          '4',
          '5',
          '6',
          '-',
          '[separator]',
          { latex: 'x' },
          { latex: 'y' },
          '=',
        ],
        [
          { class: 'small', latex: '!', width: 1 },
          {
            class: 'small',
            latex: '\\ln',
            insert: '\\ln({#0})',
            variants: [{ class: 'small', latex: '\\log', insert: '\\log({#0})' }],
          },
          {
            class: 'small',
            latex: '\\tan',
            insert: '\\tan({#0})',
            width: 1,
            variants: [
              { class: 'small', latex: '\\cot', insert: '\\cot({#0})' },
              { class: 'small', latex: '\\arctan', insert: '\\arctan({#0})' },
              { class: 'small', latex: '\\mathrm{atanh}', insert: '\\operatorname{atanh}({#0})' },
              {
                class: 'small',
                latex: '\\mathrm{arctan2}',
                insert: '\\operatorname{arctan2}({#0})',
              },
            ],
          },
          '[separator]',
          '1',
          '2',
          '3',
          { latex: '\\times', insert: '\\cdot' },
          '[separator]',
          '(',
          ')',
          {
            class: 'small',
            latex: '\\mathrm{sign}',
            insert: '\\operatorname{sign}({#0})',
          },
        ],
        [
          { class: 'small', latex: '\\min', insert: '\\min({#0})' },
          { class: 'small', latex: '\\max', insert: '\\max({#0})' },
          { class: 'small', latex: '\\mathrm{abs}', insert: '\\operatorname{abs}({#0})' },
          '[separator]',
          { label: '0', width: 2 },
          '.',
          '/',
          '[separator]',
          { label: '[left]' },
          { label: '[right]' },
          { label: '[backspace]', width: 1 },
        ],
      ],
    },
    {
      label: 'abc',
      rows: [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        [
          { label: 'q' },
          { label: 'w' },
          { label: 'e' },
          { label: 'r' },
          { label: 't' },
          { label: 'y' },
          { label: 'u' },
          { label: 'i' },
          { label: 'o' },
          { label: 'p' },
        ],
        [
          { label: 'a' },
          { label: 's' },
          { label: 'd' },
          { label: 'f' },
          { label: 'g' },
          { label: 'h' },
          { label: 'j' },
          { label: 'k' },
          { label: 'l' },
        ],
        [
          { label: 'z' },
          { label: 'x' },
          { label: 'c' },
          { label: 'v' },
          { label: 'b' },
          { label: 'n' },
          { label: 'm' },
          '[backspace]',
        ],
        ['-', '+', '=', { latex: '\\times' }, '/', '.', ',', '[left]', '[right]', '[return]'],
      ],
    },
  ];

  setUpSymbolicInputMacros(mf);

  // Additional shortcuts for instant replacement inside the pl-symbolic-input box
  mf.inlineShortcuts = {
    '**': {
      value: '{#@}^{#?}',
    },
    '*': {
      value: '\\cdot',
    },
    sqrt: {
      value: '\\sqrt{#0}',
    },
    '||': {
      value: '\\abs',
    },
    '|': {
      value: '\\abs',
    },
    pi: {
      value: '\\pi',
    },
    infty: {
      value: '\\infty',
    },
    e: {
      value: 'e',
    },
  };
  mf.popoverPolicy = 'off';

  const placeholderText = mf.dataset.placeholderText;
  mf.setAttribute('placeholder', `\\text{${placeholderText}}`);

  // Set up sync between input box and hidden submission data inputs
  updateSubmissionData = function () {
    $('#symbolic-input-sub-' + name).val(mf.getValue('plain-text'));
    $('#symbolic-input-latex-' + name).val(mf.getValue('latex'));
  };

  updateSubmissionData();
  mf.addEventListener('input', updateSubmissionData);

  // Disable access to manual \ macro mode
  mf.addEventListener(
    'keydown',
    (ev) => {
      if (ev.key === '\\') {
        ev.preventDefault();
        mf.executeCommand(['insert', '\\backslash']);
      } else if (ev.key === 'Escape') ev.preventDefault();
    },
    { capture: true },
  );

  // Workaround for glitchy size-based menu button show/hide behavior
  if (!mf.getAttribute('read-only')) {
    const resizeObserver = new ResizeObserver((e) => {
      if (mf.offsetWidth < 160) {
        mf.setAttribute('hide-menu', 'true');
      } else {
        mf.removeAttribute('hide-menu');
      }
    });
    resizeObserver.observe(mf);
  }
};

/**
 * Initialize the <math-field> element used to represent parse errors.
 * This element is read-only and only needs to be updated with the set of allowed function names for display
 *
 * @param uuid UUID of the element to look up the tag (used instead of name since there might be multiple submissions per element)
 */
window.PLSymbolicInputParseError = async function (uuid) {
  const mf = document.getElementById(`symbolic-input-parse-error-${uuid}`);
  if (!mf) {
    return;
  }
  setUpSymbolicInputMacros(mf);
};

/**
 * Initialize the <math-field> element used to represent raw parsed submissions.
 * This element is read-only and only needs to be updated with the set of allowed function names for display
 *
 * @param uuid UUID of the element to look up the tag (used instead of name since there might be multiple submissions per element)
 */
window.PLSymbolicInputPopover = async function (uuid) {
  // Wait for popover to appear
  $(document).on('shown.bs.popover', `#pl-symbolic-input-${uuid}-label`, function () {
    const mf = document.getElementById(`symbolic-input-popover-${uuid}`);
    if (!mf) {
      return;
    }
    setUpSymbolicInputMacros(mf);
  });
};

/**
 * Initialize list of allowed function names for a <math-field> element. The list is determined by
 * the allow-trig and custom-functions attributes and each allowed function is added as a "macro" to
 * automatically replace individual letters with well-formatted, atomic function name blocks.
 *
 * @param mf The <math-field> element to initialize
 */
function setUpSymbolicInputMacros(mf) {
  const additionalFunctions = mf.getAttribute('custom-functions')
    ? JSON.parse(mf.getAttribute('custom-functions').replaceAll("'", '"'))
    : [];

  const disabledFunctions =
    mf.getAttribute('allow-trig') === 'True'
      ? new Set([])
      : new Set([
          'sin',
          'cos',
          'tan',
          'asinh',
          'atanh',
          'acosh',
          'arctan',
          'arcsin',
          'arccos',
          'sec',
          'cot',
          'csc',
          'asin',
          'atan',
          'acos',
          'log',
        ]);

  const customFunctions = new Set(
    additionalFunctions.concat([
      'asinh',
      'atanh',
      'acosh',
      'sgn',
      'sign',
      'atan2',
      'arctan2',
      'asin',
      'atan',
      'acos',
      'abs',
      'max',
      'min',
      'exp',
      'factorial',
      'ln',
      'log',
      'sin',
      'cos',
      'tan',
      'arctan',
      'arcsin',
      'arccos',
      'sec',
      'cot',
      'csc',
    ]),
  );

  // Remove disabled functions
  for (let fn of disabledFunctions) customFunctions.delete(fn);

  const macros = {};
  for (const fun of customFunctions) {
    macros[fun] = `\\operatorname{${fun}}`;
  }
  mf.macros = macros;

  mf.onInlineShortcut = (mf, s) => {
    if (customFunctions.has(s)) return `\\${s}`;
    return '';
  };
}
