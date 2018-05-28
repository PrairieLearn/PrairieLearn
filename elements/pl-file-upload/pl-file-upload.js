/* eslint-env browser,jquery */
/* global _ */
$(function() {
    if (!window.File || !window.FileReader || !window.FileList || !window.Blob) {
        alert('Warning: Your browser does not fully support HTML5 file upload operations.' +
        'Please use a more current browser or you may not be able to complete this question.');
    }
});

window.PLFileUpload = function(uuid, options) {
    this.uuid = uuid;
    this.files = options.files || [];
    this.acceptedFiles = options.acceptedFiles || [];

    var elementId = '#file-upload-' + uuid;
    this.element = $(elementId);
    if (!this.element) {
        throw new Error('File upload element ' + elementId + ' was not found!');
    }

    this.syncFilesToHiddenInput();
    this.initializeTemplate();
};

/**
* Initializes the file upload zone on the question.
*/
window.PLFileUpload.prototype.initializeTemplate = function() {
    var $dropTarget = this.element.find('.upload-dropzone');

    var that = this;

    $dropTarget.dropzone({
        url: '/none',
        autoProcessQueue: false,
        accept: function(file, done) {
            if (_.includes(that.acceptedFiles, file.name)) {
                return done();
            }
            return done('invalid file');
        },
        addedfile: function(file) {
            if (!_.includes(that.acceptedFiles, file.name)) {
                that.addWarningMessage('<strong>' + file.name + '</strong>' + ' did not match any accepted file for this question.');
                return;
            }
            var reader = new FileReader();
            reader.onload = function(e) {
                var dataUrl = e.target.result;

                var commaSplitIdx = dataUrl.indexOf(',');

                // Store the file as base-64 encoded data
                var base64FileData = dataUrl.substring(commaSplitIdx + 1);
                that.saveSubmittedFile(file.name, base64FileData);
                that.renderFileList();
                // Show the preview for the newly-uploaded file
                that.element.find('li[data-file="' + file.name + '"] .file-preview').addClass('in');
            };

            reader.readAsDataURL(file);
        },
    });

    this.renderFileList();
};

/**
 * Syncs the internal file array to the hidden input element
 * @type {[type]}
 */
window.PLFileUpload.prototype.syncFilesToHiddenInput = function() {
    this.element.find('input').val(JSON.stringify(this.files));
};

/**
* Saves or updates the given file.
* @param  {String} name     Name of the file
* @param  {String} contents The file's base64-encoded contents
*/
window.PLFileUpload.prototype.saveSubmittedFile = function(name, contents) {
    var idx = _.findIndex(this.files, function(file) {
        if (file.name === name) {
            return true;
        }
    });
    if (idx === -1) {
        this.files.push({
            name: name,
            contents: contents,
        });
    } else {
        this.files[idx].contents = contents;
    }

    this.syncFilesToHiddenInput();
};

/**
* Gets the base64-encoded contents of a file with the given name.
* @param  {String} name The desired file
* @return {String}      The file's contents, or null if the file was not found
*/
window.PLFileUpload.prototype.getSubmittedFileContents = function(name) {
    var contents = null;
    _.each(this.files, function(file) {
        if (file.name === name) {
            contents = file.contents;
        }
    });
    return contents;
};

/**
* Generates markup to show the status of the uploaded files, including
* previews of files as appropriate.
*
* Imperative DOM manipulations can rot in hell.
*/
window.PLFileUpload.prototype.renderFileList = function() {
    var $fileList = this.element.find('.file-upload-status .card ul.list-group');

    // Save which cards are currently expanded
    var expandedFiles = [];
    $fileList.children().each(function() {
        var fileName = $(this).attr('data-file');
        if (fileName && $(this).find('.file-preview').hasClass('in')) {
            expandedFiles.push(fileName);
        }
    });

    $fileList.html('');

    var uuid = this.uuid;
    var that = this;

    _.each(this.acceptedFiles, function(fileName, index) {
        var isExpanded = _.includes(expandedFiles, fileName);
        var fileData = that.getSubmittedFileContents(fileName);

        var $file = $('<li class="list-group-item" data-file="' + fileName + '"></li>');
        var $fileStatusContainer = $('<div class="file-status-container collapsed" data-toggle="collapse" data-target="#file-preview-' + uuid + '-' + index + '"></div>');
        if (isExpanded) {
            $fileStatusContainer.removeClass('collapsed');
        }
        if (fileData) {
            $fileStatusContainer.addClass('has-preview');
        }
        $file.append($fileStatusContainer);
        var $fileStatusContainerLeft = $('<div class="file-status-container-left"></div>');
        $fileStatusContainer.append($fileStatusContainerLeft);
        if (fileData) {
            $fileStatusContainerLeft.append('<i class="file-status-icon fa fa-check-circle" style="color: #4CAF50;" aria-hidden="true"></i>');
        } else {
            $fileStatusContainerLeft.append('<i class="file-status-icon far fa-circle" aria-hidden="true"></i>');
        }
        $fileStatusContainerLeft.append(fileName);
        if (!fileData) {
            $fileStatusContainerLeft.append('<p class="file-status">not uploaded</p>');
        } else {
            $fileStatusContainerLeft.append('<p class="file-status">uploaded</p>');
        }
        if (fileData) {
            var $preview = $('<div class="file-preview collapse" id="file-preview-' + uuid + '-' + index + '"><pre class="bg-dark text-white rounded p-3 mb-0"><code></code></pre></div>');
            if (isExpanded) {
                $preview.addClass('in');
            }
            try {
                var fileContents = that.b64DecodeUnicode(fileData);
                if (!that.isBinary(fileContents)) {
                    $preview.find('code').text(fileContents);
                } else {
                    $preview.find('code').text('Binary file not previewed.');
                }
            } catch (e) {
                $preview.find('code').text('Unable to decode file.');
            }
            $file.append($preview);
            $fileStatusContainer.append('<div class="file-status-container-right"><button type="button" class="btn btn-outline-secondary btn-sm file-preview-button"><span class="file-preview-icon fa fa-angle-down"></span></button></div>');
        }

        $fileList.append($file);
    });
};

window.PLFileUpload.prototype.addWarningMessage = function(message) {
    var $alert = $('<div class="alert alert-warning alert-dismissible" role="alert"><button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button></div>');
    $alert.append(message);
    this.element.find('.messages').append($alert);
};

/**
* Checks if the given file contents should be treated as binary or
* text. Uses the same method as git: if the first 8000 bytes contain a
* NUL character ('\0'), we consider the file to be binary.
* http://stackoverflow.com/questions/6119956/how-to-determine-if-git-handles-a-file-as-binary-or-as-text
* @param  {String}  decodedFileContents File contents to check
* @return {Boolean}                     If the file is recognized as binary
*/
window.PLFileUpload.prototype.isBinary = function(decodedFileContents) {
    var nulIdx = decodedFileContents.indexOf('\0');
    var fileLength = decodedFileContents.length;
    return nulIdx != -1 && nulIdx <= (fileLength <= 8000 ? fileLength : 8000);
};

/**
* To support unicode strings, we use a method from Mozilla to decode:
* first we get the bytestream, then we percent-encode it, then we
* decode that to the original string.
* https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding#The_Unicode_Problem
* @param  {String} str the base64 string to decode
* @return {String}     the decoded string
*/
window.PLFileUpload.prototype.b64DecodeUnicode = function(str) {
    // Going backwards: from bytestream, to percent-encoding, to original string.
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
};
