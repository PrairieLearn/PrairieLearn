
define(function() {

    var AdaptiveTestHelper = {};

    AdaptiveTestHelper.renderScoreBar = function(score) {
        var perc = Math.round(score * 100);
        var html;
        var tooltip = 'Your current score for this homework is ' + perc + '%.';
        html = '<div class="progress"'
            + ' data-toggle="tooltip"'
            + ' data-placement="auto top"'
            + ' data-original-title="' + tooltip + '"'
            + '>';
        html += '<div class="progress-bar progress-bar-success" style="width: ' + perc + '%"></div>';
        html += '<div class="progress-bar progress-bar-danger" style="width: ' + (100 - perc) + '%"></div>';
        html += '</div>';
        return html;
    };

    AdaptiveTestHelper.renderDate = function(date) {
        var options = {hour: "numeric", minute: "numeric"};
        var dateString = date.toLocaleTimeString("en-US", options);
        options = {weekday: "short", year: "numeric", month: "numeric", day: "numeric"};
        dateString += ", " + date.toLocaleDateString("en-US", options);;
        return dateString;
    };

    AdaptiveTestHelper.renderDueDate = function(dueDate) {
        var dateString = this.renderDate(dueDate);
        var tooltip = "Due at " + dueDate.toString();
        var html = '<span '
            + ' data-toggle="tooltip"'
            + ' data-placement="auto top"'
            + ' data-original-title="' + tooltip + '"'
            + '>';
        html += 'Due&nbsp;Date: ';
        html += '<strong>';
        html += dateString;
        html += '</strong>';
        html += '</span>';
        return html;
    };

    AdaptiveTestHelper.renderAvailDate = function(availDate) {
        var dateString = this.renderDate(availDate);
        var tooltip = "Due at " + availDate.toString();
        var html = '<span '
            + ' data-toggle="tooltip"'
            + ' data-placement="auto top"'
            + ' data-original-title="' + tooltip + '"'
            + '>';
        html += 'Available: ';
        html += '<strong>';
        html += dateString;
        html += '</strong>';
        html += '</span>';
        return html;
    };

    AdaptiveTestHelper.renderMasteryBar = function(modelData) {
        var masteryBar;
        if (modelData) {
            var mastery = Math.round(modelData.mastery * 100);
            var tooltip = "You currently have " + mastery.toFixed(0) + "% mastery for this homework (maximum 100%).";
            masteryBar = '<div class="progress"'
                + ' data-toggle="tooltip"'
                + ' data-placement="auto top"'
                + ' data-original-title="' + tooltip + '"'
                + '>';
            masteryBar += '<div class="progress-bar progress-bar-success" style="width: ' + mastery.toFixed(0) + '%">' + mastery + '%</div>';
            masteryBar += '<div class="progress-bar progress-bar-danger" style="width: ' + (100 - mastery).toFixed(0) + '%"></div>';
            masteryBar += '</div>';
        } else {
            masteryBar = '<div class="progress"></div>'
        }
        return masteryBar;
    };

    AdaptiveTestHelper.renderRecommendBar = function(modelData, qid) {
        var recommendBar;
        if (modelData) {
            var recommend = modelData.qData[qid] ? modelData.qData[qid].recommend : 0;
            var recommendDisplay = Math.round(recommend * 100);
            var tooltip;
            if (recommendDisplay < 25)
                tooltip = "Not recommended";
            else if (recommendDisplay < 50)
                tooltip = "Slighly recommended";
            else if (recommendDisplay < 75)
                tooltip = "Recommended";
            else
                tooltip = "Highly recommended";

            recommendBar = '<div class="progress"'
                + ' data-toggle="tooltip"'
                + ' data-placement="auto top"'
                + ' data-original-title="' + tooltip + '"'
                + '>';
            recommendBar += '<div class="progress-bar progress-bar-info" style="width: ' + recommendDisplay.toFixed(0) + '%"></div>'
            recommendBar += '</div>';
        } else {
            recommendBar = '<div class="progress"></div>';
        }
        return recommendBar;
    };

    AdaptiveTestHelper.renderCorrectPoints = function(modelData, qid) {
        var correctPoints;
        if (modelData) {
            var correctBenefit = modelData.qData[qid] ? modelData.qData[qid].correctBenefit : 0;
            var tooltip = "Number of mastery points for correctly answering this question.";

            correctPoints = '<span'
                + ' data-toggle="tooltip"'
                + ' data-placement="auto top"'
                + ' data-original-title="' + tooltip + '"'
                + '>';
            correctPoints += (correctBenefit * 100).toFixed(2) + "%";
            correctPoints += '</span>';
        } else {
            correctPoints = '';
        }
        return correctPoints;
    };

    AdaptiveTestHelper.renderIncorrectPoints = function(modelData, qid) {
        var incorrectPoints;
        if (modelData) {
            var incorrectPenalty = modelData.qData[qid] ? modelData.qData[qid].incorrectPenalty : 0;
            var tooltip = "Number of mastery points for incorrectly answering this question.";

            incorrectPoints = '<span'
                + ' data-toggle="tooltip"'
                + ' data-placement="auto top"'
                + ' data-original-title="' + tooltip + '"'
                + '>';
            incorrectPoints += (-incorrectPenalty * 100).toFixed(2) + "%";
            incorrectPoints += '</span>';
        } else {
            incorrectPoints = '';
        }
        return incorrectPoints;
    };

    AdaptiveTestHelper.renderAttempts = function(modelData, qid) {
        var attempts;
        if (modelData) {
            var n = modelData.qData[qid] ? modelData.qData[qid].attempts : 0;
            var tooltip = "You have attempted this question " + n + " " + ((n === 1) ? "time" : "times") + " in this homework.";
            var labelType;
            if (n >= 5) {
                labelType = "success";
            } else if (n >= 1) {
                labelType = "warning";
            } else {
                labelType = "danger";
            }
            var extraAtts = 'data-toggle="tooltip"'
                + ' data-placement="auto top"'
                + ' data-original-title="' + tooltip + '"';
            attempts = '<span class="label label-' + labelType + '" ' + extraAtts + '>' + n + '</span>';
        } else {
            attempts = '';
        }
        return attempts;
    };

    AdaptiveTestHelper.renderMasteryScore = function(modelData) {
        var masteryScore;
        if (modelData) {
            var mastery = Math.round(modelData.mastery * 100);
            var tooltip = "You currently have " + mastery.toFixed(0) + "% mastery for this homework (maximum 100%).";
            masteryScore = '<span'
                + ' data-toggle="tooltip"'
                + ' data-placement="auto top"'
                + ' data-original-title="' + tooltip + '"'
                + '>';
            masteryScore += 'Mastery: '
            masteryScore += '<strong>'
            masteryScore += mastery.toFixed(0) + '%';
            masteryScore += '</strong>'
            masteryScore += '</span>';
        } else {
            masteryScore = '<span></span>'
        }
        return masteryScore;
    };

    AdaptiveTestHelper.renderHWScore = function(tInstance, options) {
        var score = tInstance.get("score");
        var tooltip = "The homework score is " + options.scoreFactor.toFixed(1) + " times the highest mastery achieved before the due date (up to 100%).";
        var extraAtts = 'data-toggle="tooltip"'
            + ' data-placement="auto top"'
            + ' data-original-title="' + tooltip + '"';
        var hwScore = '<span ' + extraAtts + '>';
        hwScore += 'HW Score: ';
        hwScore += '<strong>' + (score * 100).toFixed(0) + '%</strong>';
        hwScore += '</span>';
        return hwScore;
    };

    return AdaptiveTestHelper;
});
