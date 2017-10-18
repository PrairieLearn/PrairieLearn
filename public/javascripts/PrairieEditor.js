/**
 * PrairieEditor is currently a simple jQuery script that sets up ace editors
 * and configures a save button for each file. It also previews the question by
 * asynchronously rendering variants and grading submissions.
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
            if (xhr.readyState == 4 && xhr.status == 200 && onComplete != null)
                onComplete(xhr.responseText);
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

            // asynchronously save the file content
            post({
                action: 'save',
                file: fileName,
                content: editor.getValue()
            },
            function(response) {
                // Reset the save button to be disabled (until the next edit)
                saveButton.attr('disabled', true);
                if (response != 'error') {
                    currentContent = editor.getValue();

                    // Refresh the question preview
                    generatePreview();
                }
            });

        })
    });

    // A div where previews are placed
    var preview = $('#preview');

    // Generates a new preview by asynchronously rendering a question variant
    function generatePreview() {
        post({ action: 'preview' }, function(response) {
            updatePreview(response);
        })
    };

    function updatePreview(value) {
        // Update the html of the preview area with the given value
        // and queue a MathJax update to typset any math equations
        preview.html(value);
        MathJax.Hub.Queue(["Typeset", MathJax.Hub, "preview"]);

        // Get the form element that was added to the preview
        var form = preview.find('form');

        //
        form.submit(function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
        });

        // Hide the save and edit button in the form
        preview.find('.question-save').hide();
        preview.find('.question-edit').hide();

        // When the grade button is clicked, asynchronously reload with the
        // graded variant html preview
        preview.find('.question-grade').click(function() {
            post({
                action: 'grade',
                form: form.serializeArray()
            }, function(response) {
                updatePreview(response);
            });
        });

        // When a new variant is requested, generate a new preview
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
