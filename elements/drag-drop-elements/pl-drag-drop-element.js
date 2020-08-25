/* eslint-env jquery, browser */

function set_answer(event) {
    /* We only care about when this function is fired
    / from an ANSWER DROPZONE, aka dropzones with yellow backgrounds */
    var textfield_name = event.target.getAttribute('name');
    var dom_objs = $('#' + textfield_name + '-dropzone').children();
    var temp = [];
    var indents = [];
    for (var i = 0; i < dom_objs.length; i++) {
        if (!$(dom_objs[i]).hasClass('info')){
            var answer_text = dom_objs[i].getAttribute('string');
            // console.log(answer_text);
            var answer_indent = parseInt($(dom_objs[i]).css('marginLeft').replace('px', ''));
            indents.push(answer_indent);
            answer_indent = Math.round((answer_indent - 5) / 50); //get how many times the answer is indented
            answer_text = answer_text + ':::' + answer_indent;
            temp.push(answer_text);
        }
    }

    textfield_name = event.target.getAttribute('name');
    if (textfield_name === null){
        return;
    }
    textfield_name = '#' + textfield_name + '-input';
    $(textfield_name).val(temp.join(',,,')); // use 3 commas as delimiter
}


function update_indent(leftDiff, id, ui) {
    if (!ui.item.parent()[0].classList.contains('dropzone')){
        //no need to support indent on MCQ option panel
        ui.item.style = 'margin-left: 5px;';
        return;
    }
    leftDiff = ui.position.left - ui.item.parent().position().left;
    var currentIndent = ui.item[0].style.marginLeft;
    if (parseInt(currentIndent) <= 5 && leftDiff < 0){
        return; //if answer is not indented, and the student drag it left
                // do nothing
    }

    leftDiff = (Math.round(leftDiff / 50) * 50);

    // leftDiff is the direction to move the MCQ answer tile, in px
    // we limit leftDiff to be increments of 50, whether positive or negative
    if (currentIndent != ''){
        leftDiff += parseInt(currentIndent); 
    }
    // limit leftDiff to be in [5, 205], within the bounds of the drag and drop box
    leftDiff = Math.min(Math.max(leftDiff, 5), 205);

    var hack = [5,55,105,155,205];
    if (hack.indexOf(leftDiff) === -1){
        var hack2 = leftDiff;
        //when the user drag a tile into the answer box for the first time
        //the snap to grid dragging doesnt apply
        //so we have to use a hack here to "snap the leftDiff number to the nearest grid number"
        leftDiff = hack.reduce(function(prev, curr) {
          return (Math.abs(curr - hack2) < Math.abs(prev - hack2) ? curr : prev);
        });

    }

    ui.item[0].style = 'margin-left: ' + Math.max(leftDiff, 5) + 'px;';
}


$( document ).ready(function() {
    //Add drag and drop functionality for options elements
    //that has the connectedSortable class
    // code for the HTML popover
    $('.connectedSortable').sortable({
        items: 'li:not(.info-fixed)',
        cancel: '.info',
        connectWith: '.connectedSortable',
        placeholder: 'ui-state-highlight',
        create: function(event){
            // when the sortable is created, we need to put the two functions here
            // to restore progress when the user refresh/submits an answer
            set_answer(event);
        },
        stop: function(event, ui){
            // when the user stops interacting with the list
            update_indent(ui.position.left - ui.item.parent().position().left, ui.item[0].id, ui);
            set_answer(event);
        },
    }).disableSelection();
    $('.dropzone').sortable({
        grid: [50, 1],
    });
    $('[data-toggle="popover"]').popover();
});