# `pl-overlay` element

The overlay element allows existing PrairieLearn and HTML elements to be layered on top of one another in arbitrary positions.

## Sample element

![Screenshot of the pl-overlay element](pl-overlay.png)

```html title="question.html"
<pl-overlay width="400" height="400" clip="false">
  <pl-background>
    <pl-drawing width="398" height="398" hide-answer-panel="false">
      <pl-drawing-initial>
        <pl-triangle x1="50" y1="350" x2="350" y2="350" x3="350" y3="50"></pl-triangle>
      </pl-drawing-initial>
    </pl-drawing>
  </pl-background>
  <pl-location left="200" top="375"> $$3$$ </pl-location>
  <pl-location left="375" top="200"> $$3$$ </pl-location>
  <pl-location left="170" top="170">
    <pl-number-input
      answers-name="c"
      show-help-text="false"
      show-placeholder="false"
      size="1"
    ></pl-number-input>
  </pl-location>
</pl-overlay>
```

## `pl-overlay` Customizations

| Attribute | Type    | Default | Description                                                          |
| --------- | ------- | ------- | -------------------------------------------------------------------- |
| `clip`    | boolean | true    | If true, children will be cut off when exceeding overlay boundaries. |
| `height`  | float   | —       | The height of the overlay canvas in pixels.                          |
| `width`   | float   | —       | The width of the overlay canvas in pixels.                           |

## `pl-location` Customizations

| Attribute | Type   | Default    | Description                                                                                           |
| --------- | ------ | ---------- | ----------------------------------------------------------------------------------------------------- |
| `bottom`  | float  | —          | The y coordinate of the child element (relative to the bottom of the overlay)                         |
| `halign`  | string | `"center"` | Specifies the horizontal alignment of the contents. Can be one of `"left"`, `"center"`, or `"right"`. |
| `left`    | float  | —          | The x coordinate of the child element (relative to the left of the overlay)                           |
| `right`   | float  | —          | The x coordinate of the child element (relative to the right of the overlay)                          |
| `top`     | float  | —          | The y coordinate of the child element (relative to the top of the overlay)                            |
| `valign`  | string | `"middle"` | Specifies the vertical alignment of the contents. Can be one of `"top"`, `"middle"`, or `"bottom"`.   |

## `pl-background` Customizations

The `pl-background` child tag does not have any extra attributes that need to be set. All relevant positioning and sizing information is obtained from the tag's contents.

## Details

An overlay is pre-defined as a "overlay area" with a static size. By default, elements that exceed these boundaries will get partially or totally cut off.

A background can be specified by wrapping HTML in a `<pl-background>` tag. If the contents of `<pl-background>` don't have a fixed size (e.g. using `<pl-figure>`, which uses a responsive width), then you should explicitly specify at least a `width` on `<pl-overlay>` to ensure that children will be displayed at the expected location no matter how big the browser viewport is. However, if the contents of `<pl-background>` have a fixed size (e.g. using `<pl-drawing width="500">`), then manually specifying a `width`/`height` on `<pl-overlay>` is not necessary.

Floating child elements are wrapped with a `<pl-location>` tag that specifies the position relative to some defined edge of the overlay area using `left`, `right`, `top`, and `bottom`. Anything inside the location tag will be displayed at that position. Children are layered in the order they are specified, with later child elements being displayed on top of those defined earlier.

## Example implementations

- [element/overlay]

---

[element/overlay]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/overlay
