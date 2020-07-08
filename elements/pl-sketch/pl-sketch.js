/* eslint-disable */

var size = 5;
var color = '#000000';
var curTool = null;

function changeTool(tool, sketchpad) {
    if (tool === curTool) {
        return;
    }
    if (tool === 'pen') {
        size = 5;
        curTool = 'pen';
        $('#pen').css('background', '#C0C0C0');
        $('#eraser').css('background', '#FAFAFA');
    } else {
        size = 30;
        color = '#FFF';
        curTool = 'eraser';
        $('#eraser').css('background', '#C0C0C0');
        $('#pen').css('background', '#FAFAFA');
    }
    sketchpad.penSize = size;
    sketchpad.color = color;
}

function updateColor(col, sketchpad) {
    color = col;
    $('.pl-sketch-color-icon').css('backgroundColor', color);
    if (curTool === 'pen') {
        sketchpad.color = color;
    }
}

var waitForFinalEvent = (function () {
  var timers = {};
  return function (callback, ms, uniqueId) {
    if (!uniqueId) {
      uniqueId = "Don't call this twice without a uniqueId";
    }
    if (timers[uniqueId]) {
      clearTimeout (timers[uniqueId]);
    }
    timers[uniqueId] = setTimeout(callback, ms);
  };
})();

$(function() {
    var width = $('#pl-sketch-canvas').parent().width() * .8;
    var height = $('#pl-sketch-canvas').parent().height() * 3;
    var sketches_string = $('#pl-sketch-json').html();
    var sketchpad;
    if (sketches_string.length != 0) {
        sketches_string = sketches_string.replace(/'/g, '!@#$%');
        sketches_string = sketches_string.replace(/"/g, '\'');
        sketches_string = sketches_string.replace(/!@#\$%/g, '"');

        var strokes = JSON.parse(sketches_string);
        strokes = strokes.sketches;
        strokes = strokes.replace(/'/g, '"');
        strokes = JSON.parse(strokes);
        var sketchpadObject = {};
        sketchpadObject['width'] = width;
        sketchpadObject['height'] = height;
        sketchpadObject['element'] = '#pl-sketch-canvas';
        sketchpadObject['strokes'] = strokes['strokes'];
        sketchpadObject['undoHistory'] = strokes['undoHistory'];
        sketchpad = new Sketchpad(sketchpadObject);
    } else {
        sketchpad = new Sketchpad({
            element: '#pl-sketch-canvas',
            width: width,
            height: height
        });
    }

    $(window).resize(function () {
        waitForFinalEvent(function(){
          let sketches = sketchpad.toObject();
          console.log(sketches);
          let width = $('#pl-sketch-canvas').parent().width() * .8;
          sketches.width = width;
          sketches.element = '#pl-sketch-canvas';
          console.log(sketches);
          sketchpad = new Sketchpad(sketches);
        }, 500, 'canvas resize');
    });

    $('#pen').on('click', () => { changeTool('pen', sketchpad); });
    $('#eraser').on('click', () => { changeTool('eraser', sketchpad); });
    $('#undo').on('click', () => { sketchpad.undo(); });
    $('#redo').on('click', () => { sketchpad.redo(); });
    changeTool('pen', sketchpad);

    $('#color-picker').on('click', (ev) => {
        $('#color-popup').toggleClass("pl-sketch-hidden");
    });

    $('.pl-sketch-circle').on('click', (ev) => {
        updateColor(ev.currentTarget.style.backgroundColor, sketchpad);
    });

    $('.question-form').on('submit', () => {
        $('#pl-sketch-input').val(JSON.stringify(sketchpad.toObject()));
    });
})
