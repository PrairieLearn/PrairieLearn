/* eslint-env jquery, browser */

window.PLOrderBlocks = function (uuid, options) {
  const TABWIDTH = 50; // defines how many px the answer block is indented by, when the student
  // drags and indents a block
  let maxIndent = options.maxIndent; // defines the maximum number of times an answer block can be indented

  let optionsElementId = '#order-blocks-options-' + uuid;
  let dropzoneElementId = '#order-blocks-dropzone-' + uuid;

  function setAnswer(event) {
    var domObjs = $(dropzoneElementId).children();
    var studentAnswers = [];
    for (var i = 0; i < domObjs.length; i++) {
      if (!$(domObjs[i]).hasClass('info-fixed')) {
        var answerText = domObjs[i].getAttribute('string');
        var uuid = domObjs[i].getAttribute('uuid');
        var answerIndent = null;
        if (domObjs[i].parentElement.classList.contains('enableIndentation')) {
          answerIndent = parseInt($(domObjs[i]).css('marginLeft').replace('px', ''));
          answerIndent = Math.round(answerIndent / TABWIDTH); // get how many times the answer is indented
        }

        var answer = {
          inner_html: answerText,
          indent: answerIndent,
          uuid: uuid,
        };
        studentAnswers.push(answer);
      }
    }

    var textfieldName = '#' + event.target.getAttribute('name') + '-input';
    $(textfieldName).val(JSON.stringify(studentAnswers));
  }

  function calculateIndent(ui, parent) {
    if (
      !parent[0].classList.contains('dropzone') ||
      !parent[0].classList.contains('enableIndentation')
    ) {
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

  function initialize(elementId, connectWith) {
    $(elementId).sortable({
      items: 'li:not(.info-fixed)',
      cancel: '.info',
      connectWith: connectWith,
      placeholder: 'ui-state-highlight',
      create: function (event) {
        setAnswer(event);
      },
      sort: function (event, ui) {
        // update the location of the placeholder as the item is dragged
        let placeholder = ui.placeholder;
        let leftDiff = calculateIndent(ui, placeholder.parent());
        placeholder[0].style.marginLeft = leftDiff + 'px';
      },
      stop: function (event, ui) {
        // when the user stops interacting with the list
        let leftDiff = calculateIndent(ui, ui.item.parent());
        ui.item[0].style.marginLeft = leftDiff + 'px';
        setAnswer(event);
      },
    });
  }

  initialize(optionsElementId, dropzoneElementId);
  initialize(dropzoneElementId, optionsElementId);

  $('.enableIndentation').sortable('option', 'grid', [TABWIDTH, 1]);
  $('[data-toggle="popover"]').popover();
};
