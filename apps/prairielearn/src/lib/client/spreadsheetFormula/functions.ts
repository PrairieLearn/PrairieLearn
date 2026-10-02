// Signatures for the functions in SPREADSHEET_ALLOWED_FUNCTIONS, used for formula bar
// suggestions, signature hints, and argument holes.

type FormulaArgumentKind = 'value' | 'range' | 'condition' | 'text';

export interface FormulaArgument {
  name: string;
  kind: FormulaArgumentKind;
  optional?: boolean;
}

export interface FormulaFunctionSignature {
  name: string;
  args: FormulaArgument[];
  /** The number of trailing arguments that may repeat, e.g. 2 for COUNTIFS's range/criteria pairs. */
  repeat?: number;
  description: string;
}

const value = (name: string): FormulaArgument => ({ name, kind: 'value' });
const range = (name: string): FormulaArgument => ({ name, kind: 'range' });
const condition = (name: string): FormulaArgument => ({ name, kind: 'condition' });
const text = (name: string): FormulaArgument => ({ name, kind: 'text' });
const optional = (argument: FormulaArgument): FormulaArgument => ({ ...argument, optional: true });

function signature(
  name: string,
  args: FormulaArgument[],
  description: string,
  repeat?: number,
): FormulaFunctionSignature {
  return { name, args, description, ...(repeat ? { repeat } : {}) };
}

const SIGNATURES: FormulaFunctionSignature[] = [
  signature('ABS', [value('number')], 'Absolute value of a number.'),
  signature('AND', [condition('logical1')], 'TRUE if every argument is TRUE.', 1),
  signature('AVERAGE', [range('number1')], 'Arithmetic mean of the arguments.', 1),
  signature(
    'AVERAGEIF',
    [range('range'), condition('criteria'), optional(range('average_range'))],
    'Mean of the cells that meet a condition.',
  ),
  signature(
    'AVERAGEIFS',
    [range('average_range'), range('criteria_range1'), condition('criteria1')],
    'Mean of the cells that meet several conditions.',
    2,
  ),
  signature('CONCATENATE', [text('text1')], 'Joins text values together.', 1),
  signature('COS', [value('angle')], 'Cosine of an angle in radians.'),
  signature('COUNT', [range('value1')], 'Number of numeric values.', 1),
  signature('COUNTA', [range('value1')], 'Number of non-empty values.', 1),
  signature('COUNTBLANK', [range('range')], 'Number of empty cells in a range.'),
  signature(
    'COUNTIF',
    [range('range'), condition('criteria')],
    'Number of cells that meet a condition.',
  ),
  signature(
    'COUNTIFS',
    [range('criteria_range1'), condition('criteria1')],
    'Number of cells that meet several conditions.',
    2,
  ),
  signature('DATE', [value('year'), value('month'), value('day')], 'Builds a date.'),
  signature('DAY', [value('date')], 'Day of the month of a date.'),
  signature('DAYS', [value('end_date'), value('start_date')], 'Number of days between two dates.'),
  signature('DEGREES', [value('angle')], 'Converts radians to degrees.'),
  signature(
    'EDATE',
    [value('start_date'), value('months')],
    'Date a number of months before or after a date.',
  ),
  signature(
    'EOMONTH',
    [value('start_date'), value('months')],
    'Last day of the month a number of months away.',
  ),
  signature('EXP', [value('number')], 'e raised to a power.'),
  signature('FALSE', [], 'The logical value FALSE.'),
  signature(
    'HLOOKUP',
    [
      value('lookup_value'),
      range('table_array'),
      value('row_index'),
      optional(value('range_lookup')),
    ],
    'Looks up a value in the first row of a table.',
  ),
  signature(
    'IF',
    [condition('condition'), value('value_if_true'), optional(value('value_if_false'))],
    'Chooses a value based on a condition.',
  ),
  signature(
    'IFERROR',
    [value('value'), value('value_if_error')],
    'A fallback value if a value is an error.',
  ),
  signature('IFNA', [value('value'), value('value_if_na')], 'A fallback value if a value is #N/A.'),
  signature(
    'INDEX',
    [range('range'), value('row'), optional(value('column'))],
    'Value at a position in a range.',
  ),
  signature('INT', [value('number')], 'Rounds down to the nearest integer.'),
  signature('ISBLANK', [value('value')], 'TRUE if a cell is empty.'),
  signature('ISERROR', [value('value')], 'TRUE if a value is an error.'),
  signature('ISLOGICAL', [value('value')], 'TRUE if a value is TRUE or FALSE.'),
  signature('ISNUMBER', [value('value')], 'TRUE if a value is a number.'),
  signature('ISTEXT', [value('value')], 'TRUE if a value is text.'),
  signature(
    'LEFT',
    [text('text'), optional(value('num_chars'))],
    'Characters from the start of text.',
  ),
  signature('LEN', [text('text')], 'Number of characters in text.'),
  signature('LN', [value('number')], 'Natural logarithm.'),
  signature('LOG', [value('number'), optional(value('base'))], 'Logarithm to a base (default 10).'),
  signature('LOG10', [value('number')], 'Base-10 logarithm.'),
  signature('LOWER', [text('text')], 'Converts text to lowercase.'),
  signature(
    'MATCH',
    [value('lookup_value'), range('lookup_range'), optional(value('match_type'))],
    'Position of a value in a range.',
  ),
  signature('MAX', [range('number1')], 'Largest value.', 1),
  signature('MEDIAN', [range('number1')], 'Middle value.', 1),
  signature(
    'MID',
    [text('text'), value('start'), value('num_chars')],
    'Characters from the middle of text.',
  ),
  signature('MIN', [range('number1')], 'Smallest value.', 1),
  signature('MOD', [value('number'), value('divisor')], 'Remainder after division.'),
  signature('MONTH', [value('date')], 'Month of a date.'),
  signature('NOT', [condition('logical')], 'Reverses a logical value.'),
  signature('OR', [condition('logical1')], 'TRUE if any argument is TRUE.', 1),
  signature('PI', [], 'The number π.'),
  signature('POWER', [value('base'), value('exponent')], 'A number raised to a power.'),
  signature('PRODUCT', [range('number1')], 'Product of the arguments.', 1),
  signature('RADIANS', [value('angle')], 'Converts degrees to radians.'),
  signature(
    'RIGHT',
    [text('text'), optional(value('num_chars'))],
    'Characters from the end of text.',
  ),
  signature('ROUND', [value('number'), value('digits')], 'Rounds to a number of digits.'),
  signature('ROUNDDOWN', [value('number'), value('digits')], 'Rounds toward zero.'),
  signature('ROUNDUP', [value('number'), value('digits')], 'Rounds away from zero.'),
  signature('SIN', [value('angle')], 'Sine of an angle in radians.'),
  signature('SQRT', [value('number')], 'Square root.'),
  signature('SUM', [range('number1')], 'Sum of the arguments.', 1),
  signature(
    'SUMIF',
    [range('range'), condition('criteria'), optional(range('sum_range'))],
    'Sum of the cells that meet a condition.',
  ),
  signature(
    'SUMIFS',
    [range('sum_range'), range('criteria_range1'), condition('criteria1')],
    'Sum of the cells that meet several conditions.',
    2,
  ),
  signature('SUMPRODUCT', [range('array1')], 'Sum of the products of matching cells.', 1),
  signature(
    'SWITCH',
    [value('expression'), value('case1'), value('value1')],
    'Value for the first case that matches an expression.',
    2,
  ),
  signature('TAN', [value('angle')], 'Tangent of an angle in radians.'),
  signature('TEXT', [value('value'), text('format')], 'Formats a number as text.'),
  signature('TRIM', [text('text')], 'Removes extra spaces from text.'),
  signature('TRUE', [], 'The logical value TRUE.'),
  signature('UPPER', [text('text')], 'Converts text to uppercase.'),
  signature('VALUE', [text('text')], 'Converts text to a number.'),
  signature(
    'VLOOKUP',
    [
      value('lookup_value'),
      range('table_array'),
      value('col_index'),
      optional(value('range_lookup')),
    ],
    'Looks up a value in the first column of a table.',
  ),
  signature('XOR', [condition('logical1')], 'TRUE if an odd number of arguments are TRUE.', 1),
  signature('YEAR', [value('date')], 'Year of a date.'),
];

export const FORMULA_FUNCTION_SIGNATURES: ReadonlyMap<string, FormulaFunctionSignature> = new Map(
  SIGNATURES.map((entry) => [entry.name, entry]),
);

/** Returns the argument at `index`, numbering repeated arguments (`number2`, `criteria_range2`). */
export function argumentAt(
  signature: FormulaFunctionSignature,
  index: number,
): FormulaArgument | null {
  if (index < signature.args.length) return signature.args[index];
  const repeat = signature.repeat;
  if (!repeat) return null;
  const offset = index - signature.args.length;
  const template = signature.args[signature.args.length - repeat + (offset % repeat)];
  const match = /^(.*?)(\d+)$/.exec(template.name);
  const repetition = Math.floor(offset / repeat) + 1;
  return {
    name: match ? `${match[1]}${Number(match[2]) + repetition}` : template.name,
    kind: template.kind,
    optional: true,
  };
}

/** Returns the displayed argument list, e.g. `['number1', '[number2]', '…']` for SUM. */
export function formatSignature(signature: FormulaFunctionSignature): string[] {
  const parts = signature.args.map((argument) =>
    argument.optional ? `[${argument.name}]` : argument.name,
  );
  if (signature.repeat) {
    for (let index = 0; index < signature.repeat; index += 1) {
      const argument = argumentAt(signature, signature.args.length + index)!;
      parts.push(`[${argument.name}]`);
    }
    parts.push('…');
  }
  return parts;
}
