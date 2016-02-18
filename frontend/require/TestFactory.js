
define(["BasicTestClient", "BasicTestDetailView", "BasicTestInstanceView", "BasicTestSidebarView", "ExamTestClient", "ExamTestDetailView", "ExamTestInstanceView", "ExamTestSidebarView", "GameTestClient", "GameTestDetailView", "GameTestInstanceView", "GameTestSidebarView", "RetryExamTestClient", "RetryExamTestDetailView", "RetryExamTestInstanceView", "RetryExamTestSidebarView"], function(BasicTestClient, BasicTestDetailView, BasicTestInstanceView, BasicTestSidebarView, ExamTestClient, ExamTestDetailView, ExamTestInstanceView, ExamTestSidebarView, GameTestClient, GameTestDetailView, GameTestInstanceView, GameTestSidebarView, RetryExamTestClient, RetryExamTestDetailView, RetryExamTestInstanceView, RetryExamTestSidebarView) {

    var objectMap = {
        "Basic": {
            "client": BasicTestClient,
            "tDetailView": BasicTestDetailView,
            "tInstanceView": BasicTestInstanceView,
            "sidebarView": BasicTestSidebarView,
        },
        "Exam": {
            "client": ExamTestClient,
            "tDetailView": ExamTestDetailView,
            "tInstanceView": ExamTestInstanceView,
            "sidebarView": ExamTestSidebarView,
        },
        "Game": {
            "client": GameTestClient,
            "tDetailView": GameTestDetailView,
            "tInstanceView": GameTestInstanceView,
            "sidebarView": GameTestSidebarView,
        },
        "RetryExam": {
            "client": RetryExamTestClient,
            "tDetailView": RetryExamTestDetailView,
            "tInstanceView": RetryExamTestInstanceView,
            "sidebarView": RetryExamTestSidebarView,
        },
    };

    var TestFactory = {};

    TestFactory.getClass = function(testType, classType) {
        if (objectMap[testType])
            if (objectMap[testType][classType])
                return objectMap[testType][classType];
        return undefined;
    };

    return TestFactory;
});
