var parsons = {
    options: { can_indent: true, x_indent: 40 },
    indents: {},
    answer_lines: '-',
};

parsons.initialize_indentation = function() {
    /* globals $ */
    var submitted = $('#parsons-input').val();
    if (submitted) {
        var ids = submitted.split('-');
         /* globals _ */
        _.each(ids, function(encoded) {
            var disaggregated = encoded.split(':');
            var id = disaggregated[0];
            var indent = disaggregated[1];
            parsons.indents[id] = indent;
            $('#' + id).addClass('indent' + indent);
        });
    }
};

parsons.remove_indent_classes = function(id) {
    parsons.indents[id] = 0;
    $('#' + id).removeClass('indent0 indent1 indent2 indent3 indent4 correct incorrect misaligned');
};

parsons.set_answer = function() {
    var dom_objs = $('#ul-answer').children();
    var ids = _.map(dom_objs, function(obj) { return obj.id + ':' + parsons.indents[obj.id]; }); 
    this.answer_lines = ids ? ids.join('-') : '-';
    console.log(this.answer_lines);
    $('#parsons-input').val(this.answer_lines);
};

parsons.update_indent = function(leftDiff, id) {
        
    var current_indent = parseInt(parsons.indents[id]) || 0;
    parsons.remove_indent_classes(id);
    var new_indent = this.options.can_indent ? current_indent + Math.floor(leftDiff / this.options.x_indent) : 0;
    new_indent = Math.min(Math.max(0, new_indent), 4);
    parsons.indents[id] = new_indent;
    $('#' + id).addClass('indent' + new_indent);
};


parsons.addSortableFunctionalityToHTML = function() {
    console.log($('#parsons-input').val());
    
    var sortable_functions = {
        start: function() { 
        },
        stop: function(event, ui) {
            if ($(event.target)[0] != ui.item.parent()[0]) {
                return;
            }
            parsons.update_indent(ui.position.left - ui.item.parent().position().left, ui.item[0].id);
            parsons.set_answer();
        },
        receive: function(event, ui) {
            parsons.remove_indent_classes(ui.item[0].id);            
            parsons.set_answer();
        },

        grid: this.options.can_indent ? [this.options.x_indent, 1 ] : false,
    };
    var sortable = $('#ul-answer');
    sortable.sortable(sortable_functions).addClass('output');
   
    var trash_functions = {
        connectWith: sortable,
        start: function() { 
        },
        receive: function(event, ui) {
            parsons.remove_indent_classes(ui.item[0].id);            
            parsons.set_answer();
        },
        stop: function() {
        },
    };
    

    var unused = $('#ul-unused').sortable(trash_functions);
    sortable.sortable('option', 'connectWith', unused);
};

/*global document*/
$( document ).ready(function() {
    parsons.initialize_indentation();
    parsons.addSortableFunctionalityToHTML();    
});
