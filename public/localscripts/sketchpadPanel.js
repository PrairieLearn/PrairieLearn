let curTool = null;
let color = '#000000';

function changeTool(tool, sketchpad) {
    if (tool === curTool) {
        return;
    }
    if (tool === 'pen') {
        size = 5;
        curTool = 'pen';
        $('#pen-panel').css('background', '#C0C0C0');
        $('#eraser-panel').css('background', '#FAFAFA');
        sketchpad.penSize = size;
        sketchpad.color = color;
    } else {
        size = 30;
        curTool = 'eraser';
        $('#eraser-panel').css('background', '#C0C0C0');
        $('#pen-panel').css('background', '#FAFAFA');
        sketchpad.penSize = size;
        sketchpad.color = '#FFF';
    }
}

function updateColor(col, sketchpad) {
    color = col;
    $('#color-panel').css('backgroundColor', color);
    if (curTool === 'pen') {
        sketchpad.color = color;
    }
}

$(function() {
    let sketchpad = new Sketchpad({
        element: '#pl-sketch-canvas-panel',
        width: 500,
        height: 600
    });

    $('#pen-panel').on('click', () => { changeTool('pen', sketchpad); });
    $('#eraser-panel').on('click', () => { changeTool('eraser', sketchpad); });
    $('#undo-panel').on('click', () => { sketchpad.undo(); });
    $('#redo-panel').on('click', () => { sketchpad.redo(); });
    changeTool('pen', sketchpad);

    $('#color-picker-panel').on('click', (ev) => {
        $('#color-popup-panel').toggleClass("pl-sketch-hidden");
    });

    $('.pl-sketch-circle').on('click', (ev) => {
        updateColor(ev.currentTarget.style.backgroundColor, sketchpad);
    });

    $('#attachSketchButton').on('click', () => { $('#pl-sketch-card').toggle(); });

    $('.attach-sketch-form').on('submit', () => { $('#sketches-panel').val(JSON.stringify(sketchpad.toObject())) });

    $('#download_sketch').on('click', () => {
        let canvas = document.getElementById('pl-sketch-canvas-panel');
        let image = canvas.toDataURL('image/png');
        $('#download_sketch').attr('href', image);
    });

    $('.saved-sketch').on('click', (ev) => {
        let file = ev.target.href;
        $.get(file, function(data) {
            let sketches = JSON.parse(data);
            let loaded_sketch = {
                element: '#pl-sketch-canvas-panel',
                width: 500,
                height: 600,
                strokes: sketches.strokes,
                undoHistory: sketches.undoHistory
            }
            sketchpad = new Sketchpad(loaded_sketch);
            $('#pl-sketch-card').show();
            $('#pl-sketch-panel').collapse('show');
        }, 'text');
        return false;
    });
});
