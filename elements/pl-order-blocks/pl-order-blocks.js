/* eslint-env jquery, browser */

window.PLOrderBlocks = function (uuid, options) {
  const TABWIDTH = 50; // defines how many px the answer block is indented by, when the student
  // drags and indents a block
  let maxIndent = options.maxIndent; // defines the maximum number of times an answer block can be indented
  let enableIndentation = options.enableIndentation;

  let optionsElementId = '#order-blocks-options-' + uuid;
  let dropzoneElementId = '#order-blocks-dropzone-' + uuid;

  function setAnswer() {
    var answerObjs = $(dropzoneElementId).children();
    var studentAnswers = [];
    for (var i = 0; i < answerObjs.length; i++) {
      if (!$(answerObjs[i]).hasClass('info-fixed')) {
        var answerText = answerObjs[i].getAttribute('data-string');
        var answerUuid = answerObjs[i].getAttribute('data-uuid');
        var answerIndent = null;
        if (enableIndentation) {
          answerIndent = parseInt($(answerObjs[i]).css('marginLeft').replace('px', ''));
          answerIndent = Math.round(answerIndent / TABWIDTH); // get how many times the answer is indented
        }

        var answer = {
          inner_html: answerText,
          indent: answerIndent,
          uuid: answerUuid,
        };
        studentAnswers.push(answer);
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

  function getDistractorBinIndicator(uuid) {
    let indicator = document.getElementById(uuid + '-indicator');
    if (!indicator) {
      indicator = document.createElement('li');
      indicator.classList.add('pl-order-blocks-pairing-indicator');
      // indicator.innerHTML += '<span class="pl-order-blocks-pairing-label">pick one {</span>';
      indicator.innerHTML += '<span style="font-size:13px;">Pick one:</span>';
      indicator.innerHTML += '<ul class="inner-list" style="padding:0px;"></ul>';
    }
    return indicator;
  }

  function placePairingIndicators() {
    let answerObjs = $(optionsElementId).children().toArray();
    let getDistractorGroup = block => block.getAttribute('data-distractor-group');
    let distractorBins = new Set(answerObjs.map(getDistractorGroup).filter(x => x != null));
    for (let binUuid of distractorBins) {
      let blocks = answerObjs.filter(block => getDistractorGroup(block) == binUuid);
      let indicator = getDistractorBinIndicator(binUuid);
      blocks[0].insertAdjacentElement('beforebegin', indicator);
      let innerList = indicator.getElementsByClassName('inner-list')[0];

      for (block of blocks) {
        innerList.insertAdjacentElement('beforeend', block);
      }
    }
  }

  let sortables = optionsElementId + ', ' + dropzoneElementId;
  $(sortables).sortable({
    items: '.pl-order-block',
    // We add `a` to the default list of tags to account for help
    // popover triggers.
    cancel: 'input,textarea,button,select,option,a',
    connectWith: sortables,
    placeholder: 'ui-state-highlight',
    create: function () {
      placePairingIndicators();
      setAnswer();
    },
    sort: function (event, ui) {
      // update the location of the placeholder as the item is dragged
      let placeholder = ui.placeholder;
      let leftDiff = calculateIndent(ui, placeholder.parent());
      placeholder[0].style.marginLeft = leftDiff + 'px';
      placeholder[0].style.height = ui.item[0].style.height;
    },
    stop: function (event, ui) {
      // when the user stops interacting with the list
      let leftDiff = calculateIndent(ui, ui.item.parent());
      ui.item[0].style.marginLeft = leftDiff + 'px';
      setAnswer();
    },
  });

  if (enableIndentation) {
    $(dropzoneElementId).sortable('option', 'grid', [TABWIDTH, 1]);
  }
  $('[data-toggle="popover"]').popover();
};
