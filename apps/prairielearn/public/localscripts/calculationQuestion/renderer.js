define(function () {
  function Renderer() {}

  Renderer.prototype.attemptsColorType = function (n) {
    if (n >= 5) {
      return 'success';
    } else if (n >= 1) {
      return 'warning';
    } else {
      return 'danger';
    }
  };

  Renderer.prototype.scoreColorType = function (score) {
    if (score >= 0.8) {
      return 'success';
    } else if (score >= 0.5) {
      return 'warning';
    } else {
      return 'danger';
    }
  };

  Renderer.prototype.attemptsLabel = function (n, counts, nText, extraAtts) {
    var labelType = this.attemptsColorType(n);
    if (counts) {
      counts[labelType] += 1;
    }
    nText = nText === undefined ? n.toString() : nText;
    extraAtts = extraAtts === undefined ? '' : extraAtts;
    return '<span class="label label-' + labelType + '" ' + extraAtts + '>' + nText + '</span>';
  };

  Renderer.prototype.scoreLabel = function (score, counts, extraAtts) {
    var labelType = this.scoreColorType(score);
    if (counts) {
      counts[labelType] += 1;
    }
    var perc = (score * 100).toFixed(0) + '%';
    extraAtts = extraAtts === undefined ? '' : extraAtts;
    return '<span class="label label-' + labelType + '" ' + extraAtts + '>' + perc + '</span>';
  };

  Renderer.prototype.zeroCounts = function () {
    return { success: 0, warning: 0, danger: 0 };
  };

  Renderer.prototype.attemptsToolTipTexts = {
    success: '5 or more attempts',
    warning: 'less than 5 attempts',
    danger: 'zero attempts',
  };

  Renderer.prototype.avgScoreToolTipTexts = {
    success: 'average score of 80% or more',
    warning: 'average score of 50% to 80%',
    danger: 'average score below 50%',
  };

  Renderer.prototype.predScoreToolTipTexts = {
    success: 'predicted score of 80% or more',
    warning: 'predicted score of 50% to 80%',
    danger: 'predicted score below 50%',
  };

  Renderer.prototype.countsProgressBar = function (
    counts,
    objectType,
    toolTipTexts,
    placement,
    showCounts,
    percentages,
  ) {
    var total = counts.success + counts.warning + counts.danger;
    total = Math.max(1, total);
    var progressBar = function (type) {
      var tooltip;
      if (percentages) {
        tooltip =
          ((counts[type] / total) * 100).toFixed(0) +
          '% of ' +
          objectType +
          's have ' +
          toolTipTexts[type];
      } else {
        tooltip =
          counts[type] +
          ' ' +
          objectType +
          (counts[type] !== 1 ? 's have ' : ' has ') +
          toolTipTexts[type];
      }
      return (
        '<div class="progress-bar progress-bar-' +
        type +
        '"' +
        ' data-toggle="tooltip"' +
        ' data-placement="' +
        placement +
        '"' +
        ' data-original-title="' +
        tooltip +
        '"' +
        ' style="width: ' +
        ((counts[type] / total) * 100).toFixed(3) +
        '%">' +
        (showCounts
          ? '<div class="progress-num">' + (counts[type] > 0 ? counts[type] : '') + '</div>'
          : '') +
        '</div>'
      );
    };
    return (
      '<div class="progress">' +
      progressBar('success') +
      progressBar('warning') +
      progressBar('danger') +
      '</div>'
    );
  };

  /** Produce radios or checkboxes for multiple-choice answers.

        @param {String} type Either "radio" or "checkbox".
        @param {Array} answers A list of answers, each being HTML.
        @return {String} The HTML for the multiple-choice answers.
    */
  Renderer.prototype.answerList = function (type, answers) {
    var entries = [],
      i,
      answerHTML;
    if (type === 'radio') {
      for (var i = 0; i < answers.length; i++) {
        answerHTML = '';
        answerHTML += '<div class="radio">';
        answerHTML += '<label>';
        answerHTML +=
          '<input type="radio" name="selection" value="a' +
          i +
          '" data-checked="submittedAnswer.selection" />';
        answerHTML += answers[i];
        answerHTML += '</label>';
        answerHTML += '</div>';
        entries.push(answerHTML);
      }
    } else if (type === 'checkbox') {
      for (var i = 0; i < answers.length; i++) {
        answerHTML = '';
        answerHTML += '<div class="checkbox">';
        answerHTML += '<label>';
        answerHTML += '<input type="checkbox" data-checkedoptional="submittedAnswer.a' + i + '" />';
        answerHTML += answers[i];
        answerHTML += '</label>';
        answerHTML += '</div>';
        entries.push(answerHTML);
      }
    } else {
      throw Exception('Unknown answerList type: ' + type);
    }
    var html = entries.join('\n');
    return html;
  };

  /** Convert radio or checkbox selections into an array of true/false values.

        @param {String} type Either "radio" or "checkbox".
        @param {Number} n The number of answers.
        @param {Object} submittedAnswer The submittedAnswer object.
        @return {Array} An array of n values, each of which are true/false.
    */
  Renderer.prototype.answersToChecks = function (type, n, submittedAnswer) {
    var checks = [],
      i,
      check;
    for (i = 0; i < n; i++) {
      check = false;
      answerName = 'a' + i;
      if (type === 'radio') {
        if (submittedAnswer.selection === answerName) check = true;
      } else if (type === 'checkbox') {
        if (submittedAnswer[answerName] === true) check = true;
      } else {
        throw Exception('Unknown answersToChecks type: ' + type);
      }
      checks.push(check);
    }
    return checks;
  };

  /** Render an array of HTML strings as an unordered list.

        @param {Array} items Array of HTML strings.
        @return {String} The HTML for the list.
    */
  Renderer.prototype.unorderedList = function (items) {
    return '<ul><li>' + items.join('</li><li>') + '</li></ul>';
  };

  return new Renderer();
});
