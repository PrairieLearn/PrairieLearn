

# Elements to setup canvas (drawing space)

## `pl-drawing` element

A `pl-drawing` element displays a canvas, which can be used to display initial drawing objects or expect drawing objects for grading.

The system of coordinates of the canvas is located at the top/left corner, as illustrated in the image below.

<img src="pl-origin-canvas.png" width=70%>

#### Sample Element

```html
<pl-drawing answers-name="fbd">
</pl-drawing>
```
<img src="pl-drawing.png" width=70%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`gradable` | boolean | false | `gradable = true` expects objects to be placed in the canvas for grading, when `gradable = false` the canvas will be used for display only, i.e. for plotting figures.
`answers-name` | string | — | Variable name to store student-input data in. This variable is required when `gradable = true`. The input data will be stored in `data[“submitted_answers”][answers-name]`.
`width` | integer | 580 | Horizontal width of the canvas (in pixels).
`height` | integer | 320 | Vertical height of the canvas (in pixels).
`grid-size` | integer | 20 | Size of the square grid for the canvas background (in pixels). If `grid-size = 0`, then the background is white.
`snap-to-grid` | boolean | false | If true, objects placed in the canvas snap to closest grid point. Otherwise, they can be placed outside of the grid.
`correct-answer` | string | special | Correct answer for grading. Defaults to `data["correct-answers"][answers-name]`.
`tol` | float | `0.5*grid-size` | Tolerance to check the position of objects (in pixels). The error is calculated as the absolute difference between expected position and submitted one.
`angle-tol` | float | 10 | Tolerance to check angles (in degrees). The error is calculated as the absolute difference between expected angle and submitted one.
`show-tolerance-hint` | boolean | true | Show tolerance hint under the canvas. The default is `true` when `gradable = true`.
`tolerance-hint` | text | "The expected tolerance is 1/2 square grid." | Hint explaining tolerance used when grading objects.
`disregard-extra-elements` | boolean | false | If true, extra elements are ignored if they match the same reference object.  Otherwise, multiple matching elements will reduce the awarded points.
`hide-answer-panel` | boolean | true | If true, the correct answer is not displayed in the answer panel. 


## `pl-drawing-initial` element

A `pl-drawing-initial` will group objects that will be displayed in the canvas defined by `pl-drawing`.

For example, `pl-drawing-initial` can be used to create figures that are displayed as part of the question body:

```html
<pl-drawing grid-size="0">
    <pl-drawing-initial>
        <!-- create the image here -->
    </pl-drawing-initial>
</pl-drawing>
```

<img src="pl-I.png" width=30%>

And `pl-drawing-initial` can also be used to display initial objects in a canvas that will be used for grading. Objects inside `pl-drawing-initial` are not graded. Objects inside `pl-drawing-answer` are  graded.

```html
<pl-drawing gradable="true" answers-name="add-objects">

    <pl-drawing-initial>
    <!-- objects that define the correct answer are placed here -->
    </pl-drawing-initial>
    <pl-drawing-answer>
      <!-- objects that define the correct answer are placed here -->
    </pl-drawing-answer>

</pl-drawing>
```

The child element `pl-drawing-answer` will be explained in the Grading section.

# Elements to create drawing objects

## `pl-coordinates` element

A `pl-coordinates` element adds a 2D system of coordinates.

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-coordinates x1="60" y1="80" label="0" angle="30"></pl-coordinates>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-coordinates.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 40 | `x` position of the origin of the coordinate system w.r.t the origin of the canvas (top/left corner), i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 40 | `y` position of the origin of the coordinate system w.r.t the origin of the canvas (top/left corner), i.e., the vertical distance from the top border of the canvas.
`width` | float | 40 | Length of the arrow vector.
`angle` | float | 0 | Angle of the coordinate system. Angle is positive when clockwise orientation.
`label` | string | - | Text to label the center of the coordinate system
`offsetx` | float | -16 | Horizontal distance of `label` from the origin of the coordinate system.
`offsety` | float | -10 | Vertical distance of `label` from the origin of the coordinate system.
`label-x` | string | x | Text to label the horizontal arrow vector (x-axis)
`offsetx-label-x` | float | 0 | Horizontal distance of `label-x` from the origin of the coordinate system.
`offsety-label-x` | float | 0 | Vertical distance of `label-x` from the origin of the coordinate system.
`label-y` | string | y | Text to label the vertical arrow vector (y-axis)
`offsetx-label-y` | float | -20 | Horizontal distance of `label-y` from the origin of the coordinate system.
`offsety-label-y` | float | -10 | Vertical distance of `label-y` from the origin of the coordinate system.
`color` | string | black | Set the color of the coordinate system ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) )
`stroke-width` | float | 2 | Set the width of the stroke.
`arrow-head-width` | float | 1 | Scale factor for the width of the arrow head.
`arrow-head-length` | float | 1 | Scale factor for the length of the arrow head.

### Example Implementations

- [demo/drawing/inclinedPlan]: Example that uses a system of coordinates

- [element/drawingGallery]: Image gallery with drawing objects


## `pl-line` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-line x1="60" y1="80" x2="140" y2="120"></pl-line>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-line.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 10 | `x` position for the start point for the line, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 10 | `y` position for the start point for the line, i.e., the vertical distance from the top border of the canvas.
`width` | float | 60 | Width of the line.
`angle` | float | 0 | Angle of rotation around the start point of the line. Angles are measured from the horizontal axis and are positive clockwise.
`x2` | float | - | `x` position for the end point for the line, i.e., the horizontal distance from the left border of the canvas. By default, `(x2,y2)` are determined from `angle` and `width`. If `x2` and `y2` are provided, then `angle` and `width` are replaced.
`y2` | float | - | `y` position for the end point for the line, i.e., the vertical distance from the top border of the canvas. By default, `(x2,y2)` are determined from `angle` and `width`. If `x2` and `y2` are provided, then `angle` and `width` are replaced.
`stroke-color` | string | black | Set the color of the line ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) )
`stroke-width` | float | 2 | Set the width of the stroke.
`dashed-size` | float | _ | Creates a dashed line with equally spaced `dashed-size`px fills.

### Example Implementations

- [demo/drawing/liftingMechanism]: Example that uses lines

- [element/drawingGallery]: Image gallery with drawing objects

## `pl-arc` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-line x1="0" y1="80" x2="60" y2="80" stroke-color="red"></pl-line>
        <pl-arc  x1="60" y1="120" radius="40" start-angle="270" end-angle="0" stroke-color="green"></pl-arc>
        <pl-line x1="100" y1="120" x2="100" y2="200" stroke-color="blue" ></pl-line>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-arc.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 40 | `x` position for the center of the arc, i.e., the horizontal distance from the left border of the arc.
`y1` | float | 40 | `y` position for the center of the circle, i.e., the vertical distance from the top border of the canvas.
`radius` | float | 20 | Radius of the circle.
`start-angle` | float | 0 | Start angle of the arc.  Angles are measured from the horizontal axis and are positive clockwise.
`end-angle` | float | 90 | End angle of the arc. Angles are measured from the horizontal axis and are positive clockwise. Arcs are formed from `start-angle` to `end-angle` going on clockwise orientation.
`stroke-color` | string | black | Set the stroke color of the line ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-width` | float | 2 | Set the width of the stroke.
`dashed-size` | float | _ | Creates a dashed line with equally spaced `dashed-size`px fills.

### Example Implementations

- [element/drawingGallery]: Image gallery with drawing objects


## `pl-point` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-point x1="60" y1="120" label="A"></pl-point>
        <pl-point x1="160" y1="60" label="B"></pl-point>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-point.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 20 | `x` position of the point, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 20 | `y` position of the point, i.e., the vertical distance from the top border of the canvas.
`radius` | float | 4 | Radius of the circle that defines the point.
`label` | string | - | Text to label the point.
`offsetx` | float | 5 | Horizontal distance of `label` from the point.
`offsety` | float | 5 | Vertical distance of `label` from the point.
`color` | string | black | Set the fill color of the point ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).

### Example Implementations

- [demo/drawing/pulley]: Example that includes a point in the canvas

- [element/drawingGallery]: Image gallery with drawing objects


## `pl-triangle` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-triangle  x1="40" y1="180" x2="160" y2="180" x3="160" y3="40"></pl-triangle>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-triangle.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 20 | `x` position for vertex 1, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 20 | `y` position for vertex 1, i.e., the vertical distance from the top border of the canvas.
`x2` | float | 20 | `x` position for vertex 2, i.e., the horizontal distance from the left border of the canvas.
`y2` | float | 20 | `y` position for vertex 2, i.e., the vertical distance from the top border of the canvas.
`x3` | float | 20 | `x` position for vertex 3, i.e., the horizontal distance from the left border of the canvas.
`y3` | float | 20 | `y` position for vertex 3, i.e., the vertical distance from the top border of the canvas.
`color` | string | red1 | Set the fill color of the triangle ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-color` | string | black | Set the stroke color of the triangle.
`stroke-width` | float | 1 | Set the width of the stroke.

### Example Implementations

- [demo/drawing/pulley]: Example that includes a triangle

- [element/drawingGallery]: Image gallery with drawing objects

## `pl-rectangle` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-rectangle  x1="80" y1="50" width="100" height="40"></pl-rectangle>
        <pl-rectangle  x1="120" y1="140" width="120" height="20" angle="30" color="pink1"></pl-rectangle>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-rectangle.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 20 | `x` position for the center of the rectangle, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 20 | `y` position for the center of the rectangle, i.e., the vertical distance from the top border of the canvas.
`height` | float | 20 | Height of the rectangle.
`width`  | float | 20 | Width of the rectangle.
`angle` | float | 0 | Angle of rotation around the center of the rectangle. Angles are measured from the horizontal axis and are positive clockwise.
`color` | string | green1 | Set the fill color of the rectangle ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-color` | string | black | Set the stroke color of the rectangle.
`stroke-width` | float | 1 | Set the width of the stroke.

### Example Implementations

- [demo/drawing/pulley]: Example that includes a rectangle

- [element/drawingGallery]: Image gallery with drawing objects

## `pl-circle` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-circle  x1="40" y1="100" radius="30" color="#95A5A6" stroke-width="3"></pl-circle>
        <pl-circle  x1="120" y1="100" radius="50" color="#D0D3D4"></pl-circle>
    </pl-drawing-initial>
</pl-drawing>
```

<img src="pl-circle.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 20 | `x` position for the center of the circle, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 20 | `y` position for the center of the circle, i.e., the vertical distance from the top border of the canvas.
`radius` | float | 20 | Radius of the circle.
`color` | string | gray1 | Set the fill color of the circle ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-color` | string | black | Set the stroke color of the circle.
`stroke-width` | float | 1 | Set the width of the stroke.
`label` | string | - | Text to label the center of the circle.
`offsetx` | float | 5 | Horizontal distance of `label` from the center of the circle.
`offsety` | float | 5 | Vertical distance of `label1` from the center of the circle

### Example Implementations

- [demo/drawing/liftingMechanism]: Example that uses circles

- [element/drawingGallery]: Image gallery with drawing objects

## `pl-polygon` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-polygon plist='[{"x": 40, "y": 40}, {"x": 140,"y": 80}, {"x": 60,"y": 180}]' ></pl-polygon>
    </pl-drawing-initial>
</pl-drawing>
```

<img src="pl-polygon.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`plist` | string | '' | List of the vertices that form the polygon.
`color` | string | gray1 | Set the fill color of the circle ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-color` | string | black | Set the stroke color of the circle.
`stroke-width` | float | 1 | Set the width of the stroke.

To draw a polygon with `n` vertices, each one with coordinates `(xi,yi)`, the string `plist` is given as a dictionar with the following format:

 `plist = '[{"x": x1, "y": y1}, {"x": x2,"y": x2},  ... , {"x": xn,"y": yn}]' `

 For an example that uses `server.py` to generate `plist` refer to QID: `Example-pl-drawing-beam-cross-section`

### Example Implementations

 - [element/drawingGallery]: Image gallery with drawing objects

## `pl-rod` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-rod x1="60" y1="80" x2="120" y2="100"></pl-rod>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-rod.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 40 | `x` position for the first end of the rod, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 20 | `y` position for the first end of the rod, i.e., the vertical distance from the top border of the canvas.
`x2` | float | 80 | `x` position for the second end of the rod, i.e., the horizontal distance from the left border of the canvas.
`y2` | float | 20 | `y` position for the second end of the rod, i.e., the vertical distance from the top border of the canvas.
`width` | float | 20 | Thickness of the rod.
`draw-pin` | boolean | true | Draw the pin location in both ends of the rod.
`label1` | string | - | Text to label the first end of the rod.
`offsetx1` | float | 2 | Horizontal distance of `label1` from the first end of the rod.
`offsety1` | float | 2 | Vertical distance of `label1` from the first end of the rod.
`label2` | string | - | Text to label the first end of the rod.
`offsetx2` | float | 2 | Horizontal distance of `label2` from the first end of the rod.
`offsety2` | float | 2 | Vertical distance of `label2` from the first end of the rod.
`color` | string | white | Set the fill color of the rod ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-color` | string | black | Set the stroke color of the rod.
`stroke-width` | float | 2 | Set the width of the stroke.

### Example Implementations

- [demo/drawing/vMDiagrams]: Example that includes a rod

- [element/drawingGallery]: Image gallery with drawing objects

## `pl-3pointrod` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-3pointrod x1="40" y1="100" x2="100" y2="100" x3="100" y3="180"></pl-3pointrod>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-3pointrod.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 40 | `x` position for the first end of the rod, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 100 | `y` position for the first end of the rod, i.e., the vertical distance from the top border of the canvas.
`x2` | float | 100 | `x` position of the center point of the rod, i.e., the horizontal distance from the left border of the canvas.
`y2` | float | 100 | `y` position of the center point of the rod, i.e., the vertical distance from the top border of the canvas.
`x3` | float | 100 | `x` position for the second end of the rod, i.e., the horizontal distance from the left border of the canvas.
`y3` | float | 140 | `y` position for the second end of the rod, i.e., the vertical distance from the top border of the canvas.
`width` | float | 20 | Thickness of the rod.
`draw-pin` | boolean | true | Draw the pin location in both ends of the rod.
`label1` | string | - | Text to label the first end of the rod.
`offsetx1` | float | 0| Horizontal distance of `label1` from the first end of the rod.
`offsety1` | float | -20 | Vertical distance of `label1` from the first end of the rod.
`label2` | string | - | Text to label the middle point of the rod.
`offsetx2` | float | 0 | Horizontal distance of `label2` from the first end of the rod.
`offsety2` | float | -20 | Vertical distance of `label2` from the first end of the rod.
`label3` | string | - | Text to label the second end of the rod.
`offsetx3` | float | 0 | Horizontal distance of `label3` from the first end of the rod.
`offsety3` | float | -20 | Vertical distance of `label3` from the first end of the rod.
`color` | string | white | Set the fill color of the rod ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-color` | string | black | Set the stroke color of the rod.
`stroke-width` | float | 2 | Set the width of the stroke.

### Example Implementations

- [demo/drawing/inclinedPlane]: Example that includes a 3-point rod

- [element/drawingGallery]: Image gallery with drawing objects

## `pl-4pointrod` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-4pointrod ></pl-4pointrod>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-4pointrod.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 40 | `x` position for the first end of the rod, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 100 | `y` position for the first end of the rod, i.e., the vertical distance from the top border of the canvas.
`x2` | float | 100 | `x` position of the center point of the rod, i.e., the horizontal distance from the left border of the canvas.
`y2` | float | 100 | `y` position of the center point of the rod, i.e., the vertical distance from the top border of the canvas.
`x3` | float | 100 | `x` position for the second end of the rod, i.e., the horizontal distance from the left border of the canvas.
`y3` | float | 160 | `y` position for the second end of the rod, i.e., the vertical distance from the top border of the canvas.
`x4` | float | 140 | `x` position for the third end of the rod, i.e., the horizontal distance from the left border of the canvas.
`y4` | float | 60 | `y` position for the third end of the rod, i.e., the vertical distance from the top border of the canvas.
`width` | float | 20 | Thickness of the rod.
`draw-pin` | boolean | true | Draw the pin location in both ends of the rod.
`label1` | string | - | Text to label the first end of the rod.
`offsetx1` | float | 0| Horizontal distance of `label1` from the first end of the rod.
`offsety1` | float | -20 | Vertical distance of `label1` from the first end of the rod.
`label2` | string | - | Text to label the middle point of the rod.
`offsetx2` | float | 0 | Horizontal distance of `label2` from the first end of the rod.
`offsety2` | float | -20 | Vertical distance of `label2` from the first end of the rod.
`label3` | string | - | Text to label the second end of the rod.
`offsetx3` | float | 0 | Horizontal distance of `label3` from the first end of the rod.
`offsety3` | float | -20 | Vertical distance of `label3` from the first end of the rod.
`label4` | string | - | Text to label the third end of the rod.
`offsetx4` | float | 0 | Horizontal distance of `label4` from the first end of the rod.
`offsety4` | float | -20 | Vertical distance of `label4` from the first end of the rod.
`color` | string | white | Set the fill color of the rod ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-color` | string | black | Set the stroke color of the rod.
`stroke-width` | float | 2 | Set the width of the stroke.

### Example Implementations

- [demo/drawing/liftingMechanism]: Example that uses 4-point rods

- [element/drawingGallery]: Image gallery with drawing objects


## `pl-collar-rod` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-collar-rod x1="60" y1="100" x2="160" y2="100"></pl-collar-rod>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-collar.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 40 | `x` position for the first end of the rod, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 40 | `y` position for the first end of the rod, i.e., the vertical distance from the top border of the canvas.
`x2` | float | 100 | `x` position for the second end of the rod, i.e., the horizontal distance from the left border of the canvas.
`y2` | float | 40 | `y` position for the second end of the rod, i.e., the vertical distance from the top border of the canvas.
`width` | float | 20 | Thickness of the rod.
`draw-pin` | boolean | true | Draw the pin location in both ends of the rod.
`label1` | string | - | Text to label the first end of the rod.
`offsetx1` | float | 2 | Horizontal distance of `label1` from the first end of the rod.
`offsety1` | float | 2 | Vertical distance of `label1` from the first end of the rod.
`label2` | string | - | Text to label the first end of the rod.
`offsetx2` | float | 2 | Horizontal distance of `label2` from the first end of the rod.
`offsety2` | float | 2 | Vertical distance of `label2` from the first end of the rod.
`draw-collar-end1` | boolean | true | Draw a collar end at `(x1,y1)`.
`w1` | float | 1.5*width | The width of the collar at end 1.
`h1` | float | 2*width | The height of the collar at end 1.
`draw-collar-end2` | boolean | false | Draw a collar end at `(x2,y2)`.
`w2` | float | 1.5*width | The width of the collar at end 2.
`h2` | float | 2*width | The height of the collar at end 2.
`color` | string | white | Set the fill color of the rod ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-color` | string | black | Set the stroke color of the rod.
`stroke-width` | float | 2 | Set the width of the stroke.

### Example Implementations

- [demo/drawing/collarRod]: Example that uses a collar rod

- [element/drawingGallery]: Image gallery with drawing objects


## `pl-fixed-pin` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-fixed-pin x1="100" y1="100"></pl-fixed-pin>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-fixed-pin.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 20 | `x` position for the center of the pin, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 20 | `y` position for the first end of the rod, i.e., the vertical distance from the top border of the canvas.
`height` | float | 40 | Height of the pin support, measured from the top of the base (ground) to the center of the pin.
`width`  | float | 30 | Width of the pin support.
`angle` | float | 0 | Angle of rotation around the center of the pin. Angles are measured from the horizontal axis and are positive clockwise.
`draw-pin` | boolean | true | Draw the location of the pin.
`draw-ground` | boolean | true | Draw the rectangular base/ground.
`label` | string | - | Text to label the pin support.
`offsetx` | float | 2 | Horizontal distance of `label` from the center of the pin.
`offsety` | float | 2 | Vertical distance of `label` from the center of the pin.
`color` | string | brown1 | Set the fill color of the pin support ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-color` | string | black | Set the stroke color of the pin support.
`stroke-width` | float | 2 | Set the width of the stroke.

### Example Implementations

- [demo/drawing/vMDiagrams]: Example that uses a fixed pin as boundary condition

- [element/drawingGallery]: Image gallery with drawing objects


## `pl-roller` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-roller x1="60" y1="100"></pl-roller>
        <pl-fixed-pin x1="140" y1="100"  color="green1" ></pl-fixed-pin>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-roller.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 20 | `x` position for the center of the pin, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 20 | `y` position for the first end of the pin, i.e., the vertical distance from the top border of the canvas.
`height` | float | 40 | Height of the roller support, measured from the top of the base (ground) to the center of the pin.
`width`  | float | 30 | Width of the roller support.
`angle` | float | 0 | Angle of rotation around the center of the pin. Angles are measured from the horizontal axis and are positive clockwise.
`draw-pin` | boolean | true | Draw the location of the pin.
`draw-ground` | boolean | true | Draw the rectangular base/ground.
`label` | string | - | Text to label the roller support.
`offsetx` | float | 2 | Horizontal distance of `label` from the center of the pin.
`offsety` | float | 2 | Vertical distance of `label` from the center of the pin.
`color` | string | brown1 | Set the fill color of the roller support ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-color` | string | black | Set the stroke color of the roller.
`stroke-width` | float | 2 | Set the width of the stroke.

### Example Implementations

- [demo/drawing/vMDiagrams]: Example that uses a roller as boundary condition

- [element/drawingGallery]: Image gallery with drawing objects

## `pl-clamped` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
      <pl-roller  x1="140" y1="100" width="40" color="gray1"></pl-roller>
      <pl-rod x1="40" y1="100" x2="140" y2="100" draw-pin="false"></pl-rod>
      <pl-clamped x1="40" y1="100" height="60" width="20"></pl-clamped>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-clamped.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 20 | `x` position for the clamped point, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 20 | `y` position for the clamped, i.e., the vertical distance from the top border of the canvas.
`height` | float | 40 | Height of the clamped support (rectangle).
`width`  | float | 20 | Width of the clamped support (rectangle).
`angle` | float | 0 | Angle of rotation around the clamped point. Angles are measured from the horizontal axis and are positive clockwise.
`label` | string | - | Text to label the pin support.
`offsetx` | float | 2 | Horizontal distance of `label` from the center of the pin.
`offsety` | float | 2 | Vertical distance of `label` from the center of the pin.
`color` | string | black | Fill color for the clamped support using a gradient from white to `color` ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-width` | float | 2 | Set the width of the stroke.

### Example Implementations

- [demo/drawing/collarRod]: Example that uses a clamped end as boundary condition

- [element/drawingGallery]: Image gallery with drawing objects

## `pl-spring` element

#### Sample Element

```html
<pl-drawing width="200" height="200" grid-size="20">
    <pl-drawing-initial>
        <pl-spring x1=50 y1=40 width=140 draw-pin="true"></pl-spring>
        <pl-spring x1=20 y1=80 angle=20 width=120 height=20 interval=5></pl-spring>
        <pl-spring x1=20 y1=160 width=30 height=20 stroke-color="purple3"></pl-spring>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-spring.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 20 | `x` position for the start point for the spring, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 20 | `y` position for the start point for the spring, i.e., the vertical distance from the top border of the canvas.
`width` | float | 60 | Length of the spring.
`angle` | float | 0 | Angle of rotation around the start point of the spring. Angles are measured from the horizontal axis and are positive clockwise.
`height` | float | 40 | Height of the spring.
`interval` | float | 10 | Interval between each angled line. This interval is recalculated if the spring width is too short.
`x2` | float | - | `x` position for the end point for the spring, i.e., the horizontal distance from the left border of the canvas. By default, `(x2,y2)` are determined from `angle` and `width`. If `x2` and `y2` are provided, then `angle` and `width` are replaced.
`y2` | float | - | `y` position for the end point for the spring, i.e., the vertical distance from the top border of the canvas. By default, `(x2,y2)` are determined from `angle` and `width`. If `x2` and `y2` are provided, then `angle` and `width` are replaced.
`stroke-color` | string | black | Set the color of the spring ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-width` | float | 2 | Set the width of the stroke.
`draw-pin` | boolean | false | Draw points at the spring ends.

### Example Implementations

- [element/drawingGallery]: Image gallery with drawing objects

## `pl-pulley` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-pulley  x1="100" y1="150"  x2="20" y2="120" x3="140" y3="60" radius="40"  ></pl-pulley>
        <pl-pulley  x1="50" y1="40"  x2="50" y2="100" x3="160" y3="40" color="blue1" ></pl-pulley>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-pulley.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 40 | `x` position for the center of the pulley, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 40 | `y` position for the center of the pulley, i.e., the vertical distance from the top border of the canvas.
`x2` | float | 10 | `x` position for the first point defining the end of the pulley line, i.e., the horizontal distance from the left border of the canvas.
`y2` | float | 10 | `y` position for the first point defining the end of the pulley line, i.e., the vertical distance from the top border of the canvas.
`x3` | float | 120 | `x` position for the second point defining the end of the pulley line, i.e., the horizontal distance from the left border of the canvas.
`y3` | float | 60 | `y` position for the second point defining the end of the pulley line, i.e., the vertical distance from the top border of the canvas.
`alternative-path` | boolean | false | Selects the other tangent points at the pulley that connects to points `(x2,y2)` and `(x3,y3)`. By default, it draws the shortest path.
`radius` | float | 20 | Radius of the pulley.
`label` | string | - | Text to label the pulley.
`offsetx` | float | 2 | Horizontal distance of `label` from the center of the pulley.
`offsety` | float | 2 | Vertical distance of `label` from the center of the pulley.
`color` | string | gray | Set the fill color of the pulley ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-color` | string | black | Set the stroke color of the pulley.
`stroke-width` | float | 2 | Set the width of the stroke.

### Example Implementations

- [demo/drawing/pulley]: Example that includes a pulley system

- [element/drawingGallery]: Image gallery with drawing objects


## `pl-dimensions` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-rod        x1="60" y1="100" x2="120"  y2="40" height="60"></pl-rod>
        <pl-dimensions x1="60" y1="100" x2="120"  y2="40" ></pl-dimensions>
        <pl-dimensions x1="60" y1="100" x2="120"  y2="40" dim-offset="-40" stroke-color="brown" start-support-line="true" end-support-line="true"></pl-dimensions>
        <pl-dimensions x1="60" y1="100" x2="120"  y2="40" dim-offset="60"  dim-offset-angle="0" stroke-color="blue3" start-support-line="true" end-support-line="true"></pl-dimensions>
        <pl-dimensions x1="60" y1="100" x2="120"  y2="40" dim-offset="100" dim-offset-angle="-90" stroke-color="green3"></pl-dimensions>
        <pl-dimensions x1="60" y1="100" width="60" stroke-color="pink3" label="a"></pl-dimensions>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-dimensions.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 10 | `x` position for the start point for the line, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 10 | `y` position for the start point for the line, i.e., the vertical distance from the top border of the canvas.
`width` | float | 40 | Width of the line.
`angle` | float | 0 | Angle of rotation around the start point of the line. Angles are measured from the horizontal axis and are positive clockwise.
`x2` | float | - | `x` position for the end point for the line, i.e., the horizontal distance from the left border of the canvas. By default, `(x2,y2)` are determined from `angle` and `width`. If `x2` and `y2` are provided, then `angle` and `width` are replaced.
`y2` | float | - | `y` position for the end point for the line, i.e., the vertical distance from the top border of the canvas. By default, `(x2,y2)` are determined from `angle` and `width`. If `x2` and `y2` are provided, then `angle` and `width` are replaced.
`dim-offset` | float | 0 | By default, the dimension is placed between points `(x1,y1)` and `(x2,y2)`. When `dim-offset` is different than zero, the dimension is translated parallel to the direction defined by `(x1,y1)` and `(x2,y2)`, with an offset distance `dim-offset`.
`dim-offset-angle` | float  | - | When `dim-offset-angle` is defined,  the dimension has the orientation defined by `dim-offset-angle` about the point `(x1,y1)`, and the `dim-offset` is the distance from `(x1,y1)`.
`start-support-line` | boolean | false | When `true` it draws a dashed line connecting the reference point `(x1,y1)` and the point where the dimension line starts (which are different when `dim-offset` is not zero).
`end-support-line` | boolean | false | When `true` it draws a dashed line connecting the reference point `(x2,y2)` and the point where the dimension line finishes (which are different when `dim-offset` is not zero).
`label` | string | - | Text to label the dimension.
`offsetx` | float | 0 | Horizontal distance of `label` from the center of the dimension line.
`offsety` | float | 0 | Vertical distance of `label` from the center of the dimension line.
`stroke-color` | string | black | Set the color of the line ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-width` | float | 1 | Set the width of the stroke.
`draw-start-arrow` | boolean | true | Draw an arrow head at the start point of the line.
`draw-end-arrow` | boolean | true | Draw an arrow head at the end point of the line.
`arrow-head-width` | float | 1.5 | Scale factor for the width of the arrow head.
`arrow-head-length` | float | 1.5 | Scale factor for the length of the arrow head.

### Example Implementations

- [demo/drawing/liftingMechanism]: Example that includes dimensions

- [element/drawingGallery]: Image gallery with drawing objects


## `pl-arc-dimensions` element
```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-fixed-pin x1="80" y1="100" angle="50" color="turquoise1"></pl-fixed-pin>
        <pl-coordinates x1="80" y1="100" width="80"></pl-coordinates>
        <pl-arc-dimensions x1="80" y1="100" end-angle="50" label="\\theta" offsetx="5" offsety=-5 end-support-line="true"></pl-arc-dimensions>
    </pl-drawing-initial>
</pl-drawing>
```

<img src="pl-arc-dimensions.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 20 | `x` position for the center of the arc, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 20 | `y` position for the center of the arc, i.e., the vertical distance from the top border of the canvas.
`radius` | float | 40 | Radius of the arc.
`start-angle` | float | 0 | Start angle of the arc.  Angles are measured from the horizontal axis and are positive clockwise.
`end-angle` | float | 60 | End angle of the arc. Angles are measured from the horizontal axis and are positive clockwise. Arcs are formed from `start-angle` to `end-angle` going on clockwise orientation.
`start-support-line` | boolean | false | When `true` it draws a dashed line from the reference point `(x1,y1)` with width `1.5*radius` and orientation given by `start-angle`,
`end-support-line` | boolean | false | When `true` it draws a dashed line from the reference point `(x2,y2)` with width `1.5*radius` and orientation given by `end-angle`,
`draw-center` | boolean | false | Draw the center of the arc.
`draw-start-arrow` | boolean | false | Draw an arrow head at the `start-angle`.
`draw-end-arrow` | boolean | true | Draw an arrow head at the `end-angle`.
`label` | string | - | Text to label the arc angle.
`offsetx` | float | 0 | Horizontal distance of `label` from the center of the arc.
`offsety` | float | 0 | Vertical distance of `label` from the center of the arc.
`stroke-color` | string | black | Set the stroke color of the arc ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-width` | float | 1 | Set the width of the stroke.
`arrow-head-width` | float | 1 | Scale factor for the width of the arrow head.
`arrow-head-length` | float | 1 | Scale factor for the length of the arrow head.

### Example Implementations

- [demo/drawing/liftingMechanism]: Example that includes arc dimensions

- [demo/drawing/inclinedPlane]: Example that includes arc dimensions

- [element/drawingGallery]: Image gallery with drawing objects


## `pl-vector` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-point x1="100" y1="100" ></pl-point>
        <pl-line x1="20" y1="20" angle="45" width="240" dashed-size="4" stroke-width="1"></pl-line>
        <pl-vector x1="100" y1="100" width="80" angle="45" label="F"></pl-vector>
        <pl-vector x1="100" y1="100" width="80" angle="45" color="green3" anchor-is-tail="false"></pl-vector>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-vector.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 30 | `x` position for the anchor point of the vector, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 10 | `y` position for the anchor point of the vector , i.e., the vertical distance from the top border of the canvas.
`anchor-is-tail` | boolean | true | the anchor point `(x1,y1)` is the tail of the vector.
`width`  | float | 80 | Length of the vector.
`angle` | float | 0 | Angle of rotation around the starting point of the vector. Angles are measured from the horizontal axis and are positive clockwise.
`label` | string | - | Text to label the vector.
`offsetx` | float | 2 | Horizontal distance of `label` from the head of the vector.
`offsety` | float | 2 | Vertical distance of `label` from the head of the vector.
`color` | string | red3 | Set the color of the vector ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-width` | float | 3 | Set the width of the stroke.
`arrow-head-width` | float | 1 | Scale factor for the width of the arrow head.
`arrow-head-length` | float | 1 | Scale factor for the length of the arrow head.
`disregard-sense` | boolean| false | When `disregard-sense=false` both the location of the anchor and the angle should match within the tolerance. When `disregard-sense=true`, the correctness of the vector only considers the position of the anchor point and direction (i.e. the vector in the opposite direction is also considered as correct).
`draw-error-box` | boolean | - | Draw the error bounding box, where the location of the anchor point is accepted as correct.
`offset-forward` | float | 0 | Length of the bounding box measured from the anchor point in the same orientation of the vector.
`offset-backward` | float | width | Length of the bounding box measured from the anchor point in the opposite orientation of the vector.
`optional-grading` | boolean | false | When `true`, the grading algorithm will not assign point values for the object, but it won't penalize either.

More information about the grading attributes in the Grading section below.

### Example Implementations

- [demo/drawing/simpleTutorial]: Tutorial example that includes arrows (vectors)

- [demo/drawing/liftingMechanism]: Example that includes arrows (vectors)

- [demo/drawing/inclinedPlane]: Example that includes arrows (vectors)

- [element/drawingGallery]: Image gallery with drawing objects


## `pl-double-headed-vector` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-double-headed-vector x1="40" y1="120" width="120" color="blue" angle="-30"></pl-double-headed-vector>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-double-headed-vector.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 30 | `x` position for the anchor point of the vector, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 10 | `y` position for the anchor point of the vector , i.e., the vertical distance from the top border of the canvas.
`anchor-is-tail` | boolean | true | the anchor point `(x1,y1)` is the tail of the vector.
`width`  | float | 80 | Length of the vector.
`angle` | float | 0 | Angle of rotation around the starting point of the vector. Angles are measured from the horizontal axis and are positive clockwise.
`label` | string | - | Text to label the vector.
`offsetx` | float | 2 | Horizontal distance of `label` from the head of the vector.
`offsety` | float | 2 | Vertical distance of `label` from the head of the vector.
`color` | string | red3 | Set the color of the vector ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-width` | float | 3 | Set the width of the stroke.
`arrow-head-width` | float | 1 | Scale factor for the width of the arrow head.
`arrow-head-length` | float | 1 | Scale factor for the length of the arrow head.
`disregard-sense` | boolean| false | When `disregard-sense=false` both the location of the anchor and the angle should match within the tolerance. When `disregard-sense=true`, the correctness of the vector only considers the position of the anchor point and direction (i.e. the vector in the opposite direction is also considered as correct).
`draw-error-box` | boolean | - | Draw the error bounding box, where the location of the anchor point is accepted as correct.
`offset-forward` | float | 0 | Length of the bounding box measured from the anchor point in the same orientation of the vector.
`offset-backward` | float | width | Length of the bounding box measured from the anchor point in the opposite orientation of the vector.
`optional-grading` | boolean | false | When `true`, the grading algorithm will not assign point values for the object, but it won't penalize either.

### Example Implementations

- [demo/drawing/simpleTutorial]: Tutorial example that includes double arrows (vectors)

- [demo/drawing/liftingMechanism]: Example that includes double arrows (vectors)

- [demo/drawing/inclinedPlane]: Example that includes double arrows (vectors)

- [element/drawingGallery]: Image gallery with drawing objects



## `pl-arc-vector` element

#### Sample Element

```html
<pl-drawing width="200" height="200">
    <pl-drawing-initial>
        <pl-arc-vector x1="80" y1="80" label="M" radius="60" stroke-width="2"></pl-arc-vector>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-arc-vector.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 40 | `x` position for the center of the arc vector, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 40 | `y` position for the center of the arc vector, i.e., the vertical distance from the top border of the canvas.
`radius`  | float | 30 | Radius of the arc vector.
`start-angle` | float | 0 | Start angle of the arc.  Angles are measured from the horizontal axis and are positive clockwise.
`end-angle` | float | 210 | End angle of the arc vector. Angles are measured from the horizontal axis and are positive clockwise. Arcs are formed from `start-angle` to `end-angle` going on clockwise orientation.
`draw-center` | boolean | true | Draw the center of the arc vector.
`clockwise-direction` | boolean | true | Defines the orientation of the arc vector. Draw an arc vector in the clockwise direction by default.
`label` | string | - | Text to label the arc vector angle.
`offsetx` | float | 0 | Horizontal distance of `label` from the center of the arc vector.
`offsety` | float | 0 | Vertical distance of `label` from the center of the arc vector.
`color` | string | purple | Set the stroke color of the arc ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-width` | float | 3 | Set the width of the stroke.
`arrow-head-width` | float | 1 | Scale factor for the width of the arrow head.
`arrow-head-length` | float | 1 | Scale factor for the length of the arrow head.
`disregard-sense` | boolean| false | When `disregard-sense=true`, the correctness of the arc vector only considers the position of the anchor point.
`draw-error-box` | boolean | - | Draw the error bounding box, where the location of the anchor point is accepted as correct.

### Example Implementations

- [demo/drawing/simpleTutorial]: Tutorial example that includes arc vectors 

- [demo/drawing/collarRod]: Example that includes arc vectors 

- [element/drawingGallery]: Image gallery with drawing objects


## `pl-distributed-load` element

#### Sample Element

```html
  <pl-drawing  width="200" height="200">
      <pl-drawing-initial>
          <pl-distributed-load x1="50" y1="40" width="60" ></pl-distributed-load>
          <pl-distributed-load x1="100" y1="160" width="80" w1="0" w2="40" color="green3" anchor-is-tail="false" stroke-width="2"></pl-distributed-load>
          <pl-distributed-load x1="160" y1="60" width="80" w1="30" w2="60" angle="90" color="brown"></pl-distributed-load>
      </pl-drawing-initial>
  </pl-drawing>
```
<img src="pl-distributed-load.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 20 | `x` position for the center of the baseline, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 20 | `y` position for the center of the baseline, i.e., the vertical distance from the top border of the canvas.
`anchor-is-tail` | boolean | true | the anchor point `(x1,y1)` is the tail of the vector.
`width`  | float | 40 | Range of the distributed load.
`spacing` | float | 20 | Spacing between the vectors.
`w1` | float | 40 | Height of the distributed load at the start of the range.
`w2` | float | 40 | Height of the distributed load at the end of the range.
`angle` | float | 0 | Angle of rotation around the center of the baseline, i.e., point `(x1,y1)`. Angles are measured from the horizontal axis and are positive clockwise.
`label1` | string | - | Text to label the height of the vectors at the start of the range.
`offsetx1` | float | 2 | Horizontal distance of `label1` from the vector at the start of the range.
`offsety1` | float | 2 | Vertical distance of `label1` from the vector at the start of the range.
`label2` | string | - | Text to label the height of the vectors at the start of the range.
`offsetx2` | float | 2 | Horizontal distance of `label2` from the vector at the start of the range.
`offsety2` | float | 2 | Vertical distance of `label2` from the vector at the start of the range.
`color` | string | blue | Set the stroke color of the arc ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-width` | float | 3 | Set the width of the stroke.
`arrow-head-width` | float | 1 | Scale factor for the width of the arrow head.
`arrow-head-length` | float | 1 | Scale factor for the length of the arrow head.
`disregard-sense` | boolean| false | When `disregard-sense=false` both the location of the anchor and the angle should match within the tolerance. When `disregard-sense=true`, the correctness of the vector only considers the position of the anchor point and direction (i.e. the vector in the opposite direction is also considered as correct).
`draw-error-box` | boolean | - | Draw the error bounding box, where the location of the anchor point is accepted as correct.
`offset-forward` | float | 0 | Length of the bounding box measured from the anchor point in the same orientation of the distributed load.
`offset-backward` | float | max(w1,w2) | Length of the bounding box measured from the anchor point in the opposite orientation of the distributed load.

### Example Implementations

- [demo/drawing/simpleTutorial]: Tutorial example that includes distributed loads 

- [element/drawingGallery]: Image gallery with drawing objects


## `pl-controlled-line` element

#### Sample Element

```html
<pl-drawing  width="200" height="200">
    <pl-drawing-initial>
        <pl-controlled-line x1="40" y1="40" x2="120" y2="80" draw-error-box="true" offset-tol-x="20" ></pl-controlled-line>
        <pl-controlled-line x1="60" y1="140" x2="160" y2="140" color="blue" stroke-width="6" handle-radius="8" ></pl-controlled-line>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-controlled-line.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 20 | `x` position of one of the end points w.r.t the origin of the canvas (top/left corner), i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 40 | `y` position of one of the end points w.r.t the origin of the canvas (top/left corner), i.e., the vertical distance from the top border of the canvas.
`x2` | float | 40 | `x` position of one of the end points w.r.t the origin of the canvas (top/left corner), i.e., the horizontal distance from the left border of the canvas.
`y2` | float | 40 | `y` position of one of the end points w.r.t the origin of the canvas (top/left corner), i.e., the vertical distance from the top border of the canvas.
`draw-error-box` | boolean | - | Draw the error bounding box, where the location of the end points and control point are accepted as correct.
`offset-tol-x` | float | 0 | Tolerance offset in the horizontal direction. The error bounding box has horizontal dimension equals to `2*(tol + offset-tol-x)` where `tol` is defined as an attribute of `pl-drawing` (or the default is 1/2 grid). The end point is at the center of the bounding box.
`offset-tol-y` | float | 0 | Tolerance offset in the vertical direction. The error bounding box has vertical dimension equals to `2*(tol + offset-tol-y)` where `tol` is defined as an attribute of `pl-drawing` (or the default is 1/2 grid). The end point is at the center of the bounding box.
`color` | string | red | Set the color of the coordinate system ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) )
`stroke-width` | float | 4 | Set the width of the stroke.
`handle-radius` | float | 6 | Set the radius of the circle handles that define the end and control points.

### Example Implementations

- [demo/drawing/graphs]: Example that includes controlled lines for graph sketching 

- [demo/drawing/vMDiagrams]: Example that includes controlled lines for graph sketching 

- [element/drawingGallery]: Image gallery with drawing objects

## `pl-controlled-curved-line` element

#### Sample Element

```html
<pl-drawing  width="200" height="200">
    <pl-drawing-initial>
        <pl-controlled-curved-line x1="20" y1="20" x2="160" y2="20" x3="40" y3="140" draw-error-box="true"  offset-control-tol-x="20" offset-control-tol-y="30"></pl-controlled-curved-line>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-controlled-curved-line.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`x1` | float | 20 | `x` position of one of the end points w.r.t the origin of the canvas (top/left corner), i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 40 | `y` position of one of the end points w.r.t the origin of the canvas (top/left corner), i.e., the vertical distance from the top border of the canvas.
`x2` | float | 60 | `x` position of one of the end points w.r.t the origin of the canvas (top/left corner), i.e., the horizontal distance from the left border of the canvas.
`y2` | float | 40 | `y` position of one of the end points w.r.t the origin of the canvas (top/left corner), i.e., the vertical distance from the top border of the canvas.
`x3` | float | 40 | `x` position of the control point for the quadratic curve (middle point) w.r.t the origin of the canvas (top/left corner), i.e., the horizontal distance from the left border of the canvas.
`y3` | float | 60 | `y` position of the control point for the quadratic curve (middle point) w.r.t the origin of the canvas (top/left corner), i.e., the vertical distance from the top border of the canvas.
`draw-error-box` | boolean | - | Draw the error bounding box, where the location of the end points and control point are accepted as correct.
`offset-tol-x` | float | 0 | Tolerance offset in the horizontal direction for the end points. The error bounding box has horizontal dimension equals to `2*(tol + offset-tol-x)` where `tol` is defined as an attribute of `pl-drawing` (or the default is 1/2 grid). The end point is at the center of the bounding box.
`offset-tol-y` | float | 0 | Tolerance offset in the vertical direction for the end points. The error bounding box has vertical dimension equals to `2*(tol + offset-tol-y)` where `tol` is defined as an attribute of `pl-drawing` (or the default is 1/2 grid). The end point is at the center of the bounding box.
`offset-control-tol-x` | float | 0 | Tolerance offset in the horizontal direction for the control point. The error bounding box has horizontal dimension equals to `2*(tol + offset-tol-x)` where `tol` is defined as an attribute of `pl-drawing` (or the default is 1/2 grid). The control point is at the center of the bounding box.
`offset-control-tol-y` | float | 0 | Tolerance offset in the vertical direction for the control point. The error bounding box has vertical dimension equals to `2*(tol + offset-tol-y)` where `tol` is defined as an attribute of `pl-drawing` (or the default is 1/2 grid). The control point is at the center of the bounding box.
`color` | string | red | Set the color of the coordinate system ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-width` | float | 4 | Set the width of the stroke.
`handle-radius` | float | 6 | Set the radius of the circle handles that define the end and control points.

### Example Implementations

- [demo/drawing/graphs]: Example that includes controlled curved lines for graph sketching 

- [demo/drawing/vMDiagrams]: Example that includes controlled curved lines for graph sketching 

- [element/drawingGallery]: Image gallery with drawing objects

## `pl-text` element

#### Sample Element

```html
<pl-drawing  width="200" height="200" grid-size="0">
    <pl-drawing-initial>
        <pl-text x1="20" y1="40" label="Moment of inertia:" latex="false"></pl-text>
        <pl-text x1="20" y1="80" label="\\int_A y^2 dA" ></pl-text>
    </pl-drawing-initial>
</pl-drawing>
```
<img src="pl-text.png" width=50%>

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`label` | string | - | Text to be added.
`latex` | boolean | true | Adds the text in `label` using latex. Otherwise, uses Times New Romans.
`font-size` | float | 16 | Font size.
`x1` | float | 20 | `x` position for the top-left corner of the text, i.e., the horizontal distance from the left border of the canvas.
`y1` | float | 20 | `y` position for the top-left corner of the text, i.e., the vertical distance from the top border of the canvas
`offsetx` | float | 0 | Offset in x direction from `x1`
`offsety` | float | 0 | Offset in y direction from `y1`

### Example Implementations

- [element/drawingGallery]: Image gallery with drawing objects


# Creating group of elements

The element `pl-drawing-group` combines several elements as a group, to allow groups of elements to be turned visible or not.

```html
<pl-drawing>
  <pl-drawing-initial>

      <pl-drawing-group visible="true">
          <!-- objects here will be displayed -->
      </pl-drawing-group>

      <pl-drawing-group visible="false">
          <!-- objects here will not be displayed -->       
      </pl-drawing-group>
</pl-drawing>
```

### Example Implementations

- [demo/drawing/simpleTutorial]: Example where the attribute `visible` is set in server.py


# Elements to set up a grading canvas

The element `pl-drawing-answer` is required when setting a drawing canvas for grading, but there are other elements as well that can be helpful. The example below illustrates typical parts of a grading canvas.

#### Sample Element

```html
<pl-drawing grid-size="20" gradable="true" answers-name="box" width="320">

    <pl-drawing-answer draw-error-box="true">
        <pl-vector x1="160" y1="160"  angle="-45"></pl-vector>
    </pl-drawing-answer>

    <pl-drawing-initial>
        <pl-coordinates x1="160" y1="160" width="100" angle="0" label="A" offsetx=-20></pl-coordinates>
    </pl-drawing-initial>

    <pl-controls>
        <pl-controls-group label="Graded objects:" >
            <pl-drawing-button type="pl-vector"></pl-drawing-button>
        </pl-controls-group>
        <pl-controls-group label="Delete button:">
            <pl-drawing-button type="delete"></pl-drawing-button>
        </pl-controls-group>
    </pl-controls>
</pl-drawing>
```

<img src="pl-vector-grading-canvas-example.png" width=70%>


## `pl-drawing-answer` element

This element will wrap all the elements that will be graded (checked for correctness).

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`draw-error-box` | boolean | false | When `true`, the objects that are placed inside `pl-drawing-answer` will be displayed with their respective error bounding boxes in the answer panel.

In the example above, `pl-vector` is the only object that is graded. The corresponding answer panel is given as:

<img src="pl-vector-correct-answer.png" width=50%>

## `pl-drawing-initial` element

This element will wrap all the elements included in the grading canvas that will not be graded. The objects from `pl-drawing-initial` and `pl-drawing-answer` are combined when showing the correct answer in the correct panel.

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`draw-error-box` | boolean | false | When `true`, the objects that are placed inside `pl-drawing-initial` will be displayed with their respective error bounding boxes in the answer panel.

The final version of a question should not have the attribute `draw-error-box`. However this attribute can be helpful during the process of creating a question. Authors have the option of starting the grading canvas including all the objects in `pl-drawing-initial` with
`draw-error-box=true`, to see how the graded objects are placed in the canvas, and if the default tolerances are reasonable for the specific question, or if adjustments are needed. Once the question is completed, the objects that are expected to be graded can be removed from `pl-drawing-initial` and added to `pl-drawing-answer`. The author can decide if the students should see the error box when the correct answer is displayed. By default, `draw-error-box="false"`.

## `pl-controls` element

The element `pl-controls` will add the buttons that allows students to place objects in the canvas. The element `pl-controls-group` can be used to group buttons that have similar properties, for example, graded and non-graded objects.

```html
<pl-controls>
  <pl-controls-group label="Graded objects:" >
      <pl-drawing-button type="pl-vector"></pl-drawing-button>
  </pl-controls-group>
  <pl-controls-group label="Delete button:">
      <pl-drawing-button type="delete"></pl-drawing-button>
  </pl-controls-group>
</pl-controls>
```

### Example Implementations

The example [demo/drawing/gradeVector] illustrates all the `pl-drawing-button`
that are currently implemented.

<img src="pl-all-buttons.png" width=70%>

## `pl-drawing-buttons` element

#### To insert a point:

```html
<pl-drawing-button type="pl-point"></pl-drawing-button>
```

This button adds a point to the canvas. The grading algorithm will check if the submitted point is within the error box. By default, the error box for `pl-point` is a square centered at the correct point, with side of length `tol = 0.5*grid-size`. The tolerance `tol` is an attribute of `pl-drawing` to make sure that all elements use the same tolerance.

<img src="pl-point-error-box.png" width=30%>

#### To insert a vector:

```html
<pl-drawing-button type="pl-vector"></pl-drawing-button>
```
This button adds a vector to the canvas. A vector is marked as correct when the position of the anchor point (tail of the vector) is within the error bounding box and the absolute error of the angle is less than `angle-tol`.

 By default, the error box for `pl-vector` is a rectangle aligned with direction of the vector. The width of the rectangle is `tol` and the height is `hb + hf`, as illustrated below. `hb = offset-backward + tol` and `hf = offset-forward + tol`. The attribute `offset-backward` is set to the length of the vector by default. The attribute `offset-forward` is set to zero by default. The tolerances `tol` and `angle-tol` are attributes of `pl-drawing` to make sure that all elements use the same tolerance.

<img src="pl-vector-error-box-zoom.png" width=50%>

If the orientation of the vector is not important, so that vectors `p` and `-p` are both considered correct, the attribute `disregard-sense` should be set to `true`.

If a vector is expected as a correct answer, but the author does not want to assign a grade to it, the attribute `optional-grading` can be set to `true`. In this case, the grading algorithm will not assign points to the vector, but will not penalize students either by considering it as extra objects.


#### To insert an arc vector:

```html
<pl-drawing-button type="pl-arc-vector-CWW"></pl-drawing-button>
<pl-drawing-button type="pl-arc-vector-CW"></pl-drawing-button>
```
This button adds an arc vector to the canvas. The arc vector is marked as correct when the position of the anchor point (center of the arc vector) is within the error bounding box and the orientation is correct.

By default, the error box for `pl-arc-vector` is a square centered at the anchor point, with side of length `tol = 0.5*grid-size`. The tolerance `tol` is an attribute of `pl-drawing` to make sure that all elements use the same tolerance.

If the orientation of the arc vector is not important (both clockwise and counter-clockwise orientations are accepted), the attribute `disregard-sense` should be set to `true`.

#### To insert a distributed load:

```html
<pl-drawing-button type="pl-distributed-load" w1="20"  anchor_is_tail="true"></pl-drawing-button>
<pl-drawing-button type="pl-distributed-load" w1="20"  anchor_is_tail="false"></pl-drawing-button>
<pl-drawing-button type="pl-distributed-load"></pl-drawing-button>
```
This button adds a distributed load to the canvas. A distributed load is marked as correct when the position of the anchor point (center of the baseline) is within the error bounding box, the absolute error of the angle is less than `angle-tol`, the absolute error of the range (interval) is less than `tol`, and the expected distribution is matched (if uniform, `w1 = w2` and for triangular load, `w1>w2` or `w2>w1` from submitted answer match the correct answer).

The error box for `pl-distributed-load` is  defined in the same way as `pl-vector` but considering the anchor point as the center of the baseline. If the orientation of the distributed load is not important, the attribute `disregard-sense` should be set to `true`.


#### To insert a "help" line:

```html
<pl-drawing-button type="help-line"></pl-drawing-button>
```
This button will add a line to the canvas that is not graded, but can be used by students to facilitate the placement of other objects.

#### To delete any object previously placed in the canvas

```html
<pl-drawing-button type="delete"></pl-drawing-button>
```

This button deletes objects that were previously placed on the canvas.


# Elements for sketching plots

<img src="pl-graph.png" width=50%>

```html
<pl-drawing-initial>
    <pl-axes origin='{"x": 80, "y": 200}'
             supporting-lines='[{"x":80},{"x":160},{"x":320}]'
             grid-label='[ {"axis": "x", "pos": 80,  "lab": "4" },
                       {"axis": "x", "pos": 160, "lab": "8" },
                       {"axis": "x", "pos": 320, "lab": "16" },
                       {"axis": "y", "pos": 40,  "lab": "2" },
                       {"axis": "y", "pos": -40, "lab": "-2" },
                       {"axis": "y", "pos": 80,  "lab": "4" },
                       {"axis": "y", "pos": -80, "lab": "-4" },
                       {"axis": "y", "pos": 120,"lab": "6" },
                       {"axis": "y", "pos": -120,"lab": "-6" }]' >
    </pl-axes>

    <pl-graph-line origin='{"x": 80, "y": 200}'
                   end-points='[{"x": 0, "y": 0}, {"x": 80, "y": 80}, {"x": 40, "y": 80}]'
                   offset-control-tol-x="20">
    </pl-graph-line>

    <pl-graph-line origin='{"x": 80, "y": 200}'
                   end-points='[{"x": 80, "y": -80}, {"x": 160, "y": -80}]'
                   offset-control-tol-y="30"
                   end-gradients='[-2,2]' >
    </pl-graph-line>

    <pl-graph-line origin='{"x": 80, "y": 200}'
                   end-points='[{"x": 160, "y": -80}, {"x": 320, "y": 0}]' >
    </pl-graph-line>
</pl-drawing-initial>
```

### Example Implementations

- [demo/drawing/graphs]: Example that highlights graph sketching 

## `pl-axes` element

A `pl-axes` element adds two axes to define the coordinate plane for sketching plots.

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`origin` | string | '{"x": 0, "y": 0}' | Position of the origin of the coordinate system w.r.t the origin of the canvas (top/left corner). "x" is the horizontal distance from the left border of the canvas. "y" is the vertical distance from the top border of the canvas.
`xneg` | float | 20 | Length of the negative part of the x-axis.
`yneg` | float | 160 | Length of the negative part of the y-axis.
`xpos` | float | 400 | Length of the positive part of the x-axis.
`ypos` | float | 160 | Length of the positive part of the y-axis.
`label-x` | string | 'x' | Text to label the x-axis.
`offsetx-label-x` | float | 0 | Horizontal offset distance of `label-x`.
`offsety-label-x` | float | 0 | Vertical offset distance of `label-x`.
`label-y` | string | 'y' | Text to label the y-axis.
`offsetx-label-y` | float | -30 | Horizontal offset distance of `label-y`.
`offsety-label-y` | float | -10 | Vertical offset distance of `label-y`.
`supporting-lines` | string | | Add additional grid lines to help with the sketching. For example, '[{"x":80},{"y":40}]' adds a vertical line passing through position `x=80` with respect to `origin`, i.e., the origin of the coordinate system defined by the plot axes. It also adds a horizontal line passing through `y=40` with respect to `origin`.
`grid-label` | string | | Add labels to specified grid points. For example, '[ {"axis": "x", "pos": 80,  "lab": "4" } ]' adds the label `4` at position `x=80` with respect to `origin`. If additional adjustment of the position of the label is needed, this attribute can have two additional optional keys: `offsetx` and `offsety`, i.e., '[ {"axis": "x", "pos": 80,  "lab": "4", "offsetx": 10, "offsety":20 } ]'
`color` | string | black | Set the color of the coordinate system ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-width` | float | 2 | Set the width of the stroke.

## `pl-graph-line` element

A `pl-graph-line` element adds straight or quadratic lines to plots. It wraps the elements `pl-controlled-line` and `pl-controlled-curved-line` so that the end and control points can be defined with respect to the origin of the plot, instead of the origin of the canvas. When only two points are given, it draws straight lines. If three points are given, it draws a quadratic curve. It also provides an option to create quadratic curves using the gradient information of the end points, instead of giving the position of the control point.

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`origin` | string | '{"x": 0, "y": 0}' | Position of the origin of the coordinate system w.r.t the origin of the canvas (top/left corner). "x" is the horizontal distance from the left border of the canvas. "y" is the vertical distance from the top border of the canvas.
`end-points` | string | | Provides the coordinates of the end points of the line w.r.t `origin`, i.e., the origin of the coordinate system defined by the plot axes. For example, a straight line is defined by two end points, given by `end-points='[{"x": 80, "y": -80}, {"x": 160, "y": -80}]'`. To plot a quadratic curve, the control point coordinates can be provided as the third element of the list, i.e., `end-points='[{"x": 0, "y": 0}, {"x": 80, "y": 80}, {"x": 40, "y": 80}]'`.
`end-gradients` | string | | Provides the derivative of the line at the end points. This information is used to determine the position of the control point when plotting quadratic curves. Note that only one of the options can be used to plot quadratic curves: either provide `end-gradients` or the third point in the list `end-points`.
`draw-error-box` | boolean | - | Draw the error bounding box, where the location of the end points and control point are accepted as correct.
`offset-tol-x` | float | 0 | Half the length of the bounding box in the x-direction. The end point is at the center of the bounding box.
`offset-tol-y` | float | 0 | Half the length of the bounding box in the y-direction. The end point is at the center of the bounding box.
`offset-control-tol-x` | float | 0 | Half the length of the bounding box in the x-direction. The control point is at the center of the bounding box.
`offset-control-tol-y` | float | 0 | Half the length of the bounding box in the y-direction. The control point is at the center of the bounding box.
`color` | string | red | Set the color of the coordinate system ( [PL colors](https://prairielearn.readthedocs.io/en/latest/course/#colors) or [HTML colors](https://htmlcolorcodes.com/color-chart/) ).
`stroke-width` | float | 4 | Set the width of the stroke.

<!-- Reference links -->
[demo/drawing/liftingMechanism]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/drawing/liftingMechanism
[demo/drawing/pulley]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/drawing/pulley
[demo/drawing/vmDiagrams]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/drawing/vmDiagrams
[demo/drawing/inclinedPlane]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/drawing/inclinedPlane
[demo/drawing/collarRod]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/drawing/collarRod
[demo/drawing/simpleTutorial]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/drawing/simpleTutorial
[demo/drawing/graphs]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/drawing/graphs
[demo/drawing/gradeVector]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/drawing/gradeVector 

