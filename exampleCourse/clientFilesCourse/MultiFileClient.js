var httpDownloadPrefix = 'data:text/plain;base64,';

define(["SimpleClient", "underscore", "clientCode/dropzone"], function(SimpleClient, _, Dropzone) {
    return function(questionTemplate, submissionTemplate) {
        var simpleClient = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, submissionTemplate: submissionTemplate});

        function getSubmittedFileContents(name) {
            var files = simpleClient.submittedAnswer.get('files') || [];
            console.log(files)
            var contents = null;
            _.each(files, function(file) {
                if (file.name === name) {
                    contents = file.contents;
                }
            });
            return contents;
        }

        function saveSubmittedFile(name, contents) {
            var files = simpleClient.submittedAnswer.get('files') || [];
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
            simpleClient.submittedAnswer.set('files', files);
        }

        function uploadStatus() {
            var $uploadStatus = $('<ul></ul>');
            var requiredFiles = simpleClient.params.get('requiredFiles');

            _.each(requiredFiles, function(file) {
                console.log(file)
                var $item = $('<li></li>');
                $uploadStatus.append($item);
                $item.append('<code>' + encodeURIComponent(file) + '</code> - ');
                var fileData = getSubmittedFileContents(file);
                if (!fileData) {
                    $item.append('not uploaded');
                } else {
                    var $preview = $('<pre><code></code></pre>');
                    $preview.find('code').text(fileData);
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

            return $uploadStatus;
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
                    console.log("adding file...")
                    if (!_.contains(requiredFiles, file.name)) {
                        return;
                    }
                    console.log("reading!")
                    var reader = new FileReader();
                    reader.onload = function(e) {
                        // TODO: add support for base64 strings
                        /*var dataUrl = e.target.result;

                        var commaSplitIdx = dataUrl.indexOf(',');

                        // Store the data as base64 encoded data
                        var base64FileData = dataUrl.substring(commaSplitIdx + 1);
                        simpleClient.submittedAnswer.set(key(file.name), base64FileData);*/
                        saveSubmittedFile(file.name, e.target.result);

                    };

                    reader.readAsText(file);
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

            simpleClient.addOptionalAnswer('files');

            initializeTemplate();
        });

        return simpleClient;
    };
});

if (!window.File || !window.FileReader || !window.FileList || !window.Blob) {
    alert('Warning: Your browser does not fully support HTML5 file upload operations.' +
    'Please use a more current browser or you may not be able to complete this question.')
}
