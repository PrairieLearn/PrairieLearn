
define(["BasicTestClient", "BasicTestView", "BasicTestDetailView", "BasicTestInstanceView", "BasicTestSidebarView", "AdaptiveTestClient", "AdaptiveTestView", "AdaptiveTestDetailView", "AdaptiveTestInstanceView", "AdaptiveTestSidebarView", "PracExamTestClient", "PracExamTestView", "PracExamTestDetailView", "PracExamTestInstanceView", "PracExamTestSidebarView", "ExamTestClient", "ExamTestView", "ExamTestDetailView", "ExamTestInstanceView", "ExamTestSidebarView", "GameTestClient", "GameTestView", "GameTestDetailView", "GameTestInstanceView", "GameTestSidebarView", "RetryExamTestClient", "RetryExamTestView", "RetryExamTestDetailView", "RetryExamTestInstanceView", "RetryExamTestSidebarView"], function(BasicTestClient, BasicTestView, BasicTestDetailView, BasicTestInstanceView, BasicTestSidebarView, AdaptiveTestClient, AdaptiveTestView, AdaptiveTestDetailView, AdaptiveTestInstanceView, AdaptiveTestSidebarView, PracExamTestClient, PracExamTestView, PracExamTestDetailView, PracExamTestInstanceView, PracExamTestSidebarView, ExamTestClient, ExamTestView, ExamTestDetailView, ExamTestInstanceView, ExamTestSidebarView, GameTestClient, GameTestView, GameTestDetailView, GameTestInstanceView, GameTestSidebarView, RetryExamTestClient, RetryExamTestView, RetryExamTestDetailView, RetryExamTestInstanceView, RetryExamTestSidebarView) {

    var objectMap = {
        "Basic": {
            "client": BasicTestClient,
            "testView": BasicTestView,
            "tDetailView": BasicTestDetailView,
            "tInstanceView": BasicTestInstanceView,
            "sidebarView": BasicTestSidebarView,
        },
        "Adaptive": {
            "client": AdaptiveTestClient,
            "testView": AdaptiveTestView,
            "tDetailView": AdaptiveTestDetailView,
            "tInstanceView": AdaptiveTestInstanceView,
            "sidebarView": AdaptiveTestSidebarView,
        },
        "PracExam": {
            "client": PracExamTestClient,
            "testView": PracExamTestView,
            "tDetailView": PracExamTestDetailView,
            "tInstanceView": PracExamTestInstanceView,
            "sidebarView": PracExamTestSidebarView,
        },
        "Exam": {
            "client": ExamTestClient,
            "testView": ExamTestView,
            "tDetailView": ExamTestDetailView,
            "tInstanceView": ExamTestInstanceView,
            "sidebarView": ExamTestSidebarView,
        },
        "Game": {
            "client": GameTestClient,
            "testView": GameTestView,
            "tDetailView": GameTestDetailView,
            "tInstanceView": GameTestInstanceView,
            "sidebarView": GameTestSidebarView,
        },
        "RetryExam": {
            "client": RetryExamTestClient,
            "testView": RetryExamTestView,
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
