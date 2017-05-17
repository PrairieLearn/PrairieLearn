var httpDownloadPrefix = 'data:text/plain;base64,';

// https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding#The_Unicode_Problem
function b64DecodeUnicode(str) {
    // Going backwards: from bytestream, to percent-encoding, to original string.
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

define(["SimpleClient", "underscore", "clientCode/dropzone"], function(SimpleClient, _, Dropzone) {
    return function(questionTemplate, submissionTemplate) {
        var simpleClient = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, submissionTemplate: submissionTemplate, skipRivets: true});

        // Returns the raw (base-64 encoded) file contents
        function getSubmittedFileContents(name) {
            var files = simpleClient.submittedAnswer.get('_files') || [];
            var contents = null;
            _.each(files, function(file) {
                if (file.name === name) {
                    contents = file.contents;
                }
            });
            return contents;
        }

        // contents should be base-64 encoded
        function saveSubmittedFile(name, contents) {
            var files = simpleClient.submittedAnswer.get('_files') || [];
            files = JSON.parse(JSON.stringify(files)); // deep clone needed to avoid changing backbone object
            var idx = _.findIndex(files, function(file) {
                if (file.name === name) {
                    return true;
                }
            });
            if (idx === -1) {
                files.push({
                    name: name,
                    contents: contents
                });
            } else {
                files[idx].contents = contents;
            }
            simpleClient.submittedAnswer.set('_files', files);
        }

        // Uses the same method as Git to check if a file is binary or text:
        // If the first 8000 bytes contain a NUL character ('\0'), we consider
        // the file to be binary.
        // http://stackoverflow.com/questions/6119956/how-to-determine-if-git-handles-a-file-as-binary-or-as-text
        function isBinary(decodedFileContents) {
            var nulIdx = decodedFileContents.indexOf('\0');
            var fileLength = decodedFileContents.length;
            return nulIdx != -1 && nulIdx <= (fileLength <= 8000 ? fileLength : 8000);
        }

        function uploadStatus() {
            var $uploadStatusPanel = $('<div class="panel panel-default"></div>');
            var $uploadStatusPanelHeading = $('<div class="panel-heading">Files</div>');
            $uploadStatusPanel.append($uploadStatusPanelHeading);
            var $uploadStatus = $('<ul class="list-group"></ul>');
            var requiredFiles = simpleClient.params.get('requiredFiles');

            _.each(requiredFiles, function(file) {
                var $item = $('<li class="list-group-item"></li>');
                $uploadStatus.append($item);
                $item.append('<code>' + encodeURIComponent(file) + '</code> - ');
                var fileData = getSubmittedFileContents(file);
                if (!fileData) {
                    $item.append('not uploaded');
                } else {
                    var $preview = $('<pre><code></code></pre>');
                    try {
                        var fileContents = b64DecodeUnicode(fileData);
                        if (!isBinary(fileContents)) {
                            $preview.find('code').text(fileContents);
                        } else {
                            $preview.find('code').text('Binary file not previewed.');
                        }
                    } catch (e) {
                        console.log(e);
                        $preview.find('code').text('Unable to decode file.');
                    }
                    $preview.hide();
                    var $toggler = $('<a href="#">view</a>');
                    $toggler.on('click', function(e) {
                        $preview.toggle();
                        e.preventDefault();
                        return false;
                    });
                    $item.append($toggler);
                    $item.append($preview);
                }
            });

            $uploadStatusPanel.append($uploadStatus);

            return $uploadStatusPanel;
        }

        function initializeTemplate() {
            var $fileUpload = $('#fileUpload');
            $fileUpload.html('');

            var $dropTarget = $('<div class="dropzone"><div class="dz-message">Drop files here or click to upload.<br/><small>Only the files listed below will be accepted&mdash;others will be silently ignored.</small></div></div>');
            var $style = $('<style scoped>' +
                    '.dropzone { position: relative; min-height: 15ex; border-radius: 4px; background-color: #FAFDFF; border: 1px solid #D9EDF7; }' +
                    '.dropzone.dz-clickable { cursor: pointer; }' +
                    '.dropzone.dz-drag-hover { background-color: #D9EDF7; border-color: #AED3E5; }' +
                    '.dz-message { position: absolute; top: 50%; transform: translateY(-50%); text-align: center; width: 100%; }' +
                    '</style>'
                    );

            var requiredFiles = simpleClient.params.get('requiredFiles');

            var dropzone = $dropTarget.dropzone({
                url: '/none',
                autoProcessQueue: false,
                accept: function(file, done) {
                    if (_.contains(requiredFiles, file.name)) {
                        done();
                        return;
                    }
                    done('invalid file');
                },
                addedfile: function(file) {
                    if (!_.contains(requiredFiles, file.name)) {
                        return;
                    }
                    var reader = new FileReader();
                    reader.onload = function(e) {
                        var dataUrl = e.target.result;

                        var commaSplitIdx = dataUrl.indexOf(',');

                        // Store the file as base-64 encoded data
                        var base64FileData = dataUrl.substring(commaSplitIdx + 1);
                        saveSubmittedFile(file.name, base64FileData);

                    };

                    reader.readAsDataURL(file);
                },
            });

            $fileUpload.append($style);
            $fileUpload.append($dropTarget);
            $fileUpload.append('<div class="fileUploadStatus" style="margin-top: 1ex;"></div>');

            updateTemplate();
        }

        function updateTemplate() {
            $('#fileUpload .fileUploadStatus').html('');
            $('#fileUpload .fileUploadStatus').append(uploadStatus());
        }

        simpleClient.on('renderQuestionFinished', function() {
            simpleClient.submittedAnswer.bind('change', function() {
                updateTemplate();
            });

            simpleClient.addOptionalAnswer('_files');

            initializeTemplate();
        });

        return simpleClient;
    };
});

if (!window.File || !window.FileReader || !window.FileList || !window.Blob) {
    alert('Warning: Your browser does not fully support HTML5 file upload operations.' +
    'Please use a more current browser or you may not be able to complete this question.')
}
