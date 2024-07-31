/* eslint-env browser,jquery */

(() => {
  function escapePath(path) {
    return path
      .replace(/^\//, '')
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
  }

  class PLFileUpload {
    constructor(uuid, options) {
      this.uuid = uuid;
      this.files = [];
      this.acceptedFiles = options.acceptedFiles || [];
      this.acceptedFilesLowerCase = this.acceptedFiles.map((f) => f.toLowerCase());
      // The list of optional files contains tuples with patterns (if regex-based) and display names
      this.optionalFiles = options.optionalFiles || [];
      // Divide optional files into static names and regex patterns
      this.optionalFilesStatic = this.optionalFiles.filter((f) => f[0] === null).map((f) => f[1]);
      this.optionalFilesLowerCase = this.optionalFilesStatic.map((f) => f.toLowerCase());
      this.optionalFilesWildcard = this.optionalFiles.filter((f) => f[0] !== null);

      // Look up the index of static names; for regexes, the index does not matter,
      // as long as they can be distinguished from static names
      this.findFileNameIndex = (fileName) => {
        if (this.acceptedFilesLowerCase.includes(fileName)) {
          return this.acceptedFilesLowerCase.indexOf(fileName);
        }
        if (this.optionalFilesLowerCase.includes(fileName)) {
          return this.acceptedFiles.length + this.optionalFilesLowerCase.indexOf(fileName);
        }
        const matchingWildcard = this.optionalFilesWildcard.findIndex((f) =>
          new RegExp(f[0], 'i').test(fileName),
        );
        if (matchingWildcard >= 0) {
          return this.acceptedFiles.length + this.optionalFilesStatic.length;
        } else {
          return -1;
        }
      };

      this.pendingFileDownloads = new Set();
      this.failedFileDownloads = new Set();

      const elementId = '#file-upload-' + uuid;
      this.element = $(elementId);
      if (!this.element) {
        throw new Error('File upload element ' + elementId + ' was not found!');
      }

      if (options.submittedFileNames) {
        this.downloadExistingFiles(options.submittedFileNames).then(() => {
          this.syncFilesToHiddenInput();
        });
      }

      this.checkIconColor = options.checkIconColor;

      // We need to render after we start loading the existing files so that we
      // can pick up the right values from `pendingFileDownloads`.
      this.initializeTemplate();
    }

    async downloadExistingFiles(fileNames) {
      const submissionFilesUrl = this.element.data('submission-files-url');
      fileNames.forEach((file) => this.pendingFileDownloads.add(file));

      await Promise.all(
        fileNames.map(async (file) => {
          const escapedFileName = escapePath(file);
          const path = `${submissionFilesUrl}/${escapedFileName}`;
          try {
            const res = await fetch(path, { method: 'GET' });
            if (!res.ok) {
              throw new Error(`Failed to download file: ${res.status}`);
            }
            if (!res) {
              this.pendingFileDownloads.delete(file);
              this.failedFileDownloads.add(file);
              this.renderFileList();
              return;
            }

            // Avoid race condition with student initiated upload. If the student
            // added a file while this was loading, the file name would have been
            // removed from the list of pending downloads, so we can just ignore
            // the result.
            if (this.pendingFileDownloads.has(file)) {
              this.addFileFromBlob(file, await res.blob(), true);
            }
          } catch (e) {
            console.error(e);
          }
        }),
      );
    }

    /**
     * Initializes the file upload zone on the question.
     */
    initializeTemplate() {
      const $dropTarget = this.element.find('.upload-dropzone');

      $dropTarget.dropzone({
        url: '/none',
        autoProcessQueue: false,
        accept: (file, done) => {
          // fuzzy case match
          const fileNameLowerCase = file.name.toLowerCase();
          if (this.findFileNameIndex(fileNameLowerCase) > -1) {
            return done();
          }
          return done('invalid file');
        },
        addedfile: (file) => {
          // fuzzy case match
          const fileNameLowerCase = file.name.toLowerCase();
          const acceptedFilesIdx = this.findFileNameIndex(fileNameLowerCase);

          if (acceptedFilesIdx <= -1) {
            this.addWarningMessage(
              '<strong>' +
                file.name +
                '</strong>' +
                ' did not match any accepted file for this question.',
            );
            return;
          }

          // For static file names, look up the index to match capitalization,
          // for regex patterns, accept the uploaded file name as-is
          if (acceptedFilesIdx < this.acceptedFiles.concat(this.optionalFilesStatic).length) {
            const acceptedName = this.acceptedFiles.concat(this.optionalFilesStatic)[
              acceptedFilesIdx
            ];
            this.addFileFromBlob(acceptedName, file, false);
          } else {
            this.addFileFromBlob(file.name, file, false);
          }
        },
      });

      this.renderFileList();
    }

    /**
     * Syncs the internal file array to the hidden input element
     * @type {[type]}
     */
    syncFilesToHiddenInput() {
      this.element.find('input').val(JSON.stringify(this.files));
    }

    addFileFromBlob(name, blob, isFromDownload) {
      this.pendingFileDownloads.delete(name);
      this.failedFileDownloads.delete(name);

      var reader = new FileReader();
      reader.onload = (e) => {
        var dataUrl = e.target.result;

        var commaSplitIdx = dataUrl.indexOf(',');
        if (commaSplitIdx === -1) {
          this.addWarningMessage('<strong>' + name + '</strong>' + ' is empty, ignoring file.');
          return;
        }

        // Store the file as base-64 encoded data
        var base64FileData = dataUrl.substring(commaSplitIdx + 1);
        this.saveSubmittedFile(name, base64FileData);
        this.renderFileList();

        if (!isFromDownload) {
          // Show the preview for the newly-uploaded file
          const container = this.element.find(`li[data-file="${name}"]`);
          container.find('.file-preview').addClass('show');
          container.find('.file-status-container').removeClass('collapsed');

          // Ensure that students see a prompt if they try to navigate away
          // from the page without saving the form. This check is initially
          // disabled because we don't want students to see the prompt if they
          // haven't actually made any changes.
          this.element.find('input').removeAttr('data-disable-unload-check');
        }
      };

      reader.readAsDataURL(blob);
    }

    /**
     * Saves or updates the given file.
     * @param  {String} name     Name of the file
     * @param  {String} contents The file's base64-encoded contents
     */
    saveSubmittedFile(name, contents) {
      var idx = this.files.findIndex((file) => file.name === name);
      if (idx === -1) {
        this.files.push({
          name,
          contents,
        });
      } else {
        this.files[idx].contents = contents;
      }

      this.syncFilesToHiddenInput();
    }

    /**
     * Gets the base64-encoded contents of a file with the given name.
     * @param  {String} name The desired file
     * @return {String}      The file's contents, or null if the file was not found
     */
    getSubmittedFileContents(name) {
      const file = this.files.find((file) => file.name === name);
      return file ? file.contents : null;
    }

    /**
     * Generates markup to show the status of the uploaded files, including
     * previews of files as appropriate.
     */
    renderFileList() {
      var $fileList = this.element.find('.file-upload-status .card ul.list-group');

      // Save which cards are currently expanded
      var expandedFiles = [];
      $fileList.children().each(function () {
        var fileName = $(this).attr('data-file');
        if (fileName && $(this).find('.file-preview').hasClass('show')) {
          expandedFiles.push(fileName);
        }
      });

      $fileList.html('');

      var uuid = this.uuid;
      var index = 0;

      // This is called repeatedly with different parameters for required/optional/regex entries
      var renderFileListEntry = (fileName, isOptional = false, isWildcard = false) => {
        var isExpanded = expandedFiles.includes(fileName);
        var fileData = this.getSubmittedFileContents(fileName);

        var $file = $('<li class="list-group-item" data-file="' + fileName + '"></li>');
        var $fileStatusContainer = $(
          '<div class="file-status-container collapsed d-flex flex-row mathjax_ignore" data-toggle="collapse" data-target="#file-preview-' +
            uuid +
            '-' +
            index +
            '"></div>',
        );
        if (isExpanded) {
          $fileStatusContainer.removeClass('collapsed');
        }
        if (fileData) {
          $fileStatusContainer.addClass('has-preview');
        }
        $file.append($fileStatusContainer);
        var $fileStatusContainerLeft = $('<div class="flex-grow-1"></div>');
        $fileStatusContainer.append($fileStatusContainerLeft);
        if (this.pendingFileDownloads.has(fileName)) {
          $fileStatusContainerLeft.append(
            '<i class="file-status-icon fas fa-spinner fa-spin" aria-hidden="true"></i>',
          );
        } else if (this.failedFileDownloads.has(fileName)) {
          $fileStatusContainerLeft.append(
            '<i class="file-status-icon fas fa-circle-exclamation text-danger" aria-hidden="true"></i>',
          );
        } else if (fileData) {
          $fileStatusContainerLeft.append(
            `<i class="file-status-icon fa fa-check-circle" style="color: ${this.checkIconColor}" aria-hidden="true"></i>`,
          );
        } else {
          $fileStatusContainerLeft.append(
            '<i class="file-status-icon far fa-circle" aria-hidden="true"></i>',
          );
        }
        if (isOptional) {
          if (isWildcard) {
            $fileStatusContainerLeft.append(
              `Any files matching this naming pattern: <em>${fileName}</em> (optional)`,
            );
          } else {
            $fileStatusContainerLeft.append(`${fileName} (optional)`);
          }
        } else {
          $fileStatusContainerLeft.append(fileName);
        }
        if (this.pendingFileDownloads.has(fileName)) {
          $fileStatusContainerLeft.append(
            '<p class="file-status">fetching previous submission...</p>',
          );
        } else if (this.failedFileDownloads.has(fileName)) {
          $fileStatusContainerLeft.append(
            '<p class="file-status">failed to fetch previous submission; upload this file again</p>',
          );
        } else if (!fileData) {
          $fileStatusContainerLeft.append('<p class="file-status">not uploaded</p>');
        } else {
          $fileStatusContainerLeft.append('<p class="file-status">uploaded</p>');
        }
        if (fileData) {
          var download =
            '<a download="' +
            fileName +
            '" class="btn btn-outline-secondary btn-sm mr-1" onclick="event.stopPropagation();" href="data:application/octet-stream;base64,' +
            fileData +
            '">Download</a>';

          var $preview = $(
            '<div class="file-preview collapse" id="file-preview-' +
              uuid +
              '-' +
              index +
              '"></div>',
          );

          var $error = $('<div class="alert alert-danger mt-2 d-none" role="alert"></div>');
          $preview.append($error);

          var $imgPreview = $('<img class="mw-100 mt-2 d-none"/>');
          $preview.append($imgPreview);

          var $codePreview = $(
            '<pre class="bg-dark text-white rounded p-3 mt-2 mb-0 d-none"><code></code></pre>',
          );
          $preview.append($codePreview);

          if (isExpanded) {
            $preview.addClass('show');
          }
          try {
            var fileContents = this.b64DecodeUnicode(fileData);
            if (!this.isBinary(fileContents)) {
              $preview.find('code').text(fileContents);
            } else {
              $preview.find('code').text('Binary file not previewed.');
            }
            $codePreview.removeClass('d-none');
          } catch (e) {
            $imgPreview
              .on('load', () => {
                $imgPreview.removeClass('d-none');
              })
              .on('error', () => {
                $error
                  .text('Content preview is not available for this type of file.')
                  .removeClass('d-none');
              })
              .attr('src', 'data:application/octet-stream;base64,' + fileData);
          }
          $file.append($preview);
          $fileStatusContainer.append(
            '<div class="align-self-center">' +
              download +
              '<button type="button" class="btn btn-outline-secondary btn-sm file-preview-button"><span class="file-preview-icon fa fa-angle-down"></span></button></div>',
          );
        }

        $fileList.append($file);
        index++;
      };

      // First list required files...
      this.acceptedFiles.forEach((n) => renderFileListEntry(n));
      // ...then static optional files...
      this.optionalFilesStatic.forEach((n) => renderFileListEntry(n, true));
      // ...then all remaining uploaded files...
      this.files
        .map((f) => f.name)
        .filter((n) => !this.acceptedFiles.includes(n) && !this.optionalFilesStatic.includes(n))
        .forEach((n) => renderFileListEntry(n, true));
      // ...and finally all wildcard patterns (which might accept an arbitrary number of uploads)
      this.optionalFilesWildcard
        .map((n) => n[1])
        .forEach((n) => renderFileListEntry(n, true, true));
    }

    addWarningMessage(message) {
      var $alert = $(
        '<div class="alert alert-warning alert-dismissible" role="alert"><button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button></div>',
      );
      $alert.append(message);
      this.element.find('.messages').append($alert);
    }

    /**
     * Checks if the given file contents should be treated as binary or
     * text. Uses the same method as git: if the first 8000 bytes contain a
     * NUL character ('\0'), we consider the file to be binary.
     * http://stackoverflow.com/questions/6119956/how-to-determine-if-git-handles-a-file-as-binary-or-as-text
     * @param  {String}  decodedFileContents File contents to check
     * @return {Boolean}                     If the file is recognized as binary
     */
    isBinary(decodedFileContents) {
      var nulIdx = decodedFileContents.indexOf('\0');
      var fileLength = decodedFileContents.length;
      return nulIdx !== -1 && nulIdx <= (fileLength <= 8000 ? fileLength : 8000);
    }

    /**
     * To support unicode strings, we use a method from Mozilla to decode:
     * first we get the bytestream, then we percent-encode it, then we
     * decode that to the original string.
     * https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding#The_Unicode_Problem
     * @param  {String} str the base64 string to decode
     * @return {String}     the decoded string
     */
    b64DecodeUnicode(str) {
      // Going backwards: from bytestream, to percent-encoding, to original string.
      return decodeURIComponent(
        atob(str)
          .split('')
          .map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join(''),
      );
    }
  }

  window.PLFileUpload = PLFileUpload;
})();
