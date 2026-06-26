import * as z from 'zod/v4';

import { booleanFormat, integerFormat, numberFormat } from '../helpers.ts';
import type { ElementChildSchema, ElementSchemaModule } from '../types.ts';

const plDrawingAttributesSchema = z.looseObject({
  'allow-blank': booleanFormat().optional(),
  'angle-tol': numberFormat().optional(),
  'answers-name': z.string().optional(),
  'aria-description': z.string().optional(),
  'aria-label': z.string().optional(),
  'disregard-extra-elements': booleanFormat().optional(),
  gradable: booleanFormat().optional(),
  'grid-size': integerFormat().optional(),
  height: numberFormat().optional(),
  'hide-answer-panel': booleanFormat().optional(),
  'show-score': booleanFormat().optional(),
  'show-tolerance-hint': booleanFormat().optional(),
  'snap-to-grid': booleanFormat().optional(),
  tol: numberFormat().optional(),
  'tolerance-hint': z.string().optional(),
  weight: integerFormat().optional(),
  width: numberFormat().optional(),
});

const plDrawingGroupChild: ElementChildSchema = {
  schema: z.toJSONSchema(z.object({ visible: booleanFormat().optional() }).strict(), {
    target: 'draft-04',
  }),
  // Holds drawing-object child tags, which may be defined by element extensions.
  allowAdditionalChildren: true,
};

const drawingItemsContainerChild: ElementChildSchema = {
  schema: z.toJSONSchema(z.object({ 'draw-error-box': booleanFormat().optional() }).strict(), {
    target: 'draft-04',
  }),
  children: {
    'pl-drawing-group': plDrawingGroupChild,
  },
  // Holds drawing-object child tags, which may be defined by element extensions.
  allowAdditionalChildren: true,
};

const plDrawingButtonChild: ElementChildSchema = {
  // pl-drawing-button skips attribute validation in Python because it accepts the
  // attributes of whatever drawing object its `type` names, so allow any attribute.
  schema: z.toJSONSchema(z.looseObject({ type: z.string() }), { target: 'draft-04' }),
};

const plControlsGroupChild: ElementChildSchema = {
  schema: z.toJSONSchema(z.object({ label: z.string().optional() }).strict(), {
    target: 'draft-04',
  }),
  children: {
    'pl-drawing-button': plDrawingButtonChild,
  },
};

const plControlsChild: ElementChildSchema = {
  schema: z.toJSONSchema(z.object({}).strict(), { target: 'draft-04' }),
  children: {
    'pl-controls-group': plControlsGroupChild,
    'pl-drawing-button': plDrawingButtonChild,
  },
};

export const element: ElementSchemaModule = {
  tag: 'pl-drawing',
  schema: z.toJSONSchema(plDrawingAttributesSchema, { target: 'draft-04' }),
  children: {
    'pl-controls': plControlsChild,
    'pl-drawing-answer': drawingItemsContainerChild,
    'pl-drawing-initial': drawingItemsContainerChild,
  },
};
