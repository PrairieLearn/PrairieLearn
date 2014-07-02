
define(["BasicTestClient", "BasicTestView", "BasicTestInstanceView", "BasicTestSidebarView", "AdaptiveTestClient", "AdaptiveTestView", "AdaptiveTestInstanceView", "AdaptiveTestSidebarView"], function(BasicTestClient, BasicTestView, BasicTestInstanceView, BasicTestSidebarView, AdaptiveTestClient, AdaptiveTestView, AdaptiveTestInstanceView, AdaptiveTestSidebarView) {

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
