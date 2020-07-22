/* eslint-disable */

window.PLSketchApi = {
    'sketchpad': {},
    'color': '#000000',
    'tool': null,

    changeTool: function(toolName) {
        if (toolName === this.tool) {
            return;
        }
        if (toolName === 'pen') {
            size = 5;
            this.tool = 'pen';
            $('#pen').css('background', '#C0C0C0');
            $('#eraser').css('background', '#FAFAFA');
            this.sketchpad.penSize = size;
            this.sketchpad.color = this.color;
        } else {
            size = 30;
            this.tool = 'eraser';
            $('#eraser').css('background', '#C0C0C0');
            $('#pen').css('background', '#FAFAFA');
            this.sketchpad.penSize = size;
            this.sketchpad.color = '#FFF';
        }
    },

    updateColor: function(colorName) {
        this.color = colorName;
        $('.pl-sketch-color-icon').css('backgroundColor', this.color);
        if (this.tool === 'pen') {
            this.sketchpad.color = this.color;
        }
    },

    setupSketchpad: function(width, height, past_sketches, uuid) {
        let element = '#pl-sketch-canvas-' + uuid;
        var sketchpadObject = {};
        sketchpadObject['width'] = width;
        sketchpadObject['height'] = height;
        sketchpadObject['element'] = element;
        if (!jQuery.isEmptyObject(past_sketches)) {
          sketchpadObject['strokes'] = past_sketches['strokes'];
          sketchpadObject['undoHistory'] = past_sketches['undoHistory'];
          console.log(past_sketches);
        }
        this.sketchpad = new Sketchpad(sketchpadObject);

        $('#pen').on('click', () => { this.changeTool('pen'); });
        $('#eraser').on('click', () => { this.changeTool('eraser'); });
        $('#undo').on('click', () => { this.sketchpad.undo(); });
        $('#redo').on('click', () => { this.sketchpad.redo(); });
        this.changeTool('pen');

        $('#color-picker-' + uuid).on('click', (ev) => {
            $('#color-popup-' + uuid).toggleClass("pl-sketch-hidden");
        });

        $('.pl-sketch-circle').on('click', (ev) => {
            this.updateColor(ev.currentTarget.style.backgroundColor);
        });

        $('.question-form').on('submit', () => {
            $('#pl-sketch-input-' + uuid).val(JSON.stringify(this.sketchpad.toObject()));
        });
    }
}
