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
        sketchpad.penSize = size;
        sketchpad.color = color;
    } else {
        size = 30;
        curTool = 'eraser';
        $('#eraser').css('background', '#C0C0C0');
        $('#pen').css('background', '#FAFAFA');
        sketchpad.penSize = size;
        sketchpad.color = '#FFF';
    }
}

function updateColor(col, sketchpad) {
    color = col;
    $('.pl-sketch-color-icon').css('backgroundColor', color);
    if (curTool === 'pen') {
        sketchpad.color = color;
    }
}

$(function() {
    var width = 600;
    var height = 700;
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
