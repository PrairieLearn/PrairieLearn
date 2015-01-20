
define(function() {

    var GameTestHelper = {};

    GameTestHelper.renderDate = function(date) {
        var options = {hour: "numeric", minute: "numeric"};
        var dateString = date.toLocaleTimeString("en-US", options);
        options = {weekday: "short", year: "numeric", month: "numeric", day: "numeric"};
        dateString += ", " + date.toLocaleDateString("en-US", options);;
        return dateString;
    };

    GameTestHelper.renderDueDate = function(dueDate) {
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

    GameTestHelper.renderAvailDate = function(availDate) {
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

    GameTestHelper.renderHWScore = function(tInstance, test, options) {
        var score = tInstance.get("score");
        var maxScore = test.get("maxScore");
        var scorePerc = score / maxScore * 100;
        var hwScore = '<span>';
        hwScore += 'HW Score: ';
        hwScore += '<strong>' + scorePerc.toFixed(1) + '%</strong>';
        hwScore += ' (' + score + '/' + maxScore + ')';
        hwScore += '</span>';
        return hwScore;
    };

    GameTestHelper.renderHWScoreBar = function(tInstance, test, options) {
        var score = tInstance.get("score");
        var maxScore = test.get("maxScore");
        var scorePerc = score / maxScore * 100;
        var html;
        html = '<div class="progress">';
        html += '<div class="progress-bar progress-bar-success" style="width: ' + scorePerc.toFixed(3) + '%"></div>';
        html += '<div class="progress-bar progress-bar-danger" style="width: ' + (100 - scorePerc).toFixed(3) + '%"></div>';
        html += '</div>';
        return html;
    };

    GameTestHelper.renderQuestionValue = function(value, initValue) {
        var html = '<span class="label label-primary">';
        html += value;
        html += '</span>';
        return html;
    };

    GameTestHelper.renderQuestionScore = function(score, maxScore) {
        var html = '<span class="label label-';
        if (score === 0) {
            html += 'danger';
        } else if (score < maxScore) {
            html += 'warning';
        } else {
            html += 'success';
        }
        html += '">';
        html += score + '/' + maxScore;
        html += '</span>';
        return html;
    };

    return GameTestHelper;
});
