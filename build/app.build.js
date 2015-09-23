({
    appDir: "../frontend",
    baseUrl: "require",
    map: {
        '*': {
            'backbone': 'browser/backbone',
            'underscore': 'browser/underscore',
            'numeric': 'numeric-1.2.6.min',
            'moment': 'moment.min',
            'moment-timezone': 'moment-timezone-with-data-2010-2020',
        }
    },
    shim: {
        'numeric-1.2.6.min': {
            exports: 'numeric'
        },
        'gamma': {
            exports: 'module'
        },
        'd3': {
            exports: 'd3'
        },
        'bootstrap' : {
            deps: ['jquery'],
            exports: 'bootstrap'
        },
        'browser/backbone': {
            deps: ['underscore', 'jquery'],
            exports: 'Backbone'
        },
        'browser/underscore': {
            exports: '_'
        },
        'Tween': {
            exports: 'TWEEN'
        },
        'jquery.cookie': {
            deps: ['jquery']
        },
        'sha1': {
            exports: 'Sha1',
        },
    },
    dir: "../frontend-build",
    inlineText: true,
    logLevel: 0,
    modules: [
        {
            name: "app",
            include: [
                "SimpleClient",
                "SimpleFigure",
                "QServer",
                "MCQServer"
            ]
        }
    ]
})
