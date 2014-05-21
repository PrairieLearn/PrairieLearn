({
    appDir: "../frontend",
    baseUrl: "require",
    mainConfigFile: "../frontend/require/app.js",
    dir: "../frontend-build",
    inlineText: true,
    logLevel: 0,
    modules: [
        {
            name: "app",
            include: [
                "SimpleClient",
                "SimpleFigure"
            ]
        }
    ]
})
