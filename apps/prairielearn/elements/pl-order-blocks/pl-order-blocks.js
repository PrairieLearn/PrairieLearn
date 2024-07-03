/* eslint-env jquery, browser */

window.PLOrderBlocks = function (uuid, options) {
  const TABWIDTH = 50; // defines how many px the answer block is indented by, when the student
  // drags and indents a block
  const maxIndent = options.maxIndent; // defines the maximum number of times an answer block can be indented
  const enableIndentation = options.enableIndentation;

  const optionsElementId = '#order-blocks-options-' + uuid;
  const dropzoneElementId = '#order-blocks-dropzone-' + uuid;
  const fullContainer = document.querySelector('.pl-order-blocks-question-' + uuid);

  function initializeKeyboardHandling() {
    const blocks = fullContainer.querySelectorAll('.pl-order-block');
    blocks.forEach((block) => initializeBlockEvents(block));
  }

  function inDropzone(block) {
    const parentArea = block.closest('.pl-order-blocks-connected-sortable');
    return parentArea.classList.contains('dropzone');
  }

  function getIndentation(block) {
    return Math.round(parseInt(block.style.marginLeft.replace('px', '') / TABWIDTH));
  }

  function setIndentation(block, indentation) {
    if (indentation >= 0 && indentation <= maxIndent) {
      block.style.marginLeft = indentation * TABWIDTH + 'px';
    }
  }

  function initializeBlockEvents(block) {
    function removeSelectedAttribute() {
      block.classList.remove('pl-order-blocks-selected');
    }

    function handleKey(ev, block, handle) {
      // this event listener is necessary to remove the "pl-order-blocks-selected" attribute when a block goes out of focus.
      // however, in some browsers it fires immediately after the block is moved, causing it to lose its selected attribute.
      // removing the listener here and adding it again later ensures that the block is moved properly and retains its selected attribute.
      block.removeEventListener('blur', removeSelectedAttribute);
      handle();
      ev.preventDefault();
      block.addEventListener('blur', removeSelectedAttribute);
      setAnswer();
    }

    function handleKeyPress(ev) {
      if (!block.classList.contains('pl-order-blocks-selected')) {
        if (ev.key === 'Enter') {
          handleKey(ev, block, () => block.classList.add('pl-order-blocks-selected'));
        }
      } else {
        switch (ev.key) {
          case 'ArrowDown':
            handleKey(ev, block, () => {
              if (block.nextElementSibling) {
                block.nextElementSibling.insertAdjacentElement('afterend', block);
              }
            });
            break;
          case 'ArrowUp':
            handleKey(ev, block, () => {
              if (block.previousElementSibling) {
                block.previousElementSibling.insertAdjacentElement('beforebegin', block);
              }
            });
            break;
          case 'Delete':
          case 'Backspace':
            handleKey(ev, block, () => {
              if (inDropzone(block)) {
                block.style.marginLeft = '0px';
              }
              $(optionsElementId)[0].insertAdjacentElement('beforeend', block);
              correctPairing(block);
            });
            break;
          case 'Enter':
            handleKey(ev, block, () => {
              if (!inDropzone(block)) {
                $(dropzoneElementId)[0].insertAdjacentElement('afterbegin', block);
              }
            });
            break;
          case 'Tab':
            handleKey(ev, block, () => {
              if (inDropzone(block) && enableIndentation) {
                const currentIndent = getIndentation(block);
                if (ev.shiftKey) {
                  setIndentation(block, currentIndent - 1);
                } else {
                  setIndentation(block, currentIndent + 1);
                }
              }
            });
            break;
          case 'Escape':
            handleKey(ev, block, removeSelectedAttribute);
            break;
        }
        block.focus();
      }
    }

    block.addEventListener('click', () => {
      block.focus();
    });

    block.addEventListener('keydown', (ev) => handleKeyPress(ev));
  }

  function setAnswer() {
    var answerObjs = $(dropzoneElementId).children();
    var studentAnswers = [];
    for (const answerObj of answerObjs) {
      if (!$(answerObj).hasClass('info-fixed')) {
        var answerText = answerObj.getAttribute('string');
        var answerUuid = answerObj.getAttribute('uuid');
        var answerDistractorBin = answerObj.getAttribute('data-distractor-bin');
        var answerIndent = null;
        if (enableIndentation) {
          answerIndent = parseInt($(answerObj).css('marginLeft').replace('px', ''));
          answerIndent = Math.round(answerIndent / TABWIDTH); // get how many times the answer is indented
        }

        studentAnswers.push({
          inner_html: answerText,
          indent: answerIndent,
          uuid: answerUuid,
          distractor_bin: answerDistractorBin,
        });
      }
    }

    var textfieldName = '#' + uuid + '-input';
    $(textfieldName).val(JSON.stringify(studentAnswers));
  }

  function calculateIndent(ui, parent) {
    if (!parent[0].classList.contains('dropzone') || !enableIndentation) {
      // don't indent on option panel or solution panel with indents explicitly disabled
      return 0;
    }

    let leftDiff = ui.position.left - parent.position().left;
    leftDiff = Math.round(leftDiff / TABWIDTH) * TABWIDTH;
    let currentIndent = ui.item[0].style.marginLeft;
    if (currentIndent !== '') {
      leftDiff += parseInt(currentIndent);
    }

    // limit leftDiff to be in within the bounds of the drag and drop box
    // that is, at least indented 0 times, or at most indented by MAX_INDENT times
    leftDiff = Math.min(leftDiff, TABWIDTH * maxIndent);
    leftDiff = Math.max(leftDiff, 0);

    return leftDiff;
  }

  function getOrCreateIndicator(uuid, createAt) {
    let indicator = document.getElementById('indicator-' + uuid);
    if (!indicator) {
      indicator = document.createElement('li');
      indicator.classList.add('pl-order-blocks-pairing-indicator');
      indicator.classList.add('list-group-item-info');
      indicator.setAttribute('data-distractor-bin', uuid);
      indicator.id = 'indicator-' + uuid;
      indicator.innerHTML += '<span style="font-size:13px;">Pick one:</span>';
      indicator.innerHTML += '<ul class="inner-list" style="padding:0px;"></ul>';
      if (createAt) {
        createAt.insertAdjacentElement('beforebegin', indicator);
      } else {
        $(optionsElementId)[0].insertAdjacentElement('beforeend', indicator);
      }
    }
    return indicator;
  }

  function placePairingIndicators() {
    let answerObjs = Array.from($(optionsElementId)[0].getElementsByClassName('pl-order-block'));
    let allAns = answerObjs.concat(
      Array.from($(dropzoneElementId)[0].getElementsByClassName('pl-order-block')),
    );

    let getDistractorBin = (block) => block.getAttribute('data-distractor-bin');
    let distractorBins = new Set(allAns.map(getDistractorBin).filter((x) => x != null));

    for (let binUuid of distractorBins) {
      let blocks = answerObjs.filter((block) => getDistractorBin(block) === binUuid);
      let indicator = getOrCreateIndicator(binUuid, blocks[0]);
      let innerList = indicator.getElementsByClassName('inner-list')[0];

      for (let block of blocks) {
        innerList.insertAdjacentElement('beforeend', block);
      }
    }
  }

  function correctPairing(block) {
    if (block.parentElement.classList.contains('dropzone')) {
      // there aren't pairing indicators in the dropzone
      return;
    }
    let binUuid = block.getAttribute('data-distractor-bin');
    let containingIndicator = block.closest('.pl-order-blocks-pairing-indicator');
    let containingIndicatorUuid = containingIndicator
      ? containingIndicator.getAttribute('data-distractor-bin')
      : null;

    if (!binUuid && containingIndicatorUuid) {
      containingIndicator.insertAdjacentElement('afterend', block);
    } else if (binUuid !== containingIndicatorUuid) {
      let properIndicatorList = getOrCreateIndicator(binUuid, block).getElementsByClassName(
        'inner-list',
      )[0];
      properIndicatorList.insertAdjacentElement('beforeend', block);
    }
  }

  function drawIndentLocationLines(dropzoneElementId) {
    $(dropzoneElementId)[0].style.background = 'linear-gradient(#9E9E9E, #9E9E9E) no-repeat, '
      .repeat(maxIndent + 1)
      .slice(0, -2);
    $(dropzoneElementId)[0].style.backgroundSize = '1px 100%, '.repeat(maxIndent + 1).slice(0, -2);
    $(dropzoneElementId)[0].style.backgroundPosition = Array.from(
      { length: maxIndent + 1 },
      (_, index) => {
        return `${+$(dropzoneElementId).css('padding-left').slice(0, -2) + TABWIDTH * index}px 0`;
      },
    ).join(', ');
  }

  let sortables = optionsElementId + ', ' + dropzoneElementId;
  $(sortables).sortable({
    items: '.pl-order-block:not(.nodrag)',
    // We add `a` to the default list of tags to account for help
    // popover triggers.
    cancel: 'input,textarea,button,select,option,a',
    connectWith: sortables,
    placeholder: 'ui-state-highlight',
    create() {
      placePairingIndicators();
      setAnswer();
      if (enableIndentation) {
        drawIndentLocationLines(dropzoneElementId);
      }
    },
    sort(event, ui) {
      // update the location of the placeholder as the item is dragged
      let placeholder = ui.placeholder;
      let leftDiff = calculateIndent(ui, placeholder.parent());
      placeholder[0].style.marginLeft = leftDiff + 'px';
      placeholder[0].style.height = ui.item[0].style.height;

      // Sets the width of the placeholder to match the width of the block being dragged
      if (options.inline) {
        placeholder[0].style.width = ui.item[0].style.width;
      }
    },
    stop(event, ui) {
      // when the user stops interacting with the list
      let leftDiff = calculateIndent(ui, ui.item.parent());
      ui.item[0].style.marginLeft = leftDiff + 'px';
      setAnswer();

      correctPairing(ui.item[0]);
    },
  });
  initializeKeyboardHandling(optionsElementId, dropzoneElementId);

  if (enableIndentation) {
    $(dropzoneElementId).sortable('option', 'grid', [TABWIDTH, 1]);
  }
  $('[data-toggle="popover"]').popover();
};
