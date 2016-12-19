
define(function() {

    var BasicTestHelper = {};

    BasicTestHelper.renderHWScore = function(score) {
        var perc = Math.round(score * 100);
        var html;
        var tooltip = 'Your average score on all questions for this homework is ' + perc + '%.';
        html = '<span '
            + ' data-toggle="tooltip"'
            + ' data-placement="auto top"'
            + ' data-original-title="' + tooltip + '"'
            + '>';
        html += 'Score: ';
        html += '<strong>' + perc + '%' + '</strong>';
        html += '</span>';
        return html;
    };

    BasicTestHelper.renderScoreBar = function(score) {
        var perc = Math.round(score * 100);
        var html;
        var tooltip = 'Your average score on all questions for this homework is ' + perc + '%.';
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

    BasicTestHelper.renderQAttempts = function(data) {
        var html;
        var n = data ? data.nAttempt : 0;
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
        html = '<span class="label label-' + labelType + '" ' + extraAtts + '>' + n + '</span>';
        return html;
    };

    BasicTestHelper.renderQScore = function(data) {
        var html;
        var score = data ? data.avgScore : 0;
        var tooltip = "Your average score on all attempts for this question is " + (score * 100).toFixed(0) + '%.';
        var extraAtts = 'data-toggle="tooltip"'
            + ' data-placement="auto top"'
            + ' data-original-title="' + tooltip + '"';
        var labelType;
        if (score >= 0.8) {
            labelType = "success";
        } else if (score >= 0.5) {
            labelType = "warning";
        } else {
            labelType = "danger";
        }
        var perc = (score * 100).toFixed(0) + '%';
        html = '<span class="label label-' + labelType + '" ' + extraAtts + '>' + perc + '</span>';
        return html;
    };

    return BasicTestHelper;
});
