const TAB_SPACES = 4;
const CODE_TEXT_SELECTOR =
  '.pl-order-blocks-code .pl-code td.code pre, .pl-order-blocks-code .pl-code pre';

function computeScaledIndent(container, list) {
  const codeText = container.querySelector(CODE_TEXT_SELECTOR);
  if (!codeText) return TAB_SPACES;
  const listFontSize = Number.parseFloat(getComputedStyle(list).fontSize) || 0;
  const codeFontSize = Number.parseFloat(getComputedStyle(codeText).fontSize) || listFontSize;
  if (listFontSize <= 0) return TAB_SPACES;
  return (TAB_SPACES * codeFontSize) / listFontSize;
}

function setContainerIndentScale(container, list) {
  const scaledTabSpaces = computeScaledIndent(container, list);
  container.style.setProperty('--pl-order-block-indent-ch', String(scaledTabSpaces));
  return scaledTabSpaces;
}

$(function () {
  document.querySelectorAll('.pl-order-blocks-answer-container').forEach((container) => {
    const list = container.querySelector('.list-group');
    if (list) {
      setContainerIndentScale(container, list);
    }
  });
});

window.PLOrderBlocks = function (uuid, options) {
  const maxIndent = options.maxIndent; // defines the maximum number of times an answer block can be indented
  const enableIndentation = options.enableIndentation;

  const optionsElementId = '#order-blocks-options-' + uuid;
  const dropzoneElementId = '#order-blocks-dropzone-' + uuid;
  const optionsList = $(optionsElementId)[0];
  const dropzoneList = $(dropzoneElementId)[0];
  const dropzonePaddingLeft = Number.parseFloat(getComputedStyle(dropzoneList).paddingLeft) || 0;
  const fullContainer = document.querySelector('.pl-order-blocks-question-' + uuid);
  const scaledTabSpaces = setContainerIndentScale(fullContainer, dropzoneList);
  const tabWidth = measureTabWidth();

  function measureTabWidth() {
    const probe = document.createElement('span');
    probe.style.width = scaledTabSpaces + 'ch';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    dropzoneList.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  }

  function initializeKeyboardHandling() {
    const blocks = fullContainer.querySelectorAll('.pl-order-block');
    let blockNum = 0;
    blocks.forEach((block) => {
      block.setAttribute('tabindex', '-1');
      if (enableIndentation) {
        const existingIndent = getIndentation(block);
        setIndentation(block, existingIndent);
      }
      block.setAttribute('id', uuid + '-' + blockNum);
      blockNum += 1;
      block.setAttribute('role', 'option');
      block.setAttribute('aria-roledescription', 'Block');
      block.setAttribute('aria-selected', false);
      initializeBlockEvents(block);
    });
    blocks[0].setAttribute('tabindex', '0'); // only the first block in the pl-order-blocks element can be focused by tabbing through
  }

  function inDropzone(block) {
    const parentArea = block.closest('.pl-order-blocks-connected-sortable');
    return parentArea.classList.contains('dropzone');
  }

  function getIndentation(block) {
    return Number.parseInt(block.getAttribute('data-indent-depth') || '0') || 0;
  }

  function setIndentation(block, indentation) {
    const clamped = Math.max(0, Math.min(indentation, maxIndent));
    block.setAttribute('data-indent-depth', clamped.toString());
    block.style.marginLeft = clamped * scaledTabSpaces + 'ch';
    if (inDropzone(block)) {
      block.setAttribute('aria-description', 'indentation depth ' + clamped);
    } else {
      block.removeAttribute('aria-description');
    }
  }

  function initializeBlockEvents(block) {
    function deselectBlock() {
      block.setAttribute('aria-selected', false);
    }

    function handleKey(ev, block, handle, focus = true) {
      // When we manipulate the location of the block, the focus is automatically removed by the browser,
      // so we immediately refocus it. In some browsers, the blur event will still fire in this case even
      // though we don't want it to, so we temporarily remove and then reattach the blur event listener.
      block.removeEventListener('blur', deselectBlock);
      handle();
      ev.preventDefault();
      correctPairing(block);
      if (focus) {
        block.focus();
      }
      block.addEventListener('blur', deselectBlock);
      setAnswer();
    }

    function handleKeyPress(ev) {
      const optionsBlocks = Array.from(optionsList.querySelectorAll('.pl-order-block'));
      const dropzoneBlocks = Array.from(dropzoneList.querySelectorAll('.pl-order-block'));
      if (block.getAttribute('aria-selected') !== 'true') {
        const moveBetweenOptionsOrDropzone = (options) => {
          if (options && inDropzone(block) && optionsBlocks.length > 0) {
            optionsBlocks[0].focus();
          } else if (!options && !inDropzone(block) && dropzoneBlocks.length > 0) {
            dropzoneBlocks[0].focus();
          }
        };
        const moveWithinOptionsOrDropzone = (forward) => {
          if (forward) {
            if (inDropzone(block)) {
              const blockIndex = dropzoneBlocks.indexOf(block);
              if (blockIndex < dropzoneBlocks.length - 1) {
                dropzoneBlocks[blockIndex + 1].focus();
              }
            } else {
              const blockIndex = optionsBlocks.indexOf(block);
              if (blockIndex < optionsBlocks.length - 1) {
                optionsBlocks[blockIndex + 1].focus();
              }
            }
          } else {
            if (inDropzone(block)) {
              const blockIndex = dropzoneBlocks.indexOf(block);
              if (blockIndex > 0) {
                dropzoneBlocks[blockIndex - 1].focus();
              }
            } else {
              const blockIndex = optionsBlocks.indexOf(block);
              if (blockIndex > 0) {
                optionsBlocks[blockIndex - 1].focus();
              }
            }
          }
        };
        switch (ev.key) {
          case ' ': // Space key
          case 'Enter':
            handleKey(ev, block, () => block.setAttribute('aria-selected', true));
            break;
          case 'ArrowUp':
            handleKey(ev, block, () => moveWithinOptionsOrDropzone(false), false);
            break;
          case 'ArrowDown':
            handleKey(ev, block, () => moveWithinOptionsOrDropzone(true), false);
            break;
          case 'ArrowLeft':
            handleKey(ev, block, () => moveBetweenOptionsOrDropzone(true), false);
            break;
          case 'ArrowRight':
            handleKey(ev, block, () => moveBetweenOptionsOrDropzone(false), false);
            break;
        }
      } else {
        switch (ev.key) {
          case ' ': // If selected, space bar should PreventDefault
            handleKey(ev, block, () => {});
            break;
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
          case 'ArrowLeft':
            handleKey(ev, block, () => {
              if (inDropzone(block)) {
                const level = getIndentation(block);
                if (level === 0) {
                  optionsList.append(block);
                  return;
                }
                setIndentation(block, level - 1);
              }
            });
            break;
          case 'ArrowRight':
            handleKey(ev, block, () => {
              if (!inDropzone(block)) {
                // Moving to the answer area
                dropzoneList.append(block);
                if (enableIndentation) {
                  // when inserting a block, default to the same indentation level as the previous block
                  if (block.previousElementSibling) {
                    setIndentation(block, getIndentation(block.previousElementSibling));
                  } else {
                    setIndentation(block, 0);
                  }
                }
              } else if (enableIndentation) {
                // Already in answer area
                setIndentation(block, getIndentation(block) + 1);
              }
            });
            break;
          case 'Escape':
            handleKey(ev, block, deselectBlock);
            break;
        }
      }
    }

    block.addEventListener('click', () => {
      block.focus();
    });

    block.addEventListener('keydown', (ev) => handleKeyPress(ev));

    block.addEventListener('blur', () => {
      block.setAttribute('tabindex', '-1');
      const blocks = fullContainer.querySelectorAll('.pl-order-block');
      if (
        // Make sure one block is always focusable in each pl-order-blocks element
        Array.from(blocks).every((item) => {
          return item.getAttribute('tabindex') === '-1';
        })
      ) {
        block.setAttribute('tabindex', '0');
      }
    });
    block.addEventListener('focus', () => {
      fullContainer
        .querySelectorAll('.pl-order-block')
        .forEach((item) => item.setAttribute('tabindex', '-1'));
      block.setAttribute('tabindex', '0');
    });
  }

  function setAnswer() {
    const answerObjs = dropzoneList.children;
    const studentAnswers = [];
    for (const answerObj of answerObjs) {
      if (!answerObj.classList.contains('info-fixed')) {
        const answerText = answerObj.getAttribute('string');
        const answerUuid = answerObj.getAttribute('uuid');
        const answerDistractorBin = answerObj.getAttribute('data-distractor-bin');
        let answerIndent = null;
        if (enableIndentation) {
          answerIndent = getIndentation(answerObj);
        }

        studentAnswers.push({
          inner_html: answerText,
          indent: answerIndent,
          uuid: answerUuid,
          distractor_bin: answerDistractorBin,
        });
      }
    }

    const textfieldName = '#' + uuid + '-input';
    $(textfieldName).val(JSON.stringify(studentAnswers));
  }

  function calculateIndent(ui, parent) {
    const parentEl = parent[0];
    if (!parentEl.classList.contains('dropzone') || !enableIndentation) {
      // don't indent on option panel or solution panel with indents explicitly disabled
      return 0;
    }

    if (tabWidth <= 0) return 0;

    let indent;
    if (dragStartedInDropzone) {
      // item's data-indent-depth is unchanged during drag; only the placeholder is updated
      const originalLeft = ui.originalPosition?.left ?? ui.position.left;
      const indentDelta = (ui.position.left - originalLeft) / tabWidth;
      indent = getIndentation(ui.item[0]) + Math.round(indentDelta);
    } else {
      indent = Math.round(
        (ui.position.left - parent.position().left - dropzonePaddingLeft) / tabWidth,
      );
    }

    return indent;
  }

  function getOrCreateIndicator(uuid, createAt) {
    let indicator = document.getElementById('indicator-' + uuid);
    if (!indicator) {
      indicator = document.createElement('li');
      indicator.classList.add('pl-order-blocks-pairing-indicator', 'bg-info-subtle');
      indicator.setAttribute('data-distractor-bin', uuid);
      indicator.id = 'indicator-' + uuid;
      indicator.innerHTML += '<span style="font-size:13px;">Pick one:</span>';
      indicator.innerHTML += '<ul class="inner-list" style="padding:0px;"></ul>';
      if (createAt) {
        createAt.before(indicator);
      } else {
        optionsList.append(indicator);
      }
    }
    return indicator;
  }

  function placePairingIndicators() {
    const answerObjs = Array.from(optionsList.getElementsByClassName('pl-order-block'));
    const allAns = answerObjs.concat(
      Array.from(dropzoneList.getElementsByClassName('pl-order-block')),
    );

    const getDistractorBin = (block) => block.getAttribute('data-distractor-bin');
    const distractorBins = new Set(allAns.map(getDistractorBin).filter((x) => x != null));

    for (const binUuid of distractorBins) {
      const blocks = answerObjs.filter((block) => getDistractorBin(block) === binUuid);
      const indicator = getOrCreateIndicator(binUuid, blocks[0]);
      const innerList = indicator.getElementsByClassName('inner-list')[0];

      for (const block of blocks) {
        innerList.append(block);
      }
    }
  }

  function correctPairing(block) {
    if (block.parentElement.classList.contains('dropzone')) {
      // there aren't pairing indicators in the dropzone
      return;
    }
    const binUuid = block.getAttribute('data-distractor-bin');
    const containingIndicator = block.closest('.pl-order-blocks-pairing-indicator');
    const containingIndicatorUuid = containingIndicator
      ? containingIndicator.getAttribute('data-distractor-bin')
      : null;

    if (!binUuid && containingIndicatorUuid) {
      containingIndicator.after(block);
    } else if (binUuid !== containingIndicatorUuid) {
      const properIndicatorList = getOrCreateIndicator(binUuid, block).getElementsByClassName(
        'inner-list',
      )[0];
      properIndicatorList.append(block);
    }
  }

  function drawIndentLocationLines() {
    dropzoneList.style.background = 'linear-gradient(#9E9E9E, #9E9E9E) no-repeat, '
      .repeat(maxIndent + 1)
      .slice(0, -2);
    dropzoneList.style.backgroundSize = '1px 100%, '.repeat(maxIndent + 1).slice(0, -2);
    dropzoneList.style.backgroundPosition = Array.from({ length: maxIndent + 1 }, (_, index) => {
      return `calc(${dropzonePaddingLeft}px + ${scaledTabSpaces * index}ch) 0`;
    }).join(', ');
  }

  let dragStartedInDropzone = false;
  const sortables = optionsElementId + ', ' + dropzoneElementId;
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
        drawIndentLocationLines();
      }
    },
    start(_event, ui) {
      dragStartedInDropzone = inDropzone(ui.item[0]);
    },
    sort(_event, ui) {
      // update the location of the placeholder as the item is dragged
      const placeholder = ui.placeholder;
      const indentation = calculateIndent(ui, placeholder.parent());
      placeholder[0].style.height = ui.item[0].style.height;
      setIndentation(placeholder[0], indentation);

      // Sets the width of the placeholder to match the width of the block being dragged
      if (options.inline) {
        placeholder[0].style.width = ui.item[0].style.width;
      }
    },
    stop(_event, ui) {
      // when the user stops interacting with the list
      const indentation = calculateIndent(ui, ui.item.parent());
      setIndentation(ui.item[0], indentation);
      dragStartedInDropzone = false;
      setAnswer();

      correctPairing(ui.item[0]);
    },
  });
  initializeKeyboardHandling();
};
