import * as z from 'zod/v4';

import { booleanFormat, integerFormat, numberFormat } from '../helpers.js';
import type { ElementSchemaModule } from '../types.js';

const plSketchToolAttributesSchema = z
  .object({
    arrowhead: integerFormat().optional(),
    color: z.string().optional(),
    'dash-style': z.enum(['solid', 'dashed', 'longdashed', 'dotted', 'dashdotted']).optional(),
    'direction-constraint': z.enum(['none', 'horizontal', 'vertical']).optional(),
    'fill-color': z.string().optional(),
    group: z.string().optional(),
    helper: booleanFormat().optional(),
    hollow: booleanFormat().optional(),
    id: z.string(),
    label: z.string().optional(),
    'length-constraint': numberFormat().optional(),
    limit: integerFormat().optional(),
    opacity: numberFormat().optional(),
    'read-only': booleanFormat().optional(),
    size: integerFormat().optional(),
    type: z.enum([
      'free-draw',
      'point',
      'spline',
      'polyline',
      'polygon',
      'line',
      'horizontal-line',
      'vertical-line',
    ]),
  })
  .strict();

const plSketchGradeAttributesSchema = z
  .object({
    'allow-undefined': booleanFormat().optional(),
    count: integerFormat().optional(),
    debug: booleanFormat().optional(),
    endpoint: z.enum(['start', 'end', 'either']).optional(),
    feedback: z.string().optional(),
    function: z.string().optional(),
    mode: z.enum(['exact', 'at-least', 'at-most']).optional(),
    stage: integerFormat().optional(),
    tolerance: integerFormat().optional(),
    'tool-id': z.string(),
    type: z.enum([
      'count',
      'defined-in',
      'undefined-in',
      'monot-increasing',
      'monot-decreasing',
      'concave-up',
      'concave-down',
      'match',
      'match-function',
      'less-than',
      'greater-than',
    ]),
    weight: integerFormat().optional(),
    x: numberFormat().optional(),
    'x-range': z.string().optional(),
    'xy-flip': booleanFormat().optional(),
    y: numberFormat().optional(),
    'y-range': z.string().optional(),
  })
  .strict();

const plSketchDrawingAttributesSchema = z
  .object({
    coordinates: z.string().optional(),
    function: z.string().optional(),
    'tool-id': z.string(),
    'x-range': z.string().optional(),
  })
  .strict();

const plSketchAttributesSchema = z
  .object({
    'allow-blank': booleanFormat().optional(),
    'answers-name': z.string(),
    'enforce-bounds': booleanFormat().optional(),
    height: integerFormat().optional(),
    'label-down-axis': integerFormat().optional(),
    'label-off-axis': integerFormat().optional(),
    'overlay-solution': booleanFormat().optional(),
    'read-only': booleanFormat().optional(),
    weight: integerFormat().optional(),
    width: integerFormat().optional(),
    'x-axis-label': z.string().optional(),
    'x-range': z.string().optional(),
    'y-axis-label': z.string().optional(),
    'y-range': z.string().optional(),
  })
  .strict();

const drawingSchema = z.toJSONSchema(plSketchDrawingAttributesSchema, { target: 'draft-04' });

export const element: ElementSchemaModule = {
  tag: 'pl-sketch',
  schema: z.toJSONSchema(plSketchAttributesSchema, { target: 'draft-04' }),
  children: {
    'pl-sketch-grade': {
      schema: z.toJSONSchema(plSketchGradeAttributesSchema, { target: 'draft-04' }),
    },
    'pl-sketch-initial': { schema: drawingSchema },
    'pl-sketch-solution': { schema: drawingSchema },
    'pl-sketch-tool': {
      schema: z.toJSONSchema(plSketchToolAttributesSchema, { target: 'draft-04' }),
    },
  },
};
