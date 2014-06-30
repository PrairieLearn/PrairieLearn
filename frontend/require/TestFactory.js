
define(["AdaptiveTestClient", "AdaptiveTestView", "AdaptiveTestInstanceView", "AdaptiveTestSidebarView"], function(AdaptiveTestClient, AdaptiveTestView, AdaptiveTestInstanceView, AdaptiveTestSidebarView) {

    var objectMap = {
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
