# `pl-card` element

Displays question content within a card-styled component. Optionally displays a header, footer, and/or image via tag attributes.

## Sample element

```html title="question.html"
<pl-card
  header="Header"
  title="Title"
  width="50%"
  img-bottom-src="https://via.placeholder.com/720x480"
>
  <pl-question-panel> This card is 50% width and has a bottom image. </pl-question-panel>
</pl-card>
```

## Customizations

| Attribute        | Type                                   | Default  | Description                            |
| ---------------- | -------------------------------------- | -------- | -------------------------------------- |
| `contents`       | string                                 | —        | Raw contents of the card body.         |
| `footer`         | string                                 | —        | Contents of the card footer.           |
| `header`         | string                                 | —        | Contents of the card header.           |
| `img-bottom-alt` | string                                 | —        | Alternative text for the bottom image. |
| `img-bottom-src` | string                                 | —        | Source URL for the bottom image.       |
| `img-top-alt`    | string                                 | —        | Alternative text for the top image.    |
| `img-top-src`    | string                                 | —        | Source URL for the top image.          |
| `subtitle`       | string                                 | —        | Contents of the card subtitle.         |
| `title`          | string                                 | —        | Contents of the card title.            |
| `width`          | `"25%"`, `"50%"`, `"75%"`, or `"auto"` | `"auto"` | Width of the card.                     |

## Details

The `pl-card` attributes mirror the options of [Bootstrap cards](https://getbootstrap.com/docs/5.3/components/card/). The `header` and `footer` tag attributes can include HTML tags alongside plaintext to allow for styling of their content.

## Example implementations

- [element/card]

---

[element/card]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/card
