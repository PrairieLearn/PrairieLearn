# `pl-sketch` element

Sketch curves and other mathematical objects (e.g., points, asymptotes, polygons) via freehand drawing or drag&drop. Drawings can be auto-graded using mathematical criteria. Some example criteria are:

- Are the expected number of points or asymptotes marked at the right places?
- Is a sketched function close to a reference function?
- Is a sketched function always monotonically increasing?
- Is the expected area of the canvas covered (by a polygon)?

Note that this element is designed with a focus on mathematical curve sketches that can be auto-graded. For more versatile manually graded drawings, consider using [`pl-excalidraw`](../elements/pl-excalidraw.md). For auto-gradable drawings that do not include curves, consider using [`pl-drawing`](../pl-drawing/index.md).

## Sample element

A minimal question with one drawing tool, one grading criterion, and a sample solution:

<!-- prettier-ignore -->
```html title="question.html"
  <pl-sketch answers-name="simple-sketch" x-range="-5,5" y-range="-5,5">
    <pl-sketch-tool id="fd" type="free-draw"></pl-sketch-tool>
    <pl-sketch-grade type="match-function" tool-id="fd" function="x**2"></pl-sketch-grade>
    <pl-sketch-solution tool-id="fd" function="x**2"></pl-sketch-solution>
  </pl-sketch>
```

Note that the grading and solution elements reference the same tool. The `pl-sketch-grade` element is used for grading, while the `pl-sketch-solution` element is used to render the sample solution.

A more complete example combining multiple tools, initial drawings, and several grading criteria:

![Screenshot of the pl-sketch input](pl-sketch.png)

<!-- prettier-ignore -->
```html title="question.html"
  <pl-sketch answers-name="sketch-example" x-range="-1,2" y-range="-1,5">
    <pl-sketch-tool id="fd" type="free-draw"></pl-sketch-tool>
    <pl-sketch-tool id="hl" type="horizontal-line"></pl-sketch-tool>
    <pl-sketch-tool id="pt" type="point" read-only="true"></pl-sketch-tool>
    <pl-sketch-initial tool-id="pt" coordinates="(-1,0.5)"></pl-sketch-initial>
    <pl-sketch-initial tool-id="pt" coordinates="(0,1)"></pl-sketch-initial>
    <pl-sketch-initial tool-id="pt" coordinates="(1,2)"></pl-sketch-initial>
    <pl-sketch-initial tool-id="pt" coordinates="(2,4)"></pl-sketch-initial>
    <pl-sketch-grade type="match" tool-id="hl" y="0"></pl-sketch-grade> 
    <pl-sketch-grade type="count" tool-id="hl" count="1"></pl-sketch-grade> 
    <pl-sketch-grade type="match-function" tool-id="fd" function="2**x"></pl-sketch-grade> 
    <pl-sketch-solution tool-id="fd" function="2**x"></pl-sketch-solution>
    <pl-sketch-solution tool-id="hl" coordinates="0"></pl-sketch-solution>
  </pl-sketch>
```

## Customizations

| Attribute          | Type              | Default  | Description                                                                                                                                                                                               |
| ------------------ | ----------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `answers-name`     | string (required) | -        | Variable name to store data in. Note that this attribute has to be unique within a question, i.e., no value for this attribute should be repeated within a question.                                      |
| `weight`           | integer           | 1        | Weight to use when computing a weighted average score over elements.                                                                                                                                      |
| `x-range`          | string            | `"-5,5"` | x-range of the canvas as a comma-separated pair of numbers. A 10-pixel-wide, ungraded margin is added around this range.                                                                                  |
| `y-range`          | string            | `"-5,5"` | y-range of the canvas as a comma-separated pair of numbers. A 10-pixel-wide, ungraded margin is added around this range.                                                                                  |
| `width`            | integer           | 800      | Display width of the canvas in pixels. Note that the element is not responsive, so custom widths can cause display issues and should be used with care.                                                   |
| `height`           | integer           | 450      | Display height of the canvas in pixels.                                                                                                                                                                   |
| `read-only`        | boolean           | false    | If set to `true`, the graph is not editable and the top toolbar is removed. This setting can be used in combination with `pl-sketch-initial` (see below) to render drawings as static question materials. |
| `overlay-solution` | boolean           | true     | If set to `true`, the sample solution (defined via `pl-sketch-solution` tags) is overlaid with student submissions once the question's answer is revealed to allow an easier comparison.                  |
| `enforce-bounds`   | boolean           | false    | If set to `true`, objects cannot be dragged past the edges of the canvas.                                                                                                                                 |
| `allow-blank`      | boolean           | false    | Allows the graph to be graded even if it is empty. If the initial canvas is not empty and is submitted without changes, it is not considered blank and always treated as a valid submission.              |

The customizations above are general settings that apply to the entire sketching canvas. Note that some settings, such as grid lines and axis labels, are determined automatically and are not currently customizable.

To set up the element and to customize grading, four types of elements can be nested inside the main element:

- `pl-sketch-tool` elements define drawing tools that are used to create sketches inside the canvas.
- `pl-sketch-grade` elements define grading criteria for student submissions. Criteria typically refer to one or more specific drawing tools.

## Defining drawing tools with `pl-sketch-tool`

Each drawing tool elements represents one kind of object that can be drawn onto the canvas. Each tool has a button in the element's toolbar (unless `read-only="true"` is set). Tools have a general type (e.g., line, point) that defines their drawing behavior and default settings. Multiple tools of the same type can be created and individually customized to, for example, allow students to sketch multiple functions in the same canvas, or mark different types of extrema of a function.

Tools are rendered in order of definition. This means that, for example, points should be defined after lines to appear on top of them. We also recommend defining read-only tools before other tools so that they do not interfere with drag and drop interactions.

_Note that all attributes other than `type` are optional, but default values (other than `read-only` and `helper`, which are `false` by default) depend on the tool type. Each tool type's default settings are listed separately below._

| Parameter              | Type                                                                         | Available for tool types             | Description                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                 | string                                                                       | -                                    | Type of the tool (see below)                                                                                                                                     |
| `id`                   | string                                                                       | All                                  | Unique name of the tool that is referenced in `pl-sketch-grade` and `pl-sketch-initial` elements.                                                                |
| `label`                | string                                                                       | All                                  | Label for the tool in the toolbar.                                                                                                                               |
| `read-only`            | boolean                                                                      | All                                  | If set to `true`, students cannot use this tool and it does not appear in the toolbar. It is only available when the initial state of the canvas is defined.     |
| `limit`                | integer                                                                      | All                                  | The maximum number of drawings that can be created with this tool. Note that the limit does not affect the number of possible segments for splines or polylines. |
| `helper`               | boolean                                                                      | All                                  | If set to `true`, the tool is displayed in a separate dropdown list of "helper" tools that are only meant to support students in the drawing process.            |
| `group`                | string                                                                       | All                                  | Label of a group that the tool belongs to. All tools assigned to the same group label will appear in the same dropdown in the toolbar.                           |
| `color`                | string                                                                       | All                                  | Drawing color for the tool.                                                                                                                                      |
| `dash-style`           | string: `"solid"`, `"dashed"`, `"longdashed"`, `"dotted"`, or `"dashdotted"` | line, horizontal-line, vertical-line | Dash style of the drawn lines.                                                                                                                                   |
| `direction-constraint` | string: `"none"`, `"horizontal"` or `"vertical"`                             | line                                 | Constraint of the direction in which lines can be drawn.                                                                                                         |
| `length-constraint`    | float                                                                        | line                                 | If not `0`, the maximum length of drawn lines (in the internal coordinate system of the canvas.)                                                                 |
| `arrowhead`            | integer                                                                      | line                                 | If not `0`, the size (in pixels) of an arrowhead that is automatically inserted on the terminal end of the line.                                                 |
| `size`                 | integer                                                                      | point                                | Diameter of drawn points (in pixels).                                                                                                                            |
| `hollow`               | boolean                                                                      | point                                | Whether points are drawn hollow (`true`) or filled (`false`).                                                                                                    |
| `fill-color`           | string                                                                       | polygon                              | Fill color for drawn polygons.                                                                                                                                   |
| `opacity`              | float                                                                        | polygon                              | Fill opacity (between 0 to 1) of drawn polygons.                                                                                                                 |

The element supports the following tool types with the default settings listed below:

### **`free-draw`**

Lines drawn in any shape using drag-and-release. Lines are slightly smoothed after drawing and can be moved and deleted, but not edited after drawing them.

**Defaults:**

```html
id="fd" label="Function f(x)" color="blue"
```

### **`point`**

Points placed by clicking at a specific location in the canvas.

**Defaults:**

```html
id="pt" label="Point" color="black" size="15"
```

### **`horizontal-line`**

Horizontal lines that span the entire canvas (effectively marking a y-coordinate).

**Defaults:**

```html
id="hl" label="Horizontal Line" color="dimgray" dash-style="dashdotted"
```

### **`vertical-line`**

Vertical lines that span the entire canvas (effectively marking an x-coordinate).

**Defaults:**

```html
id="vl" label="Vertical Line" color="dimgray" dash-style="dashdotted"
```

### **`line`**

Straight lines that can be drawn between two points. Optional constraints can restrict length/direction and an optional arrowhead can distinguish the two endpoints.

**Defaults:**

```html
id="line" label="Line" color="red" dash-style="solid" direction-constraint="none"
length-constraint="0" arrowhead="0"
```

### **`polyline`**

Complex lines, each consisting of straight line segments. Each segment extends the line by another connected point. Pressing "Enter" or switching tools finishes a line. Points can be moved after the line has been finished.

**Defaults:**

```html
id="pline" label="Function f(x)" color="orange"
```

### **`spline`**

Complex lines, each consisting of multiple line segments. Segments are curved to create a overall line. Each segment extends the line by another connected point. Pressing "Enter" or switching tools finishes a line. Points can be moved after the line has been finished.

**Defaults:**

```html
id="sp" label="Function f(x)" color="purple"
```

### **`polygon`**

Polygon shapes, each consisting of multiple line segments with connected endpoints. Each segment extends the line by another connected point, and the final connector of the endpoints is automatically inserted. The area of the polygon can be shaded. Pressing the "Enter" button or switching tools finishes a polygon. Points can be moved after the line has been finished.

**Defaults:**

```html
id="pg" label="Polygon" color="mediumseagreen" fill-color="mediumseagreen" opacity="0.5"
```

## Adding initial and solution drawings with `pl-sketch-initial` and `pl-sketch-solution`

For both read-only elements and ones that can be edited by students, initial and solution drawings can be added to the canvas. Initial drawings are present when the question is initially rendered in the question panel, while solution drawings are present in the solution panel to show a possible sample solution. Note that the sample solution cannot be inferred from the grading criteria because the criteria might allow for a range of possible solutions.

Initial and solution drawings refer to a tool that determines their type and styling. For initial drawings, if the tool has `read-only="true"` set, it does not appear in the toolbar and the added objects are fixed (e.g., as a given function that needs to be annotated). Otherwise, objects can be edited by students just like their own drawings.

The following attributes apply to both initial and solution drawings:

| Parameter     | Type   | Default | Description                                                                                                                                                                                                                                                           |
| ------------- | ------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool-id`     | string | -       | `id` of the tool(s) to be used for this drawing.                                                                                                                                                                                                                      |
| `coordinates` | string | -       | Comma-separated list of coordinates (e.g., `-4.5`, `(1,2)`, or `(1,2),(3,4)`) to be used for the drawing. See below for details.                                                                                                                                      |
| `function`    | string | -       | Symbolic function definition (see below) to be used to draw a `spline` or `free-draw` object. Only one of `coordinates` and `function` can be used.                                                                                                                   |
| `x-range`     | string | `","`   | Interval for which the function definition should be plotted as a comma-separated pair of numbers, e.g. `"-3,1.5"`. Only applicable if `function` is used. Start and/or end of the range can be blank (e.g., `"-3,"` or `",-3"`) to extend to the edge of the canvas. |

Note that the expected number and interpretation of coordinates depends on the type of tool that is referenced. The `vertical-line` and `horizontal-line` tools only require a single coordinate (`x` or `y`). The `point` tool expects a comma-separated coordinate pair `(x,y)`, while `line` needs 2 pairs (`(x1,y1),(x2,y2)`), and complex line tools or `polygon` need 2 or more coordinate pairs that represent the points connected by the line. Multiple tags can reference the same tool to create independent drawings (e.g., multiple points or disconnected lines).

### Rendering symbolic functions with `pl-sketch-initial` and `pl-sketch-solution`

In addition to drawing individual coordinates, `pl-sketch-initial` and `pl-sketch-solution` also support rendering a function based on a given symbolic definition. Functions can only be rendered using a `spline` or `free-draw` type tool, and are converted into a series of line fragments before being sent to the client, so the symbolic definition is not revealed to the student.

For details on what types of symbolic expressions are supported, see the [Symbolic function definitions](#symbolic-function-definitions) section below. Note that functions are rendered as one continuous line, so for non-continuous functions, it might be necessary to split them into multiple continuous intervals to avoid visual artifacts. For example:

```html
<pl-sketch-initial tool-id="fd" function="1/x**3"></pl-sketch-initial>
```

should be defined as:

```html
<pl-sketch-initial tool-id="fd" function="1/x**3" x-range="-5,0"></pl-sketch-initial>
<pl-sketch-initial tool-id="fd" function="1/x**3" x-range="0,5"></pl-sketch-initial>
```

to avoid the left and right hand side of the vertical asymptote being connected.

## Defining grading criteria with `pl-sketch-grade`

Each grading criterion element represents one grading check that is used to determine the score for students' drawings. The partial score for the sketching element is computed as the weighted average of all grading criteria.

Similar to tools, each grading criterion has a general type (e.g., count, match) that represents the type of check performed during grading. Criteria can be customized to only check specific tools or ranges, and staged to require prerequisite checks to be passed before they are applied.

The following attributes can be used to customize any grading criterion, independent of type of check that is performed:

| Parameter   | Type               | Default                    | Description                                                                                                                                                                                                                       |
| ----------- | ------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`      | string             | -                          | Type of check performed by the grading criterion (see below)                                                                                                                                                                      |
| `tool-id`   | string             | -                          | One or more comma-separated `id`s of the tool(s) to be checked by this grading criterion.                                                                                                                                         |
| `weight`    | integer            | 1                          | Weight of the grading criterion's result when computing the element's partial score.                                                                                                                                              |
| `x-range`   | string             | `","` (entire canvas)      | Interval on the x-axis in which the criterion should be applied, as a comma-separated pair of numbers, e.g. `"-3,1.5"`. Start and/or end of the range can be blank (e.g., `"-3,"`or `",-3"`) to extend to the edge of the canvas. |
| `feedback`  | string             | `""`                       | Message to be displayed to students if the grading check fails. If set to `""`, the feedback defaults to a generic message that is dependent on the grading criterion.                                                            |
| `tolerance` | integer            | (depends on type of check) | Tolerance range in which student submissions can deviate from the criterion. For most checks, the tolerance is a maximum pixel distance, but exact definitions and defaults depend on the type of check performed.                |
| `stage`     | integer (optional) | 0                          | Stage in which this criterion is applied (see below). Criteria with the default stage 0 are always applied, even if other criteria use custom stages.                                                                             |
| `debug`     | boolean            | false                      | If set to `true`, the feedback will display additional quantitative details about why the grading criteria was not met. This can be useful for question testing/tuning.                                                           |

### Supported grading types

Note that `free-draw`/`polyline`/`spline` drawings are treated as mathematical functions, so there can be at most one y-value for each x-coordinate. If there are multiple values drawn at the same x-coordinate, only the first one is considered for grading. Other tools, such as `polygon`, `point` and `line`, are not treated this way and the entire shape is considered for grading purposes.

#### **`count`**

Compares the total count of all objects drawn with the specified tool(s) to a reference value.

**Supported tool types:** All

| Parameter   | Type    | Default   | Description                                                                                                                                                                                                                                              |
| ----------- | ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `count`     | integer | -         | Reference count used for the check.                                                                                                                                                                                                                      |
| `mode`      | string  | `"exact"` | One of `"exact"`, `"at-least"`, or `"at-most"`.                                                                                                                                                                                                          |
| `tolerance` | integer | 15        | Only applied if `x-range` is set; a pixel-based margin that is added/removed (depending on `mode`) for both ends of the x-range. For all modes, either the count within `x-range` or the count after applying the tolerance margins needs to be correct. |

#### **`match`**

Checks whether any objects drawn with the specified tools match (touch or intersect) a reference coordinate or point. This check does not support `x-range`.

**Supported tool types:** All

| Parameter   | Type    | Default | Description                                                                                                   |
| ----------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `x`         | float   | -       | Reference x-coordinate. At least one of `x` or `y` must be defined.                                           |
| `y`         | float   | -       | Reference y-coordinate. At least one of `x` or `y` must be defined.                                           |
| `tolerance` | integer | 15      | Allowed pixel distance between the reference and closest drawn point.                                         |
| `endpoint`  | string  | -       | Only for the `line` tool type. Which endpoint (`"start"`, `"end"`, or `"either"`) should match the reference. |

#### **`defined-in`**

Checks whether all objects drawn with the specified tools combined cover the entire range of the reference x-interval.

**Supported tool types:** All but `horizontal-line`, `vertical-line`, and `point`

| Parameter   | Type    | Default | Description                                                                     |
| ----------- | ------- | ------- | ------------------------------------------------------------------------------- |
| `tolerance` | integer | 20      | Portion of the x-interval (in pixels) that a correct answer is allowed to skip. |

#### **`undefined-in`**

Checks whether none of the objects drawn with the specified tools combined are present anywhere in the reference x-interval.

**Supported tool types:** All but `horizontal-line`

| Parameter   | Type    | Default | Description                                                                  |
| ----------- | ------- | ------- | ---------------------------------------------------------------------------- |
| `tolerance` | integer | 20      | Portion of x-interval (in pixels) that a correct answer is allowed to cover. |

#### **`less-than`**

Checks whether all objects drawn with the specified tools are always below a reference coordinate or function. Only `y` _or_ `function` can be set.

**Supported tool types:** All but `vertical-line`

| Parameter   | Type    | Default | Description                                                                                                                                                      |
| ----------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `y`         | float   | -       | Reference y-coordinate.                                                                                                                                          |
| `function`  | string  | -       | Reference function (see [Symbolic function definitions](#symbolic-function-definitions)).                                                                        |
| `tolerance` | integer | 15      | Allowed pixel distance that drawn objects are allowed to reach above the reference.                                                                              |
| `xy-flip`   | boolean | false   | If `true`, flip x-axis and y-axis (see below for details). When `true`, `less-than` should be interpreted as "left of" and refer to x-coordinates rather than y. |
| `y-range`   | string  | -       | Replaces `x-range` when `xy-flip` is `true`.                                                                                                                     |

#### **`greater-than`**

Checks whether all objects drawn with the specified tools are always above a reference coordinate or function. Only `y` _or_ `function` can be set.

**Supported tool types:** All but `vertical-line`

| Parameter   | Type    | Default | Description                                                                                                                                                          |
| ----------- | ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `y`         | float   | -       | Reference y-coordinate.                                                                                                                                              |
| `function`  | string  | -       | Reference function (see [Symbolic function definitions](#symbolic-function-definitions)).                                                                            |
| `tolerance` | integer | 15      | Allowed pixel distance that drawn objects are allowed to reach below the reference.                                                                                  |
| `xy-flip`   | boolean | false   | If `true`, flip x-axis and y-axis (see below for details). When `true`, `greater-than` should be interpreted as "right of" and refer to x-coordinates rather than y. |
| `y-range`   | string  | -       | Replaces `x-range` when `xy-flip` is `true`.                                                                                                                         |

#### **`match-function`**

Checks whether all objects drawn are close to a reference function.

**Supported tool types:** `free-draw`, `point`, `polyline`, `spline`

| Parameter         | Type    | Default | Description                                                                                                                    |
| ----------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `function`        | string  | -       | Reference function (see [Symbolic function definitions](#symbolic-function-definitions)).                                      |
| `allow-undefined` | boolean | false   | If `false`, the entire domain of the function (with some tolerance) must be covered with objects; otherwise, gaps are ignored. |
| `tolerance`       | integer | 15      | Allowed pixel distance that drawn objects are allowed to deviate from the reference.                                           |
| `xy-flip`         | boolean | false   | If `true`, flip x-axis and y-axis (see below for details).                                                                     |
| `y-range`         | string  | -       | Replaces `x-range` when `xy-flip` is `true`.                                                                                   |

#### **`monot-increasing`**

Checks whether the drawn function is monotonically increasing. This check is performed by dividing each graded object individually into 100 equally sized intervals and comparing their end points.

**Supported tool types:** `free-draw`, `line`, `polyline`, `spline`

| Parameter   | Type    | Default | Description                                                             |
| ----------- | ------- | ------- | ----------------------------------------------------------------------- |
| `tolerance` | integer | 5       | How many segments per object are allowed to be undefined or decreasing. |

#### **`monot-decreasing`**

Checks whether the drawn function is monotonically decreasing. This check is performed by dividing each graded object individually into 100 equally sized intervals and comparing their end points.

**Supported tool types:** `free-draw`, `line`, `polyline`, `spline`

| Parameter   | Type    | Default | Description                                                             |
| ----------- | ------- | ------- | ----------------------------------------------------------------------- |
| `tolerance` | integer | 5       | How many segments per object are allowed to be undefined or increasing. |

#### **`concave-up`**

Checks whether the drawn function is concave and upward-facing. This check is performed by dividing each graded object individually into 100 equally sized intervals and checking the shape of each one. Note that `line` and `polyline` objects are not considered to be concave, so they always fail this criterion.

**Supported tool types:** `free-draw`, `line`, `polyline`, `spline`

| Parameter   | Type    | Default | Description                                                                            |
| ----------- | ------- | ------- | -------------------------------------------------------------------------------------- |
| `tolerance` | integer | 10      | How many segments per object are allowed to be undefined or not concave/upward-facing. |

#### **`concave-down`**

Checks whether the drawn function is concave and downward-facing. This check is performed by dividing each graded object individually into 100 equally sized intervals and checking the shape of each one. Note that `line` and `polyline` objects are not considered to be concave, so they always fail this criterion.

**Supported tool types:** `free-draw`, `line`, `polyline`, `spline`

| Parameter   | Type    | Default | Description                                                                              |
| ----------- | ------- | ------- | ---------------------------------------------------------------------------------------- |
| `tolerance` | integer | 10      | How many segments per object are allowed to be undefined or not concave/downward-facing. |

### Symbolic function definitions

Some grading checks above allow symbolic function definitions to be used as reference. These are provided as a string in the `function` attribute and must use Python expression syntax. They must use `x` as input variable name. Basic arithmetic operations (`+`, `-`, `*`, `/`, and `**` for exponentiation), parentheses, the constants `e` and `pi`, and the following Python function calls are supported: `abs`, `sign`, `sqrt`, `log`, `sin`, `cos`, `tan`, `sinh`, `cosh`, `tanh`, `asin`, `acos`, `atan`, `atan2`, `asinh`, `acosh`, and `atanh`. For example, one could write: `function="x**2 + 2*x - sin(pi*x)"`.

If the `xy-flip` attribute is set to `true` for a grading criterion, the provided function `function` is treated as a curve `x = f(y)`. This special purpose flag can be useful for grading vertically defined curves, such as `x = y**2`, but should be used with caution as it also changes the semantics of the grading check it is set for. Most importantly, if `xy-flip` is `true`, `less-than` and `greater-than` should be interpreted as "left of" and "right of" respectively, and refer to x-coordinates rather than y-coordinates. The attribute `y-range` should be used instead of `x-range`, and the attribute `y` of the `less-than` and `greater-than` criteria is not supported. The `function` attribute should also be defined with respect to `y` as the input variable.

For example, a tag with attributes `xy-flip="true" type="less-than" function="y**2"` can be used test if the student's submitted drawing is left of the curve `x = y**2`. See the example course for more examples.

### Optional grading stages

By default, all grading criteria are treated as entirely independent. However, in some cases, it might be desirable that a grading criterion only awards points if a different criterion has already passed. For example, one might not want to award students points for _not_ defining a function in a certain range (checked via `undefined-in`) unless they have also defined it in the correct range (checked via `defined-in`). To enforce such dependencies, criteria can be assigned a numeric `stage` attribute.

If any grading criterion with a lower stage number than another criterion fails, the one with the higher stage number automatically fails as well. Any remaining criteria without an assigned stage are always checked and do not need to pass for any staged checks.

Note that all criteria are still considered when determining achievable points, unless they are defined with `weight="0"`. For the previous example, the `defined-in` tag could be assigned `stage="1"` and `undefined-in` tag could be assigned `stage="2"`, so that students do not receive any points unless they define the function in the correct range.

## Accessibility

Due to the highly graphical nature of this element, there are currently no viable keyboard controls or reasonable screen reader interaction available. To meet some accessibility needs, alternative versions of sketching questions will be necessary, for example to allow students to give textual descriptions rather than drawing.

## Example implementations

- [element/sketch]

---

[element/sketch]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/sketch
