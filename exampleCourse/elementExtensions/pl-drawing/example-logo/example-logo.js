class PrairieLearnLogo extends PLDrawingBaseElement {
    static generate(canvas, options, submittedAnswer) {
        fabric.Image.fromURL(options.image_url, (obj) => {
            if (!('id' in obj)) {
                obj.id = PLDrawingApi.generateID();
            }

            obj.set({
                'left': options.left,
                'top': options.top,
                'angle': options.angle,
                'originX': 'center',
                'originY': 'center',
            });
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
};

PLDrawingApi.registerElements('example-logo', {
    'pl-prairielearn-logo': PrairieLearnLogo
});
