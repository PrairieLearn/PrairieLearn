
define(function() {

    var RetryExamTestHelper = {};

    RetryExamTestHelper.getQuestionData = function(submission, question, open) {
        var data = {};
        if (!open) {
            data.questionOpen = false;
            data.remainingAttempts = question.points.length - question.nGradedAttempts;
            data.remainingPoints = question.points.slice(question.nGradedAttempts + 1).join(", ");
            if (data.remainingAttempts > 0)
                data.availablePoints = question.points[question.nGradedAttempts];
            else
                data.availablePoints = 0;
            if (submission && submission.graded && submission.correct) {
                data.questionStatus = '<span class="label answer-correct">correct</span>';
                data.points = question.awardedPoints;
                data.availablePoints = '';
            } else {
                data.questionStatus = '<span class="label answer-incorrect">incorrect</span>';
                data.points = 0;
                data.availablePoints = '';
            }
            return data;
        }

        data.questionOpen = true;
        data.remainingAttempts = question.points.length - question.nGradedAttempts;
        data.remainingPoints = question.points.slice(question.nGradedAttempts + 1).join(", ");
        if (data.remainingAttempts > 0)
            data.availablePoints = question.points[question.nGradedAttempts];
        else
            data.availablePoints = 0;

        if (submission === undefined) {
            data.questionStatus = '<span class="label answer-none">no answer</span>';
            return data;
        }
        if (submission.graded && submission.correct) {
            data.questionStatus = '<span class="label answer-correct">correct</span>';
            data.points = question.awardedPoints;
            data.availablePoints = '';
            data.questionOpen = false;
            return data;
        }
        if (data.remainingAttempts <= 0) {
            data.questionStatus = '<span class="label answer-incorrect">incorrect</span>';
            data.points = 0;
            data.availablePoints = '';
            data.questionOpen = false;
            return data;
        }
        if (submission.graded && !submission.correct) {
            data.questionStatus = '<span class="label answer-incorrect">incorrect</span>';
            return data;
        }
        data.questionStatus = '<span class="label answer-saved">saved</span>';
        return data;
    };
    
    return RetryExamTestHelper;
});
