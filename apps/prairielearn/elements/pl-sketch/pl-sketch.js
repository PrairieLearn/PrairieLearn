/* eslint-disable */

window.PLSketchApi = {
  sketchpad: {},
  color: '#000000',
  tool: null,

  changeTool: function (toolName) {
    if (toolName === this.tool) {
      return;
    }
    console.log(toolName);
    
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

  updateColor: function (colorName) {
    this.color = colorName;
    $('.pl-sketch-color-icon').css('backgroundColor', this.color);
    if (this.tool === 'pen') {
      this.sketchpad.color = this.color;
    }
  },

  setupSketchpad: function (width, height, uuid) {
    console.log('#undo-'+uuid);
    let element = '#pl-sketch-canvas-' + uuid;
    var sketchpadObject = {};
    sketchpadObject['width'] = width;
    sketchpadObject['height'] = height;
    sketchpadObject['element'] = element;
    let sketches_string = $('#pl-sketch-input-' + uuid).val();
    console.log(sketches_string.length);
    if (sketches_string.length != 0) {
        sketches_string = sketches_string.replace(/'/g, '!@#$%');
        sketches_string = sketches_string.replace(/"/g, '\'');
        sketches_string = sketches_string.replace(/!@#\$%/g, '"');
        let sketches = JSON.parse(sketches_string);
        let strokes = sketches['sketches'];
        strokes = strokes.replace(/'/g, '"');
        strokes = JSON.parse(strokes);

        sketchpadObject['strokes'] = strokes;
        sketchpadObject['undoHistory'] = sketches['undoHistory'];
    }
    this.sketchpad = new Sketchpad(sketchpadObject);

    $('#pen-' + uuid).on('click', () => {
      console.log("Pen with UUID: " + uuid + " was clicked");
      this.changeTool('pen');
    });
    $('#eraser-' + uuid).on('click', () => {
      console.log("Eraser with UUID: " + uuid + " was clicked");
      
      this.changeTool('eraser');
    });
    
    $('#undo-'+uuid).on('click', () => {
      this.sketchpad.undo();
      console.log("Undoing!");
    });
    $('#redo-' + uuid).on('click', () => {
      this.sketchpad.redo();
    });
    this.changeTool('pen');

    $('#color-picker-' + uuid).on('click', (ev) => {
      $('#color-popup-' + uuid).toggleClass('pl-sketch-hidden');
    });

    $('.pl-sketch-circle').on('click', (ev) => {
      this.updateColor(ev.currentTarget.style.backgroundColor);
    });

    $('.question-form').on('submit', () => {
      $('#pl-sketch-input-' + uuid).val(JSON.stringify(this.sketchpad.toObject()));
    });
  },
};
