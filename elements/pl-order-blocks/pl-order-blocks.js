/* eslint-env jquery, browser */

const TABWIDTH = 50;    // defines how many px the answer block is indented by, when the student
                        // drags and indents a block
var MAX_INDENT = 4;     // defines the maximum number of times an answer block can be indented

function set_max_indent(event) {
    MAX_INDENT = event.target.getAttribute('indent');
}

function check_block(event, ui) {
    var block_parent_name = $(ui.item.parent()[0]).attr('name');
    var block_destination_name = event.target.getAttribute('name');
    if (block_parent_name !== block_destination_name) {
        return false;
    }
    return true;
}

function set_answer(event) {
    // We only care about when this function is fired
    // from an answer dropzone, aka dropzones with yellow backgrounds
    var textfield_name = event.target.getAttribute('name');
    var dom_objs = $('#' + textfield_name + '-dropzone').children();
    var student_answers_array = [];
    for (var i = 0; i < dom_objs.length; i++) {
        if (!$(dom_objs[i]).hasClass('info-fixed')){
            var answer_text = dom_objs[i].getAttribute('string');
            var uuid = dom_objs[i].getAttribute('uuid');
            var answer_indent = null;
            if (dom_objs[i].parentElement.classList.contains('enableIndentation')) {
                answer_indent = parseInt($(dom_objs[i]).css('marginLeft').replace('px', ''));
                answer_indent = Math.round(answer_indent / TABWIDTH); // get how many times the answer is indented
            }

            var answer_json = {'inner_html': answer_text, 'indent': answer_indent, 'uuid': uuid};
            student_answers_array.push(answer_json);
        }
    }

    textfield_name = event.target.getAttribute('name');
    if (textfield_name === null){
        return;
    }
    textfield_name = '#' + textfield_name + '-input';
    $(textfield_name).val(JSON.stringify(student_answers_array));
}


function calculate_indent(ui, parent) {
    if (!parent[0].classList.contains('dropzone') ||
        !parent[0].classList.contains('enableIndentation')) {
        // don't indent on option panel or solution panel with indents explicitly disabled
        return 0;
    }

    let leftDiff = ui.position.left - parent.position().left;
    leftDiff = (Math.round(leftDiff / TABWIDTH) * TABWIDTH);
    let currentIndent = ui.item[0].style.marginLeft;
    if (currentIndent !== '') {
        leftDiff += parseInt(currentIndent);
    }

    // limit leftDiff to be in within the bounds of the drag and drop box
    // that is, at least indented 0 times, or at most indented by MAX_INDENT times
    leftDiff = Math.min(leftDiff, (TABWIDTH * MAX_INDENT));
    leftDiff = Math.max(leftDiff, 0);

    return leftDiff;
}


$( document ).ready(function() {
    // Add drag and drop functionality for options elements that
    // has the pl-order-blocks-connected-sortable class code for the HTML popover
    $('.pl-order-blocks-connected-sortable').sortable({
        items: 'li:not(.info-fixed)',
        cancel: '.info',
        connectWith: '.pl-order-blocks-connected-sortable',
        placeholder: 'ui-state-highlight',
        create: function(event) {
            // when the sortable is created, we need to put the two functions here
            // to restore progress when the user refresh/submits an answer
            set_answer(event);
            set_max_indent(event);
        },
        sort: function(event, ui) {
            // update the location of the placeholder as the item is dragged
            let placeholder = ui.placeholder;
            let leftDiff = calculate_indent(ui, placeholder.parent());
            placeholder[0].style.marginLeft = leftDiff + 'px';
        },
        beforeStop: function(event, ui){
            if (!check_block(event, ui)) {
                $(this).sortable('cancel');
            }
        },
        stop: function(event, ui){
            // when the user stops interacting with the list
            let leftDiff = calculate_indent(ui, ui.item.parent());
            ui.item[0].style.marginLeft = leftDiff + 'px';
            set_answer(event);
        },
    });

    $('.enableIndentation').sortable('option', 'grid', [TABWIDTH, 1]);
    $('[data-toggle="popover"]').popover();
});
