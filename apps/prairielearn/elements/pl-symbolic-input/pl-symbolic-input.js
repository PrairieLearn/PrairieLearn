// @ts-check

/// <reference types="jquery" />

(() => {
  const greekLetters = new Set([
    'Gamma',
    'Delta',
    'Theta',
    'Lambda',
    'Xi',
    'Pi',
    'Sigma',
    'Upsilon',
    'Phi',
    'Psi',
    'Omega',
    'alpha',
    'beta',
    'gamma',
    'delta',
    'epsilon',
    'zeta',
    'eta',
    'theta',
    'iota',
    'kappa',
    'lambda',
    'mu',
    'nu',
    'xi',
    'omicron',
    'pi',
    'rho',
    'sigma',
    'tau',
    'upsilon',
    'phi',
    'chi',
    'psi',
    'omega',
  ]);

  // Some uppercase unicode characters don't have matching built-in Latex macros. We need a lookup
  // of the correct unicode equivalent to set up the inline replacement as for the other letters.
  const greekLettersToUnicode = new Map(
    Object.entries({
      Alpha: '391',
      Beta: '392',
      Epsilon: '395',
      Zeta: '396',
      Eta: '397',
      Iota: '399',
      Kappa: '39A',
      Mu: '39C',
      Nu: '39D',
      Omicron: '39F',
      Rho: '3A1',
      Tau: '3A4',
      Chi: '3A7',
    }),
  );

  const trigFunctions = new Set([
    'acos',
    'acosh',
    'arccos',
    'arcsin',
    'arctan',
    'arctan2',
    'asin',
    'asinh',
    'atan',
    'atan2',
    'atanh',
    'cos',
    'cosh',
    'cot',
    'csc',
    'exp',
    'sec',
    'sin',
    'sinh',
    'tan',
    'tanh',
  ]);

  const defaultFunctions = new Set([
    'Abs',
    'abs',
    'exp',
    'factorial',
    'ln',
    'log',
    'Max',
    'max',
    'Min',
    'min',
    'sgn',
    'sign',
  ]);

  const mathJSONUnaryFunctionHeads = new Set([
    'Abs',
    'AiryAi',
    'AiryBi',
    'Arccos',
    'Arccot',
    'Arccsc',
    'Arcosh',
    'Arcoth',
    'Arcsch',
    'Arcsec',
    'Arcsin',
    'Arctan',
    'Arsech',
    'Arsinh',
    'Artanh',
    'Ceil',
    'Cos',
    'Cosh',
    'Cot',
    'Coth',
    'Csc',
    'Csch',
    'Conjugate',
    'Denominator',
    'Digamma',
    'Erf',
    'Erfc',
    'ErfInv',
    'Exp',
    'Exp2',
    'Factorial',
    'Factorial2',
    'Fibonacci',
    'Floor',
    'FresnelC',
    'FresnelS',
    'Gamma',
    'GammaLn',
    'Heaviside',
    'Imaginary',
    'Lb',
    'LambertW',
    'Lg',
    'Log10',
    'Log2',
    'Negate',
    'Numerator',
    'Real',
    'Sec',
    'Sech',
    'Sign',
    'Sin',
    'Sinc',
    'Sinh',
    'Sqrt',
    'Square',
    'Subfactorial',
    'Tan',
    'Tanh',
    'Zeta',
  ]);

  const mathJSONBinaryFunctionHeads = new Set([
    'BesselI',
    'BesselJ',
    'BesselK',
    'BesselY',
    'Beta',
    'Binomial',
    'Mod',
    'PolyGamma',
  ]);

  const mathJSONNumericVariadicFunctionHeads = new Set(['GCD', 'LCM', 'Max', 'Min']);
  const mathJSONLogicalVariadicFunctionHeads = new Set(['And', 'Or', 'Xor']);
  const mathJSONVariadicFunctionHeads = new Set([
    ...mathJSONNumericVariadicFunctionHeads,
    ...mathJSONLogicalVariadicFunctionHeads,
  ]);
  const mathJSONRelationHeads = new Set([
    'Equal',
    'Greater',
    'GreaterEqual',
    'Less',
    'LessEqual',
    'NotEqual',
  ]);
  const mathJSONSetHeads = new Set(['Set', 'Interval', 'Union', 'Intersection']);
  const mathJSONTupleHeads = new Set(['List', 'Tuple', 'Single', 'Pair', 'Triple']);

  /**
   * The English and Greek alphabet virtual keyboards are always the same for all elements,
   * so we initialize them once and only swap out the math symbol keyboard per-element.
   * @type {import('mathlive').VirtualKeyboardLayout[]}
   */
  const defaultKeyboardLayouts = [
    {
      label: 'abc',
      rows: [
        [
          { label: 'q', class: 'tex hide-shift', shift: 'Q' },
          { label: 'w', class: 'tex hide-shift', shift: 'W' },
          { label: 'e', class: 'tex hide-shift', shift: 'E' },
          { label: 'r', class: 'tex hide-shift', shift: 'R' },
          { label: 't', class: 'tex hide-shift', shift: 'T' },
          { label: 'y', class: 'tex hide-shift', shift: 'Y' },
          { label: 'u', class: 'tex hide-shift', shift: 'U' },
          { label: 'i', class: 'tex hide-shift', shift: 'I' },
          { label: 'o', class: 'tex hide-shift', shift: 'O' },
          { label: 'p', class: 'tex hide-shift', shift: 'P' },
        ],
        [
          { label: 'a', class: 'tex hide-shift', shift: 'A' },
          { label: 's', class: 'tex hide-shift', shift: 'S' },
          { label: 'd', class: 'tex hide-shift', shift: 'D' },
          { label: 'f', class: 'tex hide-shift', shift: 'F' },
          { label: 'g', class: 'tex hide-shift', shift: 'G' },
          { label: 'h', class: 'tex hide-shift', shift: 'H' },
          { label: 'j', class: 'tex hide-shift', shift: 'J' },
          { label: 'k', class: 'tex hide-shift', shift: 'K' },
          { label: 'l', class: 'tex hide-shift', shift: 'L' },
          { label: '[backspace]', shift: undefined, class: 'small hide-shift' },
        ],
        [
          { label: '[shift]', width: 1 },
          { label: 'z', class: 'tex hide-shift', shift: 'Z' },
          { label: 'x', class: 'tex hide-shift', shift: 'X' },
          { label: 'c', class: 'tex hide-shift', shift: 'C' },
          { label: 'v', class: 'tex hide-shift', shift: 'V' },
          { label: 'b', class: 'tex hide-shift', shift: 'B' },
          { label: 'n', class: 'tex hide-shift', shift: 'N' },
          { label: 'm', class: 'tex hide-shift', shift: 'M' },
          { label: '[left]', class: 'small hide-shift' },
          { label: '[right]', class: 'small hide-shift' },
        ],
      ],
    },
    {
      label: '&alpha;&beta;&gamma;',
      rows: [
        [
          {
            label: '<i>&#x03f5;</i>',
            class: 'tex hide-shift',
            insert: '\\epsilon',
            shift: '\u0395',
          },
          {
            label: '<i>&rho;</i>',
            class: 'tex hide-shift',
            insert: '\\rho',
            shift: '\u03A1',
          },
          {
            label: '<i>&tau;</i>',
            class: 'tex hide-shift',
            insert: '\\tau',
            shift: '\u03A4',
          },
          {
            label: '<i>&upsilon;</i>',
            class: 'tex hide-shift',
            insert: '\\upsilon',
            shift: '\\Upsilon',
          },
          {
            label: '<i>&theta;</i>',
            class: 'tex hide-shift',
            insert: '\\theta',
            shift: '\\Theta',
          },
          {
            label: '<i>&iota;</i>',
            class: 'tex hide-shift',
            insert: '\\iota',
            shift: '\u0399',
          },
          {
            label: '<i>&omicron;</i>',
            class: 'tex hide-shift',
            insert: '\\omicron',
            shift: '\u039F',
          },
          {
            label: '<i>&pi;</i>',
            class: 'tex hide-shift',
            insert: '\\pi',
            shift: '\\Pi',
          },
          '[separator-5]',
        ],
        [
          '[separator-5]',
          {
            label: '<i>&alpha;</i>',
            class: 'tex hide-shift',
            insert: '\\alpha',
            shift: '\u0391',
          },
          {
            label: '<i>&sigma;</i>',
            class: 'tex hide-shift',
            insert: '\\sigma',
            shift: '\\Sigma',
          },
          {
            label: '<i>&delta;</i>',
            class: 'tex hide-shift',
            insert: '\\delta',
            shift: '\\Delta',
          },
          {
            latex: '\\phi',
            class: 'tex hide-shift',
            insert: '\\phi',
            shift: '\\Phi',
          },
          {
            label: '<i>&gamma;</i>',
            class: 'tex hide-shift',
            insert: '\\gamma',
            shift: '\\Gamma',
          },
          {
            label: '<i>&eta;</i>',
            class: 'tex hide-shift',
            insert: '\\eta',
            shift: '\u0397',
          },
          {
            label: '<i>&xi;</i>',
            class: 'tex hide-shift',
            insert: '\\xi',
            shift: '\\Xi',
          },
          {
            label: '<i>&kappa;</i>',
            class: 'tex hide-shift',
            insert: '\\kappa',
            shift: '\u039A',
          },
          {
            label: '<i>&lambda;</i>',
            class: 'tex hide-shift',
            insert: '\\lambda',
            shift: '\\Lambda',
          },
          {
            label: '[backspace]',
            shift: undefined,
            class: 'small hide-shift',
            width: 1,
          },
        ],
        [
          { label: '[shift]', width: 1 },
          {
            label: '<i>&zeta;</i>',
            class: 'tex hide-shift',
            insert: '\\zeta',
            shift: '\u0396',
          },
          {
            label: '<i>&chi;</i>',
            class: 'tex hide-shift',
            insert: '\\chi',
            shift: '\u03A7',
          },
          {
            label: '<i>&psi;</i>',
            class: 'tex hide-shift',
            insert: '\\psi',
            shift: '\\Psi',
          },
          {
            label: '<i>&omega;</i>',
            class: 'tex hide-shift',
            insert: '\\omega',
            shift: '\\Omega',
          },
          {
            label: '<i>&beta;</i>',
            class: 'tex hide-shift',
            insert: '\\beta',
            shift: '\u0392',
          },
          {
            label: '<i>&nu;</i>',
            class: 'tex hide-shift',
            insert: '\\nu',
            shift: '\u039D',
          },
          {
            label: '<i>&mu;</i>',
            class: 'tex hide-shift',
            insert: '\\mu',
            shift: '\u039C',
          },
          { label: '[left]', class: 'small hide-shift' },
          { label: '[right]', class: 'small hide-shift' },
        ],
      ],
    },
  ];

  /**
   * @param {import('mathlive').MathfieldElement} mf
   * @returns {boolean} Whether there is currently a selection in the mathfield
   */
  const isSelected = (mf) => {
    const firstSelection = mf.selection?.ranges?.[0];
    return firstSelection && firstSelection[1] !== firstSelection[0];
  };

  /**
   * @template {object} T
   * @param {T} proxiedObject The object to wrap with the shortcut proxy
   * @param {import('mathlive').MathfieldElement} mf The mathfield element
   * @returns {T} A proxy that applies shortcut replacements to string values when accessed
   */
  const makeShortcutProxy = (proxiedObject, mf) => {
    /** @type {ProxyHandler<T>} */
    const shortcutProxyHandler = {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        if (value === null) {
          return value;
        }

        if (typeof value === 'object') {
          return wrapWithProxy(value);
        }

        if (typeof value === 'function') {
          return value.bind(target);
        }

        if (
          value &&
          typeof value === 'string' &&
          isSelected(mf) &&
          !value.includes('\\left(#@\\right)')
        ) {
          return value.replace('#@', '\\left(#@\\right)');
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    };

    /**
     * @param {object} target
     */
    function wrapWithProxy(target) {
      return new Proxy(target, shortcutProxyHandler);
    }

    return /** @type {T} */ (wrapWithProxy(proxiedObject));
  };

  /** @type {Map<string, import('@cortex-js/compute-engine').LatexSyntax>} */
  const latexSyntaxCache = new Map();

  /**
   * @param {HTMLElement} el
   * @returns {import('@cortex-js/compute-engine').LatexSyntax} The LatexSyntax instance
   */
  function createSyntax(el) {
    const customFunctions = el.getAttribute('custom-functions')?.split(',') ?? [];
    const allowTrig = el.hasAttribute('allow-trig');
    const allowSets = el.hasAttribute('allow-sets');
    const cacheKey = `${allowTrig}:${allowSets}:${customFunctions.toSorted().join(',')}`;
    let latexSyntax = latexSyntaxCache.get(cacheKey);
    if (!latexSyntax) {
      const {
        LatexSyntax,
        CORE_DICTIONARY,
        SYMBOLS_DICTIONARY,
        ALGEBRA_DICTIONARY,
        LOGIC_DICTIONARY,
        SETS_DICTIONARY,
        INEQUALITIES_DICTIONARY,
        ARITHMETIC_DICTIONARY,
        COMPLEX_DICTIONARY,
        TRIGONOMETRY_DICTIONARY,
        CALCULUS_DICTIONARY,
        LINEAR_ALGEBRA_DICTIONARY,
        STATISTICS_DICTIONARY,
        UNITS_DICTIONARY,
        OTHERS_DICTIONARY,
        // @ts-expect-error - Load UMD module
      } = /** @type {import('@cortex-js/compute-engine')} */ (window.ComputeEngine);

      // https://github.com/cortex-js/compute-engine/blob/b8db7dbf7ebd39d65b1c9f071936226ee2ce4885/src/compute-engine/latex-syntax/dictionary/default-dictionary.ts#L82-L103
      latexSyntax = new LatexSyntax({
        parseStrict: false,
        dictionary: [
          ...CORE_DICTIONARY,
          ...SYMBOLS_DICTIONARY,
          ...ALGEBRA_DICTIONARY,
          ...LOGIC_DICTIONARY,
          ...INEQUALITIES_DICTIONARY,
          ...ARITHMETIC_DICTIONARY,
          ...COMPLEX_DICTIONARY,
          ...CALCULUS_DICTIONARY,
          ...LINEAR_ALGEBRA_DICTIONARY,
          ...STATISTICS_DICTIONARY,
          ...UNITS_DICTIONARY,
          ...OTHERS_DICTIONARY,
          ...['oo', 'inf', 'infty', 'infinity'].map((latexTrigger) => ({
            latexTrigger,
            parse: 'PositiveInfinity',
          })),
          ...customFunctions.map((fun) => ({
            kind: 'function',
            latexTrigger: fun,
            parse: fun,
          })),
          ...(allowTrig ? TRIGONOMETRY_DICTIONARY : []),
          ...(allowSets
            ? [
                ...SETS_DICTIONARY,
                ...['|', 'u', 'U', 'cup'].map((latexTrigger) => ({
                  latexTrigger,
                  kind: /** @type {'infix'} */ ('infix'),
                  precedence: 350,
                  parse: 'Union',
                })),
                ...['&', 'cap'].map((latexTrigger) => ({
                  latexTrigger,
                  kind: /** @type {'infix'} */ ('infix'),
                  precedence: 350,
                  parse: 'Intersection',
                })),
              ]
            : []),
        ],
      });
      latexSyntaxCache.set(cacheKey, latexSyntax);
    }
    return latexSyntax;
  }

  /**
   *
   * @param {import('@cortex-js/compute-engine').LatexSyntax} ls
   * @param {string} latex
   * @returns {import('@cortex-js/compute-engine').MathJsonExpression} parsed MathJSON expression
   */
  function parseLatex(ls, latex) {
    try {
      return ls.parse(latex) ?? 'Nothing';
    } catch {
      return ['Error', 'Unknown parse error'];
    }
  }

  /**
   * @param {unknown} expr
   * @returns {string[]} User-facing formula editor parse error messages
   */
  function collectMathJSONParseErrors(expr) {
    if (Array.isArray(expr)) {
      if (expr[0] === 'Error') return [formatMathJSONParseError(expr)];
      return expr.slice(1).flatMap(collectMathJSONParseErrors);
    }

    if (expr && typeof expr === 'object' && 'fn' in expr) {
      return collectMathJSONParseErrors(expr.fn);
    }

    return [];
  }

  /**
   * @param {unknown} expr
   * @param {{ allowSets: boolean }} options
   * @returns {string[]} Student-safe conversion errors that can be checked without SymPy
   */
  function collectMathJSONConversionErrors(expr, options) {
    if (Array.isArray(expr)) {
      const [head, ...args] = expr;
      if (typeof head !== 'string') return [];

      const arityError = validateMathJSONArity(head, args, options);
      if (arityError) return [arityError];

      const childErrors = args.flatMap((arg) => collectMathJSONConversionErrors(arg, options));
      if (childErrors.length > 0) return childErrors;

      if (head === 'String') return ['Text values cannot be used as symbolic expressions.'];

      if (requiresNumericMathJSONArgs(head, args, options)) {
        const numericArgs = head === 'Apply' ? args.slice(1) : args;
        for (const arg of numericArgs) {
          if (!isNumericMathJSONExpression(arg, options)) return ['Expected a numeric expression.'];
        }
      }

      if (mathJSONRelationHeads.has(head)) {
        for (const arg of args) {
          if (!isNumericMathJSONExpression(arg, options)) return ['Expected a numeric expression.'];
        }
      }

      if (head === 'Not' && !isLogicalMathJSONExpression(args[0], options)) {
        return ['Expected a logical expression.'];
      }

      if (mathJSONLogicalVariadicFunctionHeads.has(head)) {
        for (const arg of args) {
          if (!isLogicalMathJSONExpression(arg, options)) return ['Expected a logical expression.'];
        }
      }

      return [];
    }

    if (expr && typeof expr === 'object') {
      if ('fn' in expr) return collectMathJSONConversionErrors(expr.fn, options);
    }

    return [];
  }

  /**
   * @param {unknown} expr
   * @param {{ allowSets: boolean }} options
   * @returns {string[]} User-facing formula editor error messages
   */
  function collectMathJSONClientErrors(expr, options) {
    const parseErrors = collectMathJSONParseErrors(expr);
    if (parseErrors.length > 0) return parseErrors;
    return collectMathJSONConversionErrors(expr, options);
  }

  /**
   * @param {string} head
   * @param {unknown[]} args
   * @param {{ allowSets: boolean }} options
   * @returns {string | null} A student-safe arity error, if present
   */
  function validateMathJSONArity(head, args, options) {
    if (mathJSONUnaryFunctionHeads.has(head)) return requireMathJSONArity(head, args, 1);
    if (mathJSONBinaryFunctionHeads.has(head)) return requireMathJSONArity(head, args, 2);
    if (mathJSONVariadicFunctionHeads.has(head)) return requireMathJSONArity(head, args, 1, null);
    if (mathJSONRelationHeads.has(head)) return requireMathJSONArity(head, args, 2, null);
    if (head === 'List' && options.allowSets) return requireMathJSONArity(head, args, 2);

    switch (head) {
      case 'Error':
      case 'Rational':
      case 'Log':
      case 'Ln':
        return requireMathJSONArity(head, args, 1, 2);
      case 'Apply':
      case 'Add':
      case 'Subtract':
      case 'Multiply':
      case 'InvisibleOperator':
      case 'Union':
      case 'Intersection':
        return requireMathJSONArity(head, args, 1, null);
      case 'Divide':
        return requireMathJSONArity(head, args, 2, null);
      case 'Power':
      case 'Root':
      case 'Arctan2':
      case 'Pair':
      case 'Interval':
      case 'KroneckerDelta':
        return requireMathJSONArity(head, args, 2);
      case 'Not':
      case 'Single':
      case 'Symbol':
      case 'Open':
        return requireMathJSONArity(head, args, 1);
      case 'Triple':
        return requireMathJSONArity(head, args, 3);
      default:
        return null;
    }
  }

  /**
   * @param {string} head
   * @param {unknown[]} args
   * @param {number} minCount
   * @param {number | null} [maxCount]
   * @returns {string | null} A student-safe arity error, if present
   */
  function requireMathJSONArity(head, args, minCount, maxCount = minCount) {
    if (maxCount === null) {
      if (args.length < minCount) {
        return `${head} expects at least ${minCount} ${pluralizeArg(minCount)}.`;
      }
      return null;
    }

    if (minCount === maxCount) {
      if (args.length !== minCount) {
        return `${head} expects exactly ${minCount} ${pluralizeArg(minCount)}.`;
      }
      return null;
    }

    if (args.length < minCount || args.length > maxCount) {
      return `${head} expects between ${minCount} and ${maxCount} arguments.`;
    }
    return null;
  }

  /**
   * @param {number} count
   * @returns {string} Singular or plural argument label
   */
  function pluralizeArg(count) {
    return count === 1 ? 'argument' : 'arguments';
  }

  /**
   * @param {string} head
   * @param {unknown[]} args
   * @param {{ allowSets: boolean }} options
   * @returns {boolean} Whether all arguments must be numeric
   */
  function requiresNumericMathJSONArgs(head, args, options) {
    if (
      mathJSONUnaryFunctionHeads.has(head) ||
      mathJSONBinaryFunctionHeads.has(head) ||
      mathJSONNumericVariadicFunctionHeads.has(head)
    ) {
      return true;
    }

    switch (head) {
      case 'Apply':
      case 'Add':
      case 'Multiply':
      case 'InvisibleOperator':
      case 'Divide':
      case 'Power':
      case 'Root':
      case 'Rational':
      case 'Arctan2':
      case 'Log':
      case 'Ln':
      case 'KroneckerDelta':
        return true;
      case 'Subtract':
        return !(
          options.allowSets && args.every((arg) => mathJSONExpressionKind(arg, options) === 'set')
        );
      default:
        return false;
    }
  }

  /**
   * @param {unknown} expr
   * @param {{ allowSets: boolean }} options
   * @returns {boolean} Whether the expression is numeric-like
   */
  function isNumericMathJSONExpression(expr, options) {
    return mathJSONExpressionKind(expr, options) === 'numeric';
  }

  /**
   * @param {unknown} expr
   * @param {{ allowSets: boolean }} options
   * @returns {boolean} Whether the expression is logical-like
   */
  function isLogicalMathJSONExpression(expr, options) {
    return mathJSONExpressionKind(expr, options) === 'logical';
  }

  /**
   * @param {unknown} expr
   * @param {{ allowSets: boolean }} options
   * @returns {'numeric' | 'logical' | 'set' | 'collection' | 'string' | 'error' | 'unknown'} Broad MathJSON result kind
   */
  function mathJSONExpressionKind(expr, options) {
    if (typeof expr === 'number') return 'numeric';
    if (typeof expr === 'boolean') return 'logical';
    if (typeof expr === 'string') {
      if (isMathJSONStringLiteral(expr)) return 'string';
      if (expr === 'True' || expr === 'False') return 'logical';
      if (expr === 'EmptySet') return 'set';
      return 'numeric';
    }

    if (Array.isArray(expr)) {
      const head = expr[0];
      if (head === 'Error') return 'error';
      if (head === 'String') return 'string';
      if (
        head === 'Not' ||
        mathJSONRelationHeads.has(head) ||
        mathJSONLogicalVariadicFunctionHeads.has(head)
      ) {
        return 'logical';
      }
      if (mathJSONSetHeads.has(head)) return 'set';
      if (head === 'List' && options.allowSets) return 'set';
      if (mathJSONTupleHeads.has(head)) return 'collection';
      if (head === 'Delimiter' && options.allowSets) return 'set';
      return 'numeric';
    }

    if (expr && typeof expr === 'object') {
      if ('str' in expr) return 'string';
      if ('sym' in expr && (expr.sym === 'True' || expr.sym === 'False')) return 'logical';
      if ('sym' in expr && expr.sym === 'EmptySet') return 'set';
      if ('num' in expr || 'sym' in expr) return 'numeric';
      if ('fn' in expr) return mathJSONExpressionKind(expr.fn, options);
      return 'unknown';
    }

    return 'unknown';
  }

  /**
   * @param {string} value
   * @returns {boolean} Whether the string uses MathJSON string-literal quotes
   */
  function isMathJSONStringLiteral(value) {
    return value.length >= 2 && value[0] === value.at(-1) && (value[0] === "'" || value[0] === '"');
  }

  /**
   * @param {unknown[]} expr
   * @returns {string} User-facing parse error message
   */
  function formatMathJSONParseError(expr) {
    const { code, details } = getMathJSONErrorCode(expr[1]);
    const detail = details[0] ?? formatMathJSONParseErrorPart(expr[2]);

    switch (code) {
      case 'missing':
        return 'Missing value.';
      case 'unexpected-command':
        return detail ? `Unexpected LaTeX command '${detail}'.` : 'Unexpected LaTeX command.';
      case 'unexpected-delimiter':
        return detail ? `Unexpected delimiter '${detail}'.` : 'Unexpected delimiter.';
      case 'unexpected-operator':
        return detail ? `Unexpected operator '${detail}'.` : 'Unexpected operator.';
      case 'expected-operand':
        return 'Expected another value.';
      case 'unexpected-token':
        return detail ? `Unexpected input '${detail}'.` : 'Unexpected input.';
      case '':
        return 'Could not parse this expression.';
      default:
        return detail ? `Could not parse this expression: ${code} (${detail}).` : code;
    }
  }

  /**
   * @param {unknown} expr
   * @returns {{ code: string, details: string[] }} The error code and structured details
   */
  function getMathJSONErrorCode(expr) {
    if (Array.isArray(expr) && expr[0] === 'ErrorCode') {
      return {
        code: formatMathJSONParseErrorPart(expr[1]),
        details: expr.slice(2).map(formatMathJSONParseErrorPart).filter(Boolean),
      };
    }

    return { code: formatMathJSONParseErrorPart(expr), details: [] };
  }

  /**
   * @param {unknown} expr
   * @returns {string} One formatted MathJSON error component
   */
  function formatMathJSONParseErrorPart(expr) {
    if (expr === undefined || expr === null) return '';
    if (typeof expr === 'string') return stripMathJSONStringQuotes(expr);
    if (typeof expr === 'number' || typeof expr === 'boolean') return String(expr);

    if (Array.isArray(expr)) {
      if (expr[0] === 'LatexString') return formatMathJSONParseErrorPart(expr[1]);
      if (expr[0] === 'Error') return formatMathJSONParseError(expr);
      if (expr[0] === 'ErrorCode') {
        const { code, details } = getMathJSONErrorCode(expr);
        return [code, ...details].join(': ');
      }
    }

    if (typeof expr === 'object') {
      if ('str' in expr && typeof expr.str === 'string') return stripMathJSONStringQuotes(expr.str);
      if ('sym' in expr && typeof expr.sym === 'string') return stripMathJSONStringQuotes(expr.sym);
      if ('num' in expr && typeof expr.num === 'string') return expr.num;
      if ('fn' in expr) return formatMathJSONParseErrorPart(expr.fn);
    }

    return String(expr);
  }

  /**
   * @param {string} value
   * @returns {string} MathJSON string value without matching quote delimiters
   */
  function stripMathJSONStringQuotes(value) {
    if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === "'" || value[0] === '"')) {
      return value.slice(1, -1);
    }
    return value;
  }

  /**
   * @param {HTMLElement} inputEl
   * @param {HTMLElement | null | undefined} validationEl
   * @param {HTMLElement | null | undefined} errorEl
   * @param {unknown} mathJSON
   */
  function syncClientParseError(inputEl, validationEl, errorEl, mathJSON) {
    const errors = collectMathJSONClientErrors(mathJSON, {
      allowSets: inputEl.hasAttribute('allow-sets'),
    });
    if (errors.length === 0) {
      clearClientParseError(inputEl, validationEl, errorEl);
      return;
    }
    setClientParseError(inputEl, validationEl, errorEl, errors.join(' '));
  }

  /**
   * @param {HTMLElement} inputEl
   * @param {HTMLElement | null | undefined} validationEl
   * @param {HTMLElement | null | undefined} errorEl
   * @param {string} message
   */
  function setClientParseError(inputEl, validationEl, errorEl, message) {
    if (!inputEl.classList.contains('is-invalid')) inputEl.dataset.clientParseWasValid = 'true';
    inputEl.dataset.clientParseError = 'true';
    inputEl.classList.add('is-invalid');
    inputEl.setAttribute('aria-invalid', 'true');
    if (errorEl) {
      if (!inputEl.hasAttribute('aria-errormessage')) {
        inputEl.dataset.clientParseAddedErrormessage = 'true';
      }
      inputEl.setAttribute('aria-errormessage', errorEl.id);
    }
    setCustomValidity(validationEl ?? inputEl, message);

    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.classList.remove('invisible');
  }

  /**
   * @param {HTMLElement} inputEl
   * @param {HTMLElement | null | undefined} validationEl
   * @param {HTMLElement | null | undefined} errorEl
   */
  function clearClientParseError(inputEl, validationEl, errorEl) {
    if (inputEl.dataset.clientParseWasValid === 'true') {
      inputEl.classList.remove('is-invalid');
      inputEl.removeAttribute('aria-invalid');
    }
    if (inputEl.dataset.clientParseAddedErrormessage === 'true') {
      inputEl.removeAttribute('aria-errormessage');
    }
    delete inputEl.dataset.clientParseWasValid;
    delete inputEl.dataset.clientParseAddedErrormessage;
    delete inputEl.dataset.clientParseError;
    setCustomValidity(validationEl ?? inputEl, '');

    if (!errorEl) return;
    errorEl.textContent = '\u00a0'; // NBSP to preserve element height
    errorEl.classList.add('invisible');
  }

  /**
   * @param {HTMLElement} inputEl
   * @param {string} message
   */
  function setCustomValidity(inputEl, message) {
    if ('setCustomValidity' in inputEl && typeof inputEl.setCustomValidity === 'function') {
      inputEl.setCustomValidity(message);
    }
  }

  /**
   * Initialize a <math-field> element with custom settings for <pl-symbolic-input>
   *
   * @param {string} name Name of the element to look up the tag
   */
  // @ts-expect-error - Window assignment
  window.PLSymbolicInput = function (name) {
    const mf = /** @type {import('mathlive').MathfieldElement} */ (
      document.getElementById('symbolic-input-' + name)
    );
    const validationEl = document.getElementById(`symbolic-input-validation-${name}`);
    const clientErrorEl = document.getElementById(`pl-symbolic-input-client-error-${name}`);

    // Always keep basic right-click items and append to other menu items
    const standardMenuItems = new Set(['cut', 'copy', 'paste', 'select-all']);
    const endMenuItems = mf.menuItems.filter(
      (item) => 'id' in item && typeof item.id === 'string' && standardMenuItems.has(item.id),
    );

    // If the allow-trig / allow-sets attributes are set, add matching shortcuts to the virtual keyboard
    const allowTrig = mf.getAttribute('allow-trig');
    const allowSets = mf.getAttribute('allow-sets');
    // Swap virtual keyboard labels based on display settings
    const logAsLn = mf.getAttribute('log-as-ln');
    const imaginaryUnit = mf.getAttribute('imaginary-unit') ?? 'i';

    const signKey = {
      class: 'small',
      latex: '\\mathrm{sign}',
      insert: '\\operatorname{sign}\\left({#@}\\right)',
    };

    /**
     * A key that is only present if `allowSets` is enabled
     * @template {unknown} K
     * @param {K} key The key to conditionally include
     */
    const onlyIfSets = (key) => (allowSets ? [key] : []);

    mf.menuItems = [
      {
        id: 'fraction',
        label: () => '<span class="ML__insert-template"><sup>x</sup>&frasl;<sub>y</sub></span>',
        onMenuSelect: () => mf.insert('\\frac{#@}{#?}'),
      },
      {
        id: 'power',
        label: () => '<span class="ML__insert-template">x<sup>y</sup></span>',
        onMenuSelect: () =>
          isSelected(mf) ? mf.insert('\\left({#@}\\right)^{#?}') : mf.insert('{#@}^{#?}'),
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

    /** @type {import('mathlive').VirtualKeyboardLayout} */
    const elementKeyboardLayout = {
      label: 'math',
      // When allowSets is enabled, set/interval keys take the place of e, x, y, and
      // sign across these rows; affected keys are reshuffled so the most useful keys
      // stay reachable in the same general region of the keyboard.
      rows: [
        [
          ...onlyIfSets('[separator]'),
          makeShortcutProxy({ class: 'small', latex: '{#@}^{#?}' }, mf),
          makeShortcutProxy(
            {
              class: 'small',
              latex: '{#@}^{2}',
              variants: [{ class: 'small', latex: '{#@}^{3}' }],
            },
            mf,
          ),
          {
            class: 'small',
            latex: '\\frac{#@}{#?}',
            variants: [{ class: 'small', latex: '\\frac{1}{#@}' }],
          },
          '[separator]',
          '7',
          '8',
          '9',
          '+',
          '[separator]',
          allowSets ? makeShortcutProxy({ latex: '\\{ #? \\}', insert: '\\{{#@}\\}' }, mf) : 'e',
          ...onlyIfSets(','),
          '\\infty',
          '\\pi',
        ],
        [
          ...onlyIfSets('[separator]'),
          { class: 'small', latex: '\\sqrt', insert: '\\sqrt{#@}' },
          logAsLn
            ? {
                class: 'small',
                latex: '\\ln',
                insert: '\\operatorname{ln}\\left({#@}\\right)',
              }
            : {
                class: 'small',
                latex: '\\log',
                insert: '\\operatorname{log}\\left({#@}\\right)',
              },
          { class: 'small', latex: '!' },
          '[separator]',
          '4',
          '5',
          '6',
          '-',
          '[separator]',
          allowSets ? '[' : 'x',
          allowSets ? ']' : 'y',
          ...onlyIfSets(makeShortcutProxy({ latex: '\\cup', key: 'U' }, mf)),
          imaginaryUnit,
        ],
        [
          ...onlyIfSets('[separator]'),
          { class: 'small', latex: '|#@|', insert: '|{#@}|' },
          { class: 'small', latex: '\\min', insert: '\\operatorname{min}\\left({#@}\\right)' },
          { class: 'small', latex: '\\max', insert: '\\operatorname{max}\\left({#@}\\right)' },
          '[separator]',
          '1',
          '2',
          '3',
          makeShortcutProxy(
            {
              latex: '\\times',
              insert: '{#@}\\cdot',
            },
            mf,
          ),
          '[separator]',
          '(',
          ')',
          ...onlyIfSets(makeShortcutProxy({ latex: '\\cap', key: '&' }, mf)),
          allowSets ? 'x' : signKey,
        ],
        [
          ...onlyIfSets('[separator]'),
          allowTrig
            ? {
                class: 'small',
                latex: '\\sin',

                insert: '\\operatorname{sin}\\left({#@}\\right)',
                variants: [
                  {
                    class: 'small',
                    latex: '\\csc',
                    insert: '\\operatorname{csc}\\left({#@}\\right)',
                  },
                  {
                    class: 'small',
                    latex: '\\arcsin',
                    insert: '\\operatorname{arcsin}\\left({#@}\\right)',
                  },
                  {
                    class: 'small',
                    latex: '\\mathrm{sinh}',
                    insert: '\\operatorname{sinh}\\left({#@}\\right)',
                  },
                  {
                    class: 'small',
                    latex: '\\mathrm{asinh}',
                    insert: '\\operatorname{asinh}\\left({#@}\\right)',
                  },
                ],
              }
            : '[separator]',
          allowTrig
            ? {
                class: 'small',
                latex: '\\cos',
                insert: '\\operatorname{cos}\\left({#@}\\right)',
                variants: [
                  {
                    class: 'small',
                    latex: '\\sec',
                    insert: '\\operatorname{sec}\\left({#@}\\right)',
                  },
                  {
                    class: 'small',
                    latex: '\\arccos',
                    insert: '\\operatorname{arccos}\\left({#@}\\right)',
                  },
                  {
                    class: 'small',
                    latex: '\\mathrm{cosh}',
                    insert: '\\operatorname{cosh}\\left({#@}\\right)',
                  },
                  {
                    class: 'small',
                    latex: '\\mathrm{acosh}',
                    insert: '\\operatorname{acosh}\\left({#@}\\right)',
                  },
                ],
              }
            : '[separator]',
          allowTrig
            ? {
                class: 'small',
                latex: '\\tan',
                insert: '\\operatorname{tan}\\left({#@}\\right)',
                variants: [
                  {
                    class: 'small',
                    latex: '\\cot',
                    insert: '\\operatorname{cot}\\left({#@}\\right)',
                  },
                  {
                    class: 'small',
                    latex: '\\arctan',
                    insert: '\\operatorname{arctan}\\left({#@}\\right)',
                  },
                  {
                    class: 'small',
                    latex: '\\mathrm{tanh}',
                    insert: '\\operatorname{tanh}\\left({#@}\\right)',
                  },
                  {
                    class: 'small',
                    latex: '\\mathrm{atanh}',
                    insert: '\\operatorname{atanh}\\left({#@}\\right)',
                  },
                  {
                    class: 'small',
                    latex: '\\mathrm{arctan2}',
                    insert: '\\operatorname{arctan2}\\left({#@}\\right)',
                  },
                ],
              }
            : '[separator]',
          '[separator]',
          { latex: '0', width: 2 },
          '.',
          '/',
          '[separator]',
          { class: 'small hide-shift', label: '[left]' },
          { class: 'small hide-shift', label: '[right]' },
          { class: 'small hide-shift ', label: '[backspace]', shift: undefined, width: 1 },
          ...onlyIfSets(signKey), // sign shifted from above
        ],
      ],
    };

    const updateKeyboardLayout = () => {
      window.mathVirtualKeyboard.layouts = [elementKeyboardLayout, ...defaultKeyboardLayouts];
    };

    mf.addEventListener('focus', updateKeyboardLayout);
    mf.addEventListener('selection-change', updateKeyboardLayout);

    setUpSymbolicInputMacros(mf);

    // Disable auto-complete suggestions for macros
    mf.popoverPolicy = 'off';

    const placeholderText = mf.dataset.placeholderText;
    mf.setAttribute('placeholder', `\\text{${placeholderText}}`);

    // Set up sync between input box and hidden submission data inputs
    const updateSubmissionData = function () {
      $('#symbolic-input-sub-' + name).val(mf.getValue('plain-text'));
      $('#symbolic-input-latex-' + name).val(mf.getValue('latex'));

      // Use the custom syntax parser with the same settings
      const ls = createSyntax(mf);
      const json = parseLatex(ls, mf.getValue('latex-unstyled'));
      $('#symbolic-input-json-' + name).val(JSON.stringify(json));
      syncClientParseError(/** @type {HTMLElement} */ (mf), validationEl, clientErrorEl, json);
    };

    updateSubmissionData();
    mf.addEventListener('input', updateSubmissionData);

    // Disable access to manual "\" macro mode
    mf.addEventListener(
      'keydown',
      (ev) => {
        if (ev.key === '\\') {
          ev.preventDefault();
          mf.executeCommand(['insert', '\\backslash']);
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
        }
      },
      { capture: true },
    );

    // We can't attach custom CSS with `pl-symbolic-input.css` to points other than ::part from the main page since it lives inside a shadow DOM
    const customCSS = new CSSStyleSheet();
    customCSS.replaceSync(`
    .ML__content-placeholder .ML__text {
      background: inherit;
    }
    @media (pointer: coarse) {
      .ML__virtual-keyboard-toggle {
        min-width: 0px;
        min-height: 0px;
      }
    }
    `);
    mf.shadowRoot?.adoptedStyleSheets.push(customCSS);
  };

  /**
   * Initialize the <math-field> element used to represent parse errors.
   * This element is read-only and only needs to be updated with the set of allowed function names for display
   *
   * @param {string} uuid UUID of the element to look up the tag (used instead of name since there might be multiple submissions per element)
   */
  // @ts-expect-error - Window assignment
  window.PLSymbolicInputParseError = function (uuid) {
    const mf = /** @type {import('mathlive').MathfieldElement} */ (
      document.getElementById(`symbolic-input-parse-error-${uuid}`)
    );
    if (!mf) {
      throw new Error(
        `Element 'symbolic-input-parse-error-${uuid}' is required but not found in the DOM.`,
      );
    }
    setUpSymbolicInputMacros(mf);
  };

  /**
   * Initialize the <math-field> element used to represent raw parsed submissions.
   * This element is read-only and only needs to be updated with the set of allowed function names for display
   *
   * @param {string} uuid UUID of the element to look up the tag (used instead of name since there might be multiple submissions per element)
   */
  // @ts-expect-error - Window assignment
  window.PLSymbolicInputPopover = function (uuid) {
    // Wait for popover to appear
    $(document).on('shown.bs.popover', `#pl-symbolic-input-${uuid}-button`, function () {
      const mf = /** @type {import('mathlive').MathfieldElement} */ (
        document.getElementById(`symbolic-input-popover-${uuid}`)
      );
      if (!mf) {
        throw new Error(
          `Element 'symbolic-input-popover-${uuid}' is required but not found in the DOM.`,
        );
      }
      setUpSymbolicInputMacros(mf);
    });
  };

  /**
   * Initialize list of allowed function names for a <math-field> element. The list is filled with default
   * functions and those specified in the custom-functions attribute. Each allowed function is added as a
   *  "macro" to automatically replace individual letters with well-formatted, atomic function name blocks.
   *
   * @param {import('mathlive').MathfieldElement} mf The <math-field> element to initialize
   */
  function setUpSymbolicInputMacros(mf) {
    const additionalFunctions = mf.getAttribute('custom-functions')?.split(',') ?? [];
    const allowTrig = mf.getAttribute('allow-trig');
    const allowSets = mf.getAttribute('allow-sets');

    const customFunctions = new Set(additionalFunctions.concat([...defaultFunctions]));

    /** @type {Record<string, string>} */
    const macros = {};
    [...customFunctions].forEach((fun) => (macros[fun] = `\\operatorname{${fun}}`));
    [...greekLettersToUnicode].forEach(
      ([letter, unicode]) => (macros[letter] = String.fromCodePoint(Number.parseInt(unicode, 16))),
    );

    /**
     * Additional shortcuts for instant replacement inside the pl-symbolic-input box
     * @type {import('mathlive').InlineShortcutDefinitions}
     */
    const inlineShortcuts = {
      // Using {#@}^{#?} makes abc^2 interpret as (abc)^2 instead of a*b*c^2 which is likely the intention
      '^': {
        value: '#@^{#?}',
      },
      '**': {
        value: '#@^{#?}',
      },
      '*': {
        value: '{#@}\\cdot',
      },
      '|': {
        value: '|{#@}|',
      },
      sqrt: {
        value: '\\sqrt{#@}',
      },
      pi: {
        value: '\\pi',
      },
      infty: {
        value: '\\infty',
      },
      infinity: {
        value: '\\infty',
      },
      ...Object.fromEntries(
        [...customFunctions].map((f) => [f, { value: `\\operatorname{${f}}` }]),
      ),
      ...Object.fromEntries([...greekLetters].map((l) => [l, { value: `\\${l}` }])),
      ...Object.fromEntries([...greekLettersToUnicode.keys()].map((l) => [l, { value: `\\${l}` }])),
      // Use math-field inlineShortcuts for trig functions if they are allowed, this prevents \sin from being converted to \operatorname{sin} so backend grader can directly recognize it as a trig function
      ...(allowTrig
        ? Object.fromEntries([...trigFunctions].map((f) => [f, mf.inlineShortcuts[f]]))
        : {}),
      ...(allowSets
        ? {
            cup: { value: '{#@} \\cup {#?}' },
            '\\cup': mf.inlineShortcuts.cup,
            U: mf.inlineShortcuts.cup,
            cap: { value: '{#@} \\cap {#?}' },
            '\\cap': mf.inlineShortcuts.cap,
            '&': mf.inlineShortcuts.cap,
          }
        : {}),
    };

    const shortcutProxy = makeShortcutProxy(inlineShortcuts, mf);

    // This replaces the default macros and inline shortcuts
    mf.macros = macros;
    mf.inlineShortcuts = shortcutProxy;
  }
})();
