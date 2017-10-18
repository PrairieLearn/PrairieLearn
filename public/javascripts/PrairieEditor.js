/**
 * PrairieEditor is currently a simple jQuery script that sets up ace editors
 * and configures a save button for each file.
 */
$(function() {

    // Ensure the CSRF token has been set
    if (! document.csrfToken)
        console.error('No CSRF token set, asynchronous requests will fail.');

    // Creates an XMLHttpRequest object that posts to the same URL as the editor
    var post = function(data, onComplete) {
        var xhr = new XMLHttpRequest();
        xhr.open("POST", document.URL, true);
        xhr.setRequestHeader('x-csrf-token', document.csrfToken);
        xhr.setRequestHeader("Content-Type", "application/json");

        xhr.onreadystatechange = function() {
            if (xhr.readyState == 4 && xhr.status == 200) {
                if (onComplete)
                    onComplete(xhr.responseText);
            }
        };

        if (data)
            xhr.send(JSON.stringify(data));

        return xhr;
    };

    // For each editable zone
    $('[data-edit]').each(function() {
        // Get file data
        var fileName = $(this).data('edit');
        var fileMode = $(this).data('mode');

        // Get IDs of editor and save button
        var editorId = $(this).attr('id');
        var saveId = $(this).data('save');
        var saveButton = $('#' + saveId);

        // Create an Ace editor instance
        var editor = ace.edit(editorId);
        editor.setTheme('ace/theme/monokai');
        editor.getSession().setMode('ace/mode/' + fileMode);

        // Enable the save button if the content is different from the current value
        var currentContent = editor.getValue();
        saveButton.attr('disabled', 'true');
        editor.getSession().on('change', function() {
            saveButton.attr('disabled', editor.getValue() == currentContent);
        });

        // When the save button is clicked
        saveButton.click(function() {

            post({
                action: 'save',
                file: fileName,
                content: editor.getValue()
            },
            function(response) {
                saveButton.attr('disabled', true);
                if (response != 'error') {
                    currentContent = editor.getValue();
                    generatePreview();
                }
            });

        })
    });

    var preview = $('#preview');
    function generatePreview() {
        post({ action: 'preview' }, function(response) {
            updatePreview(response);
        })
    };

    function updatePreview(value) {
        preview.html(value);
        MathJax.Hub.Queue(["Typeset", MathJax.Hub, "preview"]);

        var form = preview.find('form');

        form.submit(function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
        });

        preview.find('.question-save').hide();
        preview.find('.question-edit').hide();
        preview.find('.question-grade').click(function() {
            post({
                action: 'grade',
                form: form.serializeArray()
            }, function(response) {
                updatePreview(response);
            });
        });
        preview.find('.question-new-variant').click(function(e) {
            e.stopPropagation();
            e.preventDefault();
            generatePreview();
        });
    }

    // Initialize the preview and refresh button for the preview
    $('#new-preview').click(generatePreview);
    generatePreview();
});
//
// $(function() {
//
//     //var questionPath = "<%= %>";
//
//     $('.question-container .nav-link').click(function() {
//         var panel = $(this).attr('href').substring(1);
//         window.location.hash = panel.substring(0, panel.indexOf('-'));
//
//         if (! initialized[panel] && $('#' + panel).data('editable')) {
//             initialized[panel] = true;
//             $('#' + panel + '-editor').css('height', '400px');
//             var editor = ace.edit(panel + '-editor');
//             editor.$blockScrolling = Infinity;
//             window.editor = editor;
//
//             editor.setTheme("ace/theme/monokai");
//             editor.getSession().setMode("ace/mode/" + panel.substring(panel.indexOf('-') + 1));
//
//             var currentValue = editor.getValue();
//             $('#' + panel + ' .save-button')
//             .attr('disabled', 'true');
//             editor.getSession().on('change', function() {
//                 $('#' + panel + ' .save-button').attr('disabled',
//                 editor.getValue() == currentValue);
//             });
//
//             $('#' + panel + ' a[data-insert]').each(function() {
//                 var insertItem = $(this);
//                 var insertHtml = insertItem.data('insert');
//                 var cursor = insertHtml.indexOf('|');
//                 if (cursor >= 0) {
//                     insertHtml = insertHtml.substring(0, cursor) +
//                     insertHtml.substring(cursor + 1);
//                 }
//
//                 insertItem.click(function() {
//                     var curPos = editor.getCursorPosition();
//                     editor.getSession().insert(curPos, insertHtml);
//                     if (cursor >= 0) {
//                         //curPos.column = curPos.column - cursor;
//                         editor.moveCursorTo(curPos.row, curPos.column - 5);
//                     }
//                     editor.focus();
//                 });
//
//             });
//
//             $('#' + panel + ' .save-button > i').hide();
//             $('#' + panel + ' .save-button').click(function() {
//                 var button = $(this);
//                 button.attr('disabled', 'true');
//
//                 var xhr = new XMLHttpRequest();
//                 xhr.open("POST", document.URL, true);
//                 xhr.setRequestHeader('x-csrf-token', csrfToken);
//                 xhr.setRequestHeader("Content-Type", "application/json");
//
//                 xhr.onreadystatechange = function() {
//                     if(xhr.readyState == 4 && xhr.status == 200) {
//                         console.log(xhr.responseText);
//                         button.attr('disabled', 'false');
//                         currentValue = editor.getValue();
//                     }
//                 };
//
//                 xhr.send(JSON.stringify({
//                     file: panel,
//                     value: editor.getValue()
//                 }));
//             });
//         }
//     });
// });
