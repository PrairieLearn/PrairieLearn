
define(["BasicTestClient", "BasicTestView", "BasicTestInstanceView", "BasicTestSidebarView", "AdaptiveTestClient", "AdaptiveTestView", "AdaptiveTestInstanceView", "AdaptiveTestSidebarView", "PracExamTestClient", "PracExamTestView", "PracExamTestInstanceView", "PracExamTestSidebarView"], function(BasicTestClient, BasicTestView, BasicTestInstanceView, BasicTestSidebarView, AdaptiveTestClient, AdaptiveTestView, AdaptiveTestInstanceView, AdaptiveTestSidebarView, PracExamTestClient, PracExamTestView, PracExamTestInstanceView, PracExamTestSidebarView) {

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
