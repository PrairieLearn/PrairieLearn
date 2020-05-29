var parsons = {
    options: { can_indent: true, x_indent: 40 },
    indents: {},
//     lines: [],
    answer_lines: '-',
//     answer_contents: '',
};

parsons.initialize_indentation = function() {
    var submitted = $('#parsons-input').val();
    if (submitted) {
        var ids = submitted.split('-');
        _.each(ids, function(encoded) {
            var disaggregated = encoded.split(':');
            var id = disaggregated[0];
            var indent = disaggregated[1];
            parsons.indents[id] = indent;
            $('#' + id).addClass('indent' + indent)
        });
    }
}

parsons.remove_indent_classes = function(id) {
    parsons.indents[id] = 0;
    $('#' + id).removeClass('indent0 indent1 indent2 indent3 indent4 correct incorrect misaligned');
}

parsons.set_answer = function() {
    var dom_objs = $('#ul-answer').children();
    var ids = _.map(dom_objs, function(obj) { return obj.id + ':' + parsons.indents[obj.id]; }); 
    this.answer_lines = ids ? ids.join('-') : '-';
    console.log(this.answer_lines);
    $('#parsons-input').val(this.answer_lines);
    
//     var contents = '';
//     _.each(dom_objs, function(obj) {
//         var lineObject = parsons.getLineById(obj.id);
//         _.times(lineObject.indent, function() { contents += '  '; });
//         contents += lineObject.code + '\n';
//     });
//     this.answer_contents = contents;
//     console.log(contents);

//     this.set_answer();
}

// parsons.getLineById = function(id) {
//     return _.find(this.lines, { 'id': id });
// };

// parsons.clearFeedback = function(sortableId) {
//     return;
//     
// //       if (this.feedback_exists) {
// //           $("#ul-" + sortableId).removeClass("incorrect correct");
// //           var li_elements = $("#ul-" + sortableId + " li");
// //           $.each(this.FEEDBACK_STYLES, function(index, value) {
// //               li_elements.removeClass(value);
// //           });
// //       }
// //       this.feedback_exists = false;
// };

    parsons.update_indent = function(leftDiff, id) {
        current_indent = parseInt(parsons.indents[id]) || 0;
        
        parsons.remove_indent_classes(id)

        var new_indent = this.options.can_indent ? current_indent + Math.floor(leftDiff / this.options.x_indent) : 0;
        new_indent = Math.min(Math.max(0, new_indent), 4);
        parsons.indents[id] = new_indent;
        $('#' + id).addClass('indent' + new_indent)
    };

//     parsons.addLogEntry = function(entry) {
//         var state, previousState;
//         var logData = {
//             time: new Date(),
//             output: this.solutionHash(),
//             type: "action"
//         };
// 
//         if (this.options.trashId) {
//             logData.input = this.trashHash();
//         }
//         
//         if (entry.target) {
//             entry.target = entry.target.replace(this.id_prefix, "");
//         }
//         
//         // add toggle states to log data if there are toggles
//         var toggles = this._getToggleStates();
//         if (toggles) {
//             logData.toggleStates = toggles;
//         }
//         
//         state = logData.output;
//         
//         jQuery.extend(logData, entry);
//         this.user_actions.push(logData);
//         
//         //Updating the state history
//         if (this.state_path.length > 0) {
//             previousState = this.state_path[this.state_path.length - 1];
//             this.states[previousState] = logData;
//         }
//         
//         //Add new item to the state path only if new and previous states are not equal
//         if (this.state_path[this.state_path.length - 1] !== state) {
//             this.state_path.push(state);
//         }
//         // callback for reacting to actions
//         if ($.isFunction(this.options.action_cb)) {
//             this.options.action_cb.call(this, logData);
//         }
//     };



parsons.addSortableFunctionalityToHTML = function() {
//    if (window.prettyPrint) { 
//        prettyPrint();
//    }

//    $('#parsons-input').val("hi there");
    console.log($('#parsons-input').val())
    
    var sortable_functions = {
        start: function() { 
//          parsons.clearFeedback(sortableId); 
        },
        stop: function(event, ui) {
            if ($(event.target)[0] != ui.item.parent()[0]) {
                return;
            }
            parsons.update_indent(ui.position.left - ui.item.parent().position().left, ui.item[0].id);
//            parsons.updateHTMLIndent(ui.item[0].id);
            parsons.set_answer();
//          parsons.addLogEntry({type: "moveOutput", target: ui.item[0].id}, true);
        },
        receive: function(event, ui) {
            parsons.remove_indent_classes(ui.item[0].id)            
            
//            var ind = parsons.updateIndent(ui.position.left - ui.item.parent().position().left, ui.item[0].id);
//            parsons.updateHTMLIndent(ui.item[0].id);
            parsons.set_answer();
//          parsons.addLogEntry({type: "addOutput", target: ui.item[0].id}, true);
        },

        grid: this.options.can_indent ? [this.options.x_indent, 1 ] : false
    };
    var sortable = $("#ul-answer");
    sortable.sortable(sortable_functions).addClass("output");

    var trash_functions = {
        connectWith: sortable,
        start: function() { 
        },
        receive: function(event, ui) {
            parsons.remove_indent_classes(ui.item[0].id)            
            parsons.set_answer();
//          parsons.addLogEntry({type: "removeOutput", target: ui.item[0].id}, true);
        },
        stop: function(event, ui) {
//          if ($(event.target)[0] != ui.item.parent()[0]) {
//              // line moved to output and logged there
//              return;
//          }
//          parsons.addLogEntry({type: "moveInput", target: ui.item[0].id}, true);
        }
    };

    var unused = $("#ul-unused").sortable(trash_functions);
    sortable.sortable('option', 'connectWith', unused);
};

//(function(){
//    //    alert('this got called')
//    parsons.addSortableFunctionalityToHTML();
//})()

// $(parsons.addSortableFunctionalityToHTML())

$( document ).ready(function() {
    parsons.initialize_indentation()
    parsons.addSortableFunctionalityToHTML()    
});
