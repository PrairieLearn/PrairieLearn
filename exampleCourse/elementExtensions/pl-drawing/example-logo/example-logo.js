class PrairieLearnLogo extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    fabric.Image.fromURL(options.image_url, (obj) => {
      /* Generate a unique ID for this object if it doesn't have one */
      if (!('id' in obj)) {
        obj.id = PLDrawingApi.generateID();
      }

      /* Set the Fabric object's values from what we loaded */
      obj.set({
        left: options.left,
        top: options.top,
        angle: options.angle,
        originX: 'center',
        originY: 'center',
      });

      /* Disable the scaling controls */
      obj.setControlsVisibility({
        mt: false,
        mb: false,
        ml: false,
        mr: false,
        bl: false,
        br: false,
        tl: false,
        tr: false,
      });

      canvas.add(obj);
      submittedAnswer.registerAnswerObject(options, obj);
    });
  }

  static get_button_tooltip() {
    return 'Create PrairieLearn logo';
  }

  static get_button_icon() {
    return 'logo-icon.svg';
  }
}

PLDrawingApi.registerElements('example-logo', {
  'pl-prairielearn-logo': PrairieLearnLogo,
});
