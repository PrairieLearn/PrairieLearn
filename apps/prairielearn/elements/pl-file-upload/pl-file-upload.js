(() => {
  function escapeFileName(name) {
    return name
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function escapePath(path) {
    return path
      .replace(/^\//, '')
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
  }

  class PLFileUpload {
    constructor(uuid, options) {
      // Not configurable at this point as this matches the request size limit enforced by the server (accounting for base64 overhead)
      this.maxFileSizeMB = 5;
      this.uuid = uuid;
      this.files = [];
      this.requiredFiles = options.requiredFiles || [];
      this.requiredFilesLowerCase = this.requiredFiles.map((f) => f.toLowerCase());
      this.requiredFilesRegex = options.requiredFilesRegex || [];
      // Initialized after files are downloaded
      this.requiredFilesUnmatchedRegex = this.requiredFilesRegex.slice();
      this.optionalFiles = options.optionalFiles || [];
      this.optionalFilesLowerCase = this.optionalFiles.map((f) => f.toLowerCase());
      this.optionalFilesRegex = options.optionalFilesRegex || [];

      // Checks whether a file name is acceptable
      // If yes, it returns the canonical name of the file, if not, it returns null
      // Note the priority order: first, fill required file names, then required patterns, then optional names, then optional patterns
      this.findAcceptedFileName = (fileName) => {
        if (this.requiredFilesLowerCase.includes(fileName)) {
          return this.requiredFiles[this.requiredFilesLowerCase.indexOf(fileName)];
        }
        if (this.requiredFilesUnmatchedRegex.some((f) => new RegExp(f[0], 'i').test(fileName))) {
          return fileName;
        }
        if (this.optionalFilesLowerCase.includes(fileName)) {
          return this.optionalFiles[this.optionalFilesLowerCase.indexOf(fileName)];
        }
        if (this.optionalFilesRegex.some((f) => new RegExp(f[0], 'i').test(fileName))) {
          return fileName;
        }
        return null;
      };

      this.pendingFileDownloads = new Set();
      this.failedFileDownloads = new Set();

      const elementId = '#file-upload-' + uuid;
      this.element = $(elementId);
      if (!this.element) {
        throw new Error(`File upload element ${elementId} was not found!`);
      }

      if (options.submittedFileNames) {
        options.submittedFileNames.forEach((n) => {
          if (this.requiredFiles.includes(n)) return;
          const matchingRegex = this.requiredFilesUnmatchedRegex.findIndex((f) =>
            new RegExp(f[0], 'i').test(n),
          );
          if (matchingRegex >= 0) {
            this.requiredFilesUnmatchedRegex.splice(matchingRegex, 1);
          }
        });
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
              const blob = await res.blob();
              this.addFileFromBlob(file, blob.size, blob, true);
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
          if (this.findAcceptedFileName(fileNameLowerCase)) {
            return done();
          }
          return done('invalid file');
        },
        addedfile: (file) => {
          const existingFileSize = this.files.reduce((prev, next) => prev + next.size, 0);
          if (existingFileSize + file.size > this.maxFileSizeMB * 1024 * 1024) {
            this.addWarningMessage(
              `Combined file size of new file and existing files (<strong>${
                Math.round((existingFileSize + file.size) / 1024 / 10.24) / 100
              } MB</strong>) is greater than maximum file size of ${this.maxFileSizeMB} MB.`,
            );
            return;
          }

          // fuzzy case match
          const fileNameLowerCase = file.name.toLowerCase();
          const acceptedFileName = this.findAcceptedFileName(fileNameLowerCase);

          if (acceptedFileName === null) {
            this.addWarningMessage(
              `<strong>${escapeFileName(file.name)}</strong> did not match any accepted file for this question.`,
            );
            return;
          }

          this.addFileFromBlob(acceptedFileName, file.size, file, false);
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

    addFileFromBlob(name, size, blob, isFromDownload) {
      this.pendingFileDownloads.delete(name);
      this.failedFileDownloads.delete(name);

      var reader = new FileReader();
      reader.onload = (e) => {
        var dataUrl = e.target.result;

        var commaSplitIdx = dataUrl.indexOf(',');
        if (commaSplitIdx === -1) {
          this.addWarningMessage(
            `<strong>${escapeFileName(name)}</strong> is empty, ignoring file.`,
          );
          return;
        }

        // Store the file as base-64 encoded data
        var base64FileData = dataUrl.substring(commaSplitIdx + 1);
        this.saveSubmittedFile(name, size, isFromDownload ? null : new Date(), base64FileData);
        this.refreshRequiredRegex();
        this.renderFileList();

        if (!isFromDownload) {
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
     * @param  {Number} size     Size of the file in bytes
     * @param  {Date|null} date     Date when the file was uploaded (null if file is downloaded)
     * @param  {String} contents The file's base64-encoded contents
     */
    saveSubmittedFile(name, size, date, contents) {
      var idx = this.files.findIndex((file) => file.name === name);
      if (idx === -1) {
        this.files.push({
          name,
          size,
          date,
          contents,
        });
      } else {
        this.files[idx].contents = contents;
        this.files[idx].size = size;
        this.files[idx].date = date;
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

    deleteUploadedFile(name) {
      this.pendingFileDownloads.delete(name);
      this.failedFileDownloads.delete(name);
      var idx = this.files.findIndex((file) => file.name === name);
      if (idx !== -1) {
        this.files.splice(idx, 1);
      }

      this.refreshRequiredRegex();
      this.syncFilesToHiddenInput();
      this.renderFileList();
    }

    /**
     * Recomputes which required regex patterns are "filled" with uploaded files (and therefore no longer displayed)
     */
    refreshRequiredRegex() {
      this.requiredFilesUnmatchedRegex = this.requiredFilesRegex.slice();
      this.files.forEach((n) => {
        if (this.requiredFiles.includes(n.name)) return;
        const matchingRegex = this.requiredFilesUnmatchedRegex.findIndex((f) =>
          new RegExp(f[0], 'i').test(n.name),
        );
        if (matchingRegex >= 0) {
          this.requiredFilesUnmatchedRegex.splice(matchingRegex, 1);
        }
      });
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

        var $file = $(`<li class="list-group-item" data-file="${escapeFileName(fileName)}"></li>`);
        var $fileStatusContainer = $('<div class="file-status-container d-flex flex-row"></div>');
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
              `Any files with pattern: <em>${escapeFileName(fileName)}</em> (optional)`,
            );
          } else {
            $fileStatusContainerLeft.append(`${escapeFileName(fileName)} (optional)`);
          }
        } else {
          if (isWildcard) {
            $fileStatusContainerLeft.append(
              `One file with pattern: <em>${escapeFileName(fileName)}</em>`,
            );
          } else {
            $fileStatusContainerLeft.append(escapeFileName(fileName));
          }
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
          var uploadDate = this.files.find((file) => file.name === fileName).date;
          if (uploadDate !== null) {
            $fileStatusContainerLeft.append(
              `<p class="file-status">uploaded at ${uploadDate.toLocaleString()}</p>`,
            );
          } else {
            $fileStatusContainerLeft.append('<p class="file-status">uploaded and submitted</p>');
          }
        }
        if (fileData) {
          var $download = $(
            `<a download="${fileName}" class="btn btn-outline-secondary btn-sm me-1" href="data:application/octet-stream;base64,${fileData}">Download</a>`,
          );

          var $preview = $(
            `<div class="file-preview collapse" id="file-preview-${uuid}-${index}"></div>`,
          );

          var $deleteUpload = $(
            `<button type="button" class="btn btn-outline-secondary btn-sm me-1" id="file-delete-${uuid}-${index}">Delete</button>`,
          );

          var $previewNotAvailable = $(
            '<div class="alert alert-info mt-2 d-none" role="alert">Content preview is not available for this type of file.</div>',
          );
          $preview.append($previewNotAvailable);

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
            if (this.isPdf(fileData)) {
              const url = this.b64ToBlobUrl(fileData, { type: 'application/pdf' });
              const $objectPreview = $(
                `<div class="mt-2 ratio ratio-4x3">
                   <iframe src="${url}">
                     PDF file cannot be displayed.
                   </iframe>
                 </div>`,
              );
              $objectPreview.find('iframe').on('load', () => {
                URL.revokeObjectURL(url);
              });
              $preview.append($objectPreview);
              this.expandPreviewForFile(fileName);
            } else {
              var fileContents = this.b64DecodeUnicode(fileData);
              if (!this.isBinary(fileContents)) {
                $preview.find('code').text(fileContents);
              } else {
                $preview.find('code').text('Binary file not previewed.');
              }
              $codePreview.removeClass('d-none');
              this.expandPreviewForFile(fileName);
            }
          } catch {
            const url = this.b64ToBlobUrl(fileData);
            $imgPreview
              .on('load', () => {
                $imgPreview.removeClass('d-none');
                this.expandPreviewForFile(fileName);
                URL.revokeObjectURL(url);
              })
              .on('error', () => {
                $previewNotAvailable.removeClass('d-none');
                URL.revokeObjectURL(url);
              })
              .attr('src', url);
          }
          $file.append($preview);
          var $fileButtons = $('<div class="align-self-center"></div>');
          $fileButtons.append($download);
          $deleteUpload.on('click', () => this.deleteUploadedFile(fileName));
          $fileButtons.append($deleteUpload);
          $fileButtons.append(
            `<button type="button" class="btn btn-outline-secondary btn-sm file-preview-button ${!isExpanded ? 'collapsed' : ''}" data-bs-toggle="collapse" data-bs-target="#file-preview-${uuid}-${index}" aria-expanded="${isExpanded ? 'true' : 'false'}" aria-controls="file-preview-${uuid}-${index}"><span class="file-preview-icon fa fa-angle-down"></span></button>`,
          );
          $fileStatusContainer.append($fileButtons);
        }

        $fileList.append($file);
        index++;
      };

      // First list required files...
      this.requiredFiles.forEach((n) => renderFileListEntry(n));
      // ... then uploaded files matching a required regex (in 1:1 mapping) ...
      const matchedRegex = [];
      const matchedRegexFiles = [];
      this.files
        .map((f) => f.name)
        .filter((n) => {
          if (this.requiredFiles.includes(n)) return false;
          const matchingRegex = this.requiredFilesRegex.findIndex(
            (f) => new RegExp(f[0], 'i').test(n) && !matchedRegex.includes(f),
          );
          if (matchingRegex >= 0) {
            matchedRegex.push(this.requiredFilesRegex[matchingRegex]);
            matchedRegexFiles.push(n);
            return true;
          } else {
            return false;
          }
        })
        .forEach((n) => renderFileListEntry(n));
      // ...then unmatched required regexes ...
      this.requiredFilesUnmatchedRegex.forEach((n) => renderFileListEntry(n[1], false, true));
      // ...then optional file names...
      this.optionalFiles.forEach((n) => renderFileListEntry(n, true));
      // ...then all remaining uploaded files (matching a wildcard regex)...
      this.files
        .map((f) => f.name)
        .filter(
          (n) =>
            !this.requiredFiles.includes(n) &&
            !this.optionalFiles.includes(n) &&
            !matchedRegexFiles.includes(n),
        )
        .forEach((n) => renderFileListEntry(n, true));
      // ...and finally all wildcard patterns (which might accept an arbitrary number of uploads)
      this.optionalFilesRegex.map((n) => n[1]).forEach((n) => renderFileListEntry(n, true, true));
    }

    addWarningMessage(message) {
      var $alert = $(
        '<div class="alert alert-warning alert-dismissible" role="alert"><button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>',
      );
      $alert.append(message);
      this.element.find('.messages').find('.alert').remove();
      this.element.find('.messages').append($alert);
    }

    expandPreviewForFile(name) {
      const container = this.element.find(`li[data-file="${escapeFileName(name)}"]`);
      container.find('.file-preview').addClass('show');
      container.find('.file-preview-button').removeClass('collapsed');
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
     * Checks if the given file contents should be interpreted as a PDF file.
     * Using the magic numbers from the `file` utility command:
     * https://github.com/file/file/blob/master/magic/Magdir/pdf
     * The signatures are converted to base64 for comparison, to avoid issues
     * with converting from base64 to binary.
     */
    isPdf(base64FileData) {
      return (
        base64FileData.match(/^JVBERi[0-3]/) || // "%PDF-"
        base64FileData.match(/^CiVQREYt/) || // "\x0a%PDF-"
        base64FileData.match(/^77u\/JVBERi[0-3]/) // "\xef\xbb\xbf%PDF-"
      );
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

    b64ToBlobUrl(str, options = undefined) {
      const blob = new Blob(
        [
          new Uint8Array(
            atob(str)
              .split('')
              .map((c) => c.charCodeAt(0)),
          ),
        ],
        options,
      );
      return URL.createObjectURL(blob);
    }
  }

  window.PLFileUpload = PLFileUpload;
})();
