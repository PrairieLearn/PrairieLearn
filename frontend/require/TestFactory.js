
define(["BasicTestClient", "BasicTestView", "BasicTestInstanceView", "BasicTestSidebarView", "AdaptiveTestClient", "AdaptiveTestView", "AdaptiveTestInstanceView", "AdaptiveTestSidebarView", "PracExamTestClient", "PracExamTestView", "PracExamTestInstanceView", "PracExamTestSidebarView", "ExamTestClient", "ExamTestView", "ExamTestInstanceView", "ExamTestSidebarView", "GameTestClient", "GameTestView", "GameTestInstanceView", "GameTestSidebarView"], function(BasicTestClient, BasicTestView, BasicTestInstanceView, BasicTestSidebarView, AdaptiveTestClient, AdaptiveTestView, AdaptiveTestInstanceView, AdaptiveTestSidebarView, PracExamTestClient, PracExamTestView, PracExamTestInstanceView, PracExamTestSidebarView, ExamTestClient, ExamTestView, ExamTestInstanceView, ExamTestSidebarView, GameTestClient, GameTestView, GameTestInstanceView, GameTestSidebarView) {

    var objectMap = {
        "Basic": {
            "client": BasicTestClient,
            "testView": BasicTestView,
            "tInstanceView": BasicTestInstanceView,
            "sidebarView": BasicTestSidebarView,
        },
        "Adaptive": {
            "client": AdaptiveTestClient,
            "testView": AdaptiveTestView,
            "tInstanceView": AdaptiveTestInstanceView,
            "sidebarView": AdaptiveTestSidebarView,
        },
        "PracExam": {
            "client": PracExamTestClient,
            "testView": PracExamTestView,
            "tInstanceView": PracExamTestInstanceView,
            "sidebarView": PracExamTestSidebarView,
        },
        "Exam": {
            "client": ExamTestClient,
            "testView": ExamTestView,
            "tInstanceView": ExamTestInstanceView,
            "sidebarView": ExamTestSidebarView,
        },
        "Game": {
            "client": GameTestClient,
            "testView": GameTestView,
            "tInstanceView": GameTestInstanceView,
            "sidebarView": GameTestSidebarView,
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
