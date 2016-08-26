var PRAIRIELEARN_DEFAULT_API_SERVER = "http://localhost:3000";

requirejs.config({
    baseUrl: 'require',
    paths: {
        clientCode: (document.PLConfig.apiServer || PRAIRIELEARN_DEFAULT_API_SERVER) + "/clientCode",
    },
    map: {
        '*': {
            'backbone': 'browser/backbone',
            'underscore': 'browser/underscore',
            'numeric': 'numeric-1.2.6.min',
            'moment': 'moment.min',
            'moment-timezone': 'moment-timezone-with-data-2010-2020',
        }
    },
    waitSeconds: 60,
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
        'naturalSort': {
            exports: 'naturalSort',
        },
        'jquery-ui': {
            deps: ['jquery']
        },
        'jquery.jsPlumb': {
            deps: ['jquery', 'jquery-ui']
        },
        'ace/ace': {
            deps: ['jquery', 'jquery-ui']
        }
    },
    config: {
        text: {
            useXhr: function(url, protocol, hostname, port) {
                // see https://github.com/jrburke/requirejs/issues/269
                return true;
                // return true if you want to allow this url, given that the
                // text plugin thinks the request is coming from protocol, hostname, port.

                // unilaterally returning true here may mean that html
                // files aren't loaded from the optimized
                // one-big-js-file
            }
        },
    },
});

requirejs(['jquery', 'jquery.cookie', 'underscore', 'async', 'backbone', 'bootstrap', 'mustache', 'moment-timezone', 'PrairieRole', 'PrairieRandom', 'NavView', 'QuestionDataModel', 'QuestionView', 'TestInstanceCollection', 'TestDetailView', 'TestInstanceView', 'TestModel', 'StatsModel', 'StatsView', 'AssessView', 'UserView', 'SyncModel', 'SyncView', 'ErrorsView', 'spinController', 'jquery-ui', 'jquery.jsPlumb', 'ace/ace'],
function(   $,        jqueryCookie,    _,            async,   Backbone,   bootstrap,   Mustache,   moment,            PrairieRole,   PrairieRandom,   NavView,   QuestionDataModel,   QuestionView,   TestInstanceCollection,   TestDetailView,   TestInstanceView,   TestModel,   StatsModel,   StatsView,   AssessView,   UserView,   SyncModel,   SyncView,   ErrorsView,   spinController,   jqueryUi,    jsPlumb,          ace) {

    var QuestionModel = Backbone.Model.extend({
        idAttribute: "qid"
    });

    var QuestionCollection = Backbone.Collection.extend({
        model: QuestionModel,
    });

    var TestCollection = Backbone.Collection.extend({
        model: TestModel.TestModel,
    });

    var UserModel = Backbone.Model.extend({
        idAttribute: "uid"
    });

    var UserCollection = Backbone.Collection.extend({
        model: UserModel
    });

    var ErrorListModel = Backbone.Model.extend({
    });

    var PullModel = Backbone.Model.extend({
        idAttribute: "pid"
    });

    var PullCollection = Backbone.Collection.extend({
        model: PullModel,
        comparator: function(pull) {return -(new Date(pull.get("createDate"))).getTime();},
    });

    var TestStatsModel = Backbone.Model.extend({
        idAttribute: "tid",
    });

    var TestStatsCollection = Backbone.Collection.extend({
        model: TestStatsModel,
    });

    var AppModel = Backbone.Model.extend({
        initialize: function() {
            defaultConfig = {
                mode: "Default",
                page: "assess",
                tid: null,
                tiid: null,
                pageOptions: {},
                deployMode: false,
                apiServer: PRAIRIELEARN_DEFAULT_API_SERVER,
                authUID: null,
                authRole: null,
                authName: null,
                authDate: null,
                authSignature: null,
                userUID: null,
                userRole: null,
                userName: null,
                pageTitle: "PrairieLearn",
                navTitle: "PrairieLearn",
                authURL: null,
                gitCourseBranch: null,
                remoteFetchURL: null,
                courseName: "unknownCourseName",
                courseTitle: "unknownCourseTitle",
                timezone: "UTC",
                version: null,
            };
            this.set(_(document.PLConfig).defaults(defaultConfig));
            if (this.get("authURL") === null)
                this.set("authURL", this.apiURL("auth"));

            document.title = this.get("pageTitle");

            this.listenTo(Backbone, "tryAgain", this.tryAgain);
        },

        fetch: function() {
            var that = this;
            $.getJSON(that.get("authURL"), function(data) {
                that.set({
                    authUID: data.uid,
                    authRole: data.role,
                    authName: data.name,
                    authDate: data.date,
                    authSignature: data.signature,
                    userUID: data.uid,
                    userRole: data.role,
                    userName: data.name
                });
                that.setUserCookie();

                async.parallel([
                        function(callback) {
                            $.getJSON(that.apiURL("users/" + that.get("authUID")))
                                .done(function(userData) {
                                    that.set({
                                        "authRole": userData.role,
                                        "userRole": userData.role,
                                    });
                                    that.setUserCookie();
                                    callback(null);
                                })
                                .fail(function(jqxhr, textStatus, error) {
                                    callback(error);
                                });
                        },
                        function(callback) {
                            $.getJSON(that.apiURL("course"))
                                .done(function(courseInfo) {
                                    that.set({
                                        'timezone': courseInfo.timezone,
                                        'courseName': courseInfo.name,
                                        'courseTitle': courseInfo.title,
                                        'pageTitle': 'PrairieLearn: ' + courseInfo.name + ' (' + courseInfo.title + ')',
                                        'navTitle': 'PrairieLearn: ' + courseInfo.name,
                                        'gitCourseBranch': courseInfo.gitCourseBranch,
                                        'remoteFetchURL': courseInfo.remoteFetchURL,
                                        'devMode': courseInfo.devMode,
                                    });
                                    document.title = that.get("pageTitle");
                                    callback(null);
                                })
                                .fail(function(jqxhr, textStatus, error) {
                                    callback(error);
                                });
                        },
                        function(callback) {
                            if (document.PLVersion && document.PLVersion.gitDescribe) {
                                that.set('version', document.PLVersion);
                                callback(null);
                            } else {
                                $.getJSON(that.apiURL("version"))
                                    .done(function(version) {
                                        that.set('version', version);
                                        callback(null);
                                    })
                                    .fail(function(jqxhr, textStatus, error) {
                                        callback(error);
                                    });
                            }
                        },
                ], function(err) {
                    if (err) {
                        $("#error").append('<div class="alert alert-danger" role="alert">' + err + '</div>');
                        // blindly continue
                    }

                    that.trigger("initialized");
                });
            });
        },

        apiURL: function(path) {
            return this.get("apiServer") + "/" + path;
        },

        setUserCookie: function() {
            var parser = document.createElement('a');
            parser.href = this.get('apiServer');
            var domainFlag = ';' + parser.hostname;

            var secureFlag = '';
            if (parser.protocol == 'https:') {
                secureFlag = ';secure';
            }

            var userData = {
                authUID: this.get("authUID"),
                authName: this.get("authName"),
                authDate: this.get("authDate"),
                authSignature: this.get("authSignature"),
                mode: this.get("mode"),
                userUID: this.get("userUID"),
                userRole: this.get("userRole"),
            };

            var newCookie = 'userData=' + JSON.stringify(userData)
                + ';max-age=86400; path=/' + secureFlag + domainFlag
            document.cookie = newCookie;

            if (!$.cookie('userData')) {
                $('#error').append('<div class="alert alert-danger" role="alert">Failed to set cookie. Please ensure that cookies are enabled.</div>');
            }
        },

        tryAgain: function() {
            this.trigger("change");
        },

        hasPermission: function(operation, type) {
            var role;
            if (type == "auth") {
                role = this.get('authRole');
            } else {
                role = this.get('userRole');
            }
            if (role == null)
                return false;

            return PrairieRole.hasPermission(role, operation);
        },

        availableRoles: function() {
            var role = this.get('authRole');
            return PrairieRole.availableRoles(role);
        },

        dateMilliTimestamp: function(dateString) {
            return Number(moment(dateString).format("x"));
        },

        formatDate: function(dateString) {
            if (dateString)
                return moment.tz(dateString, this.get("timezone")).format("ddd, MMM D, h:mma");
            else
                return '—';
        },

        formatDateLong: function(dateString) {
            if (dateString)
                return moment.tz(dateString, this.get("timezone")).format("dddd, YYYY‑MM‑DD, HH:mm, z (Z)");
            else
                return '—';
        },

        formatDatePrecise: function(dateString) {
            if (dateString)
                return moment.tz(dateString, this.get("timezone")).format("YYYY‑MM‑DD, HH:mm:ss.SSSS, z (Z)");
            else
                return '—';
        },

        formatVisibleAccess: function(visibleAccess) {
            var that = this;
            var s = null;
            if (visibleAccess && visibleAccess.length > 0) {
                s = '<table class="table"><tr><th>Credit</th><th>Start</th><th>End</th>';
                _(visibleAccess).each(function(r) {
                    s += r.active ? '<tr class="warning">' : '<tr>';
                    s += '<td>' + ((r.credit > 0) ? (r.credit + '%') : 'None') + '</td>';
                    s += '<td>' + that.formatDateLong(r.startDate) + '</td>';
                    s += '<td>' + that.formatDateLong(r.endDate) + '</td>';
                    s += '</tr>'
                });
                s += '</table>';
            }
            return s;
        },
    });

    var AppView = Backbone.View.extend({
        initialize: function() {
            this.store = this.options.store;
            this.router = this.options.router; // hack to enable random question URL re-writing
            this.questions = this.options.questions;
            this.tests = this.options.tests;
            this.tInstances = this.options.tInstances;
            this.users = this.options.users;
            this.pulls = this.options.pulls;
            this.syncModel = this.options.syncModel;
            this.currentView = null;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.model, "change:userUID change:userRole change:mode", this.reloadUserData);
            this.listenTo(Backbone, "reloadUserData", this.reloadUserData);
            this.navView = new NavView.NavView({model: this.model, users: this.users, tests: this.tests, tInstances: this.tInstances, store: this.store});
            this.navView.render();
            $("#nav").html(this.navView.el);
        },

        render: function() {
            var target = document.getElementById('content');
            var spinner = spinController.startSpinner(target);
            var view;
            switch (this.model.get("page")) {
            case "stats":
                var statsModel = new StatsModel.StatsModel({}, {appModel: this.model});
                view = new StatsView.StatsView({model: statsModel, store: this.store});
                break;
            case "assess":
                view = new AssessView({appModel: this.model, tests: this.tests, tInstances: this.tInstances, router: this.router, store: this.store});
                break;
            case "testInstance":
                var tiid = this.model.get("pageOptions").tiid;
                var tInstance = this.tInstances.get(tiid);
                var tid = tInstance.get("tid");
                var test = this.tests.get(tid);

                if (test.get("shuffleQuestions") && !tInstance.get("shuffled")) {
                    var questions = tInstance.get("questions");
                    var uniqueIdKey = tInstance.get("tid");
                    var uniqueIdRand = new PrairieRandom.RandomGenerator(uniqueIdKey);
                    var uniqueIds = uniqueIdRand.randArrayUniqueInt(questions.length, 100, 999, 1);

                    if (this.model.get("userRole") === "Student") {
                        var shuffleKey = this.model.get("userUID") + "_" + tInstance.get("tid");
                        var shuffleRand = new PrairieRandom.RandomGenerator(shuffleKey);

                        var shuffledIndices = shuffleRand.randPerm(questions.length);
                        var shuffledQuestions = new Array();
                        var shuffledQids = new Array();
                        var shuffledUniqueIds = new Array();
                        _(questions).each(function(question, index) {
                            shuffledQuestions.push(questions[shuffledIndices[index]]);
                            shuffledQids.push(shuffledQuestions[index]["qid"]);
                            shuffledUniqueIds.push(uniqueIds[shuffledIndices[index]]);
                        });
                        tInstance.set("questions", shuffledQuestions);
                        tInstance.set("qids", shuffledQids);
                    }
                    else {
                        var qids = new Array();
                        _(questions).each(function(question, index) {
                            qids.push(question["qid"]);
                        });
                        tInstance.set("qids", qids);
                    }

                    tInstance.set("uniqueIds", uniqueIds);
                    tInstance.set("shuffled", true);
                }

                view = new TestInstanceView({model: tInstance, test: test, appModel: this.model, store: this.store});
                break;
            case "testDetail":
                var tid = this.model.get("pageOptions").tid;
                var test = this.tests.get(tid);
                view = new TestDetailView({model: test, appModel: this.model, store: this.store});
                break;
            case "tInstanceQuestion":
                var tiid = this.model.get("pageOptions").tiid;
                var qNumber = this.model.get("pageOptions").qNumber;
                var vid = this.model.get("pageOptions").vid;
                var qIndex = qNumber - 1;
                var tInstance = this.tInstances.get(tiid);
                var tid = tInstance.get("tid");
                var test = this.tests.get(tid);

                if (test.get("shuffleQuestions") && !tInstance.get("shuffled")) {
                    var questions = tInstance.get("questions");
                    var uniqueIdKey = tInstance.get("tid");
                    var uniqueIdRand = new PrairieRandom.RandomGenerator(uniqueIdKey);
                    var uniqueIds = uniqueIdRand.randArrayUniqueInt(questions.length, 100, 999, 1);

                    if (this.model.get("userRole") === "Student") {
                        var shuffleKey = this.model.get("userUID") + "_" + tInstance.get("tid");
                        var shuffleRand = new PrairieRandom.RandomGenerator(shuffleKey);

                        var shuffledIndices = shuffleRand.randPerm(questions.length);
                        var shuffledQuestions = new Array();
                        var shuffledQids = new Array();
                        var shuffledUniqueIds = new Array();
                        _(questions).each(function(question, index) {
                            shuffledQuestions.push(questions[shuffledIndices[index]]);
                            shuffledQids.push(shuffledQuestions[index]["qid"]);
                            shuffledUniqueIds.push(uniqueIds[shuffledIndices[index]]);
                        });
                        tInstance.set("questions", shuffledQuestions);
                        tInstance.set("qids", shuffledQids);
                    }
                    else {
                        var qids = new Array();
                        _(questions).each(function(question, index) {
                            qids.push(question["qid"]);
                        });
                        tInstance.set("qids", qids);
                    }

                    tInstance.set("uniqueIds", uniqueIds);
                    tInstance.set("shuffled", true);
                }

                var qid;
                if (tInstance.has("qids"))
                    qid = tInstance.get("qids")[qIndex];
                else
                    qid = test.get("qids")[qIndex];
                var questionDataModel = new QuestionDataModel.QuestionDataModel({}, {appModel: this.model, qid: qid, vid: vid, tInstance: tInstance, test: test});
                /*
                test.callWithHelper(function() {
                    var helper = test.get("helper");
                    if (helper.adjustQuestionDataModel)
                        helper.adjustQuestionDataModel(questionDataModel, test, tInstance);
                });
                */
                view = new QuestionView.QuestionView({model: questionDataModel, test: test, tInstance: tInstance, appModel: this.model, store: this.store});
                break;
            case "testQuestion":
                var tid = this.model.get("pageOptions").tid;
                var qid = this.model.get("pageOptions").qid;
                var vid = this.model.get("pageOptions").vid;
                var test = this.tests.get(tid);
                var questionDataModel = new QuestionDataModel.QuestionDataModel({}, {appModel: this.model, qid: qid, vid: vid, test: test});
                view = new QuestionView.QuestionView({model: questionDataModel, test: test, appModel: this.model, store: this.store});
                break;

            /**
             * Chooses a question from an active test, excluding any questions in skipQNumbers.
             */
            case "chooseTInstanceQuestion":
                var tiid = this.model.get("pageOptions").tiid;
                var qInfo = this.model.get("pageOptions").qInfo;
                var skipQNumbers = this.model.get("pageOptions").skipQNumbers;
                var tInstance = this.tInstances.get(tiid);
                var tid = tInstance.get("tid");
                var test = this.tests.get(tid);
                var qids;
                if (tInstance.has("qids"))
                    qids = tInstance.get("qids");
                else
                    qids = test.get("qids");


                // skipQNumbers is an array of strings, containing a question number (starting from question 1, not zero-based)
                // ...we'll map them to integers
                var skipQuestionNumbers = _(skipQNumbers).map(function (s) { return parseInt(s); });

                // fill an array with all question numbers (from qids)
                var allQuestionNumbers = _.range(1, qids.length + 1);

                // remove the skipped questions from the list of all questions
                var remainingQuestionNumbers = _(allQuestionNumbers).difference(skipQuestionNumbers);

                // randomly choose a next question from the list of remaining questions
                var chosenQuestionNumber = _.sample(remainingQuestionNumbers);

                // navigate the page to the new question
                this.router.navigate("q/" + tiid + "/" + chosenQuestionNumber, true);
                return;

            case "user":
                view = new UserView.UserView({model: this.model, store: this.store});
                break;

            case "sync":
                view = new SyncView.SyncView({model: this.model, pulls: this.pulls, syncModel: this.syncModel, store: this.store});
                break;

            case "errors":
                view = new ErrorsView.ErrorsView({model: this.model, appModel: this.model, store: this.store});
                break;
            }
            this.showView(view);
            spinController.stopSpinner(spinner);
        },

        showView: function(view) {
            if (this.currentView != null) {
                this.currentView.close();
            }
            this.currentView = view;
            view.render();
            $("#content").html(view.el);
            $('[data-toggle=tooltip]').tooltip();
        },

        reloadUserData: function() {
            var that = this;
            var errors = [];
            async.parallel([
                function(callback) {
                    that.questions.reset();
                    that.questions.fetch({
                        success: function() {callback(null);},
                        error: function() {errors.push("Error fetching questions"); callback(null);},
                    });
                },
                function(callback) {
                    that.tests.reset();
                    that.tests.fetch({
                        success: function() {callback(null);},
                        error: function() {errors.push("Error fetching tests"); callback(null);},
                    });
                },
                function(callback) {
                    that.tInstances.reset();
                    that.tInstances.fetch({
                        success: function() {callback(null);},
                        error: function() {errors.push("Error fetching tInstances"); callback(null);},
                    });
                },
                function(callback) {
                    that.users.reset();
                    that.users.fetch({
                        success: function() {callback(null);},
                        error: function() {errors.push("Error fetching users"); callback(null);},
                    });
                },
            ], function(err) {
                if (err) {
                    $("#error").append('<div class="alert alert-danger" role="alert">' + err + '</div>');
                    // no return, we want to do updates
                }
                if (errors.length > 0) {
                    $("#error").html('<div class="alert alert-danger" role="alert">' + errors.join(', ') + '</div>');
                    // no return, we want to do updates
                }
                that.router.checkCurrentTest();
            });
        },
    });

    var AppRouter = Backbone.Router.extend({
        routes: {
            "stats": "goStats",
            "assess": "goAssess",
            "q/:tid/:tiNumber/:qNumber": "goTInstanceQuestion",
            "tq/:tid/:qid(/:vid)": "goTestQuestion",
            "cq/:tiid/:qInfo(/not/:skipQNumbers)": "goChooseTInstanceQuestion",
            "ti/:tid(/:tiNumber)": "goTestInstance",
            "t/:tid": "goTestDetail",
            "user": "goUser",
            "sync": "goSync",
            "errors": "goErrors",
            "*actions": "goAssess"
        },

        initialize: function(options) {
            this.model = options.model;
            this.tests = options.tests;
            this.tInstances = options.tInstances;
        },

        checkCurrentTest: function() {
            var tid = this.model.get("tid");
            var tiid = this.model.get("tiid");
            if (!this.tests.get(tid)) {
                this.model.set({
                    tid: null,
                    tiid: null,
                });
            } else {
                var theseTInstances = new Backbone.Collection(this.tInstances.where({tid: tid}));
                if (!theseTInstances.get(tiid)) {
                    var possibleTIIDs = theseTInstances.pluck("tiid");
                    if (possibleTIIDs.length > 0) {
                        this.model.set("tiid", possibleTIIDs[0]);
                    } else {
                        this.model.set("tiid", null);
                    }
                }
            }
        },

        goStats: function() {
            this.model.set({
                page: "stats",
                pageOptions: {},
            });
        },

        goAssess: function() {
            this.model.set({
                page: "assess",
                pageOptions: {},
            });
        },

        goTInstanceQuestion: function(tid, tiNumber, qNumber) {
            var testTInstances = new Backbone.Collection(this.tInstances.where({tid: tid}));
            if (testTInstances.length == 0) {
                window.location.replace(window.location.host);
            }
            var tInstance = null;
            try {
                tiNumber = Number(tiNumber);
            } catch (e) {
                tiNumber = null;
            }
            if (tiNumber) {
                var theseTInstances = new Backbone.Collection(testTInstances.where({number: tiNumber}));
                if (theseTInstances.length > 0) {
                    tInstance = theseTInstances.first();
                }
            }
            if (tInstance == null) {
                tInstance = testTInstances.first();
            }
            var tid = tInstance.get("tid");
            var tiid = tInstance.get("tiid");
            this.model.set({
                page: "tInstanceQuestion",
                pageOptions: {tiid: tiid, qNumber: qNumber},
                tid: tid,
                tiid: tiid,
            });
        },

        goTestQuestion: function(tid, qid, vid) {
            this.model.set({
                page: "testQuestion",
                pageOptions: {tid: tid, qid: qid, vid: vid},
                tid: tid,
            });
            this.checkCurrentTest();
        },

        goChooseTInstanceQuestion: function(tiid, qInfo, skipQNumbers) {
            skipQNumbers = (skipQNumbers == null) ? [] : skipQNumbers.split(",");
            var tInstance = this.tInstances.get(tiid);
            var tid = tInstance ? tInstance.get("tid") : null;
            this.model.set({
                page: "chooseTInstanceQuestion",
                pageOptions: {tiid: tiid, qInfo: qInfo, skipQNumbers: skipQNumbers},
                tid: tid,
                tiid: tiid,
            });
            this.checkCurrentTest();
        },

        goTestInstance: function(tid, tiNumber) {
            var testTInstances = new Backbone.Collection(this.tInstances.where({tid: tid}));
            if (testTInstances.length == 0) {
                window.location.replace(window.location.host);
            }
            var tInstance = null;
            try {
                tiNumber = Number(tiNumber);
            } catch (e) {
                tiNumber = null;
            }
            if (tiNumber) {
                var theseTInstances = new Backbone.Collection(testTInstances.where({number: tiNumber}));
                if (theseTInstances.length > 0) {
                    tInstance = theseTInstances.first();
                }
            }
            if (tInstance == null) {
                tInstance = testTInstances.first();
            }
            var tid = tInstance.get("tid");
            var tiid = tInstance.get("tiid");
            this.model.set({
                page: "testInstance",
                pageOptions: {tiid: tiid},
                tid: tid,
                tiid: tiid,
            });
        },

        goTestDetail: function(tid) {
            this.model.set({
                page: "testDetail",
                pageOptions: {tid: tid},
                tid: tid,
            });
            this.checkCurrentTest();
        },

        goUser: function() {
            this.model.set({
                page: "user",
                pageOptions: {},
            });
        },

        goSync: function() {
            this.model.set({
                page: "sync",
                pageOptions: {},
            });
        },

        goErrors: function() {
            this.model.set({
                page: "errors",
                pageOptions: {},
            });
        },
    });

    var Store = Backbone.Model.extend({
        initialize: function(attributes, options) {
            this.router = options.router;
            this.appModel = options.appModel;
            this.questions = options.questions;
            this.tests = options.tests;
            this.tInstances = options.tInstances;
            this.users = options.users;
            this.errorList = options.errorList;
            this.pulls = options.pulls;
            this.syncModel = options.syncModel;
            this.testStatsColl = options.testStatsColl;
        },

        tiidShortName: function(tiid) {
            var tInstance = this.tInstances.get(tiid);
            if (!tInstance) return "Invalid tInstance";
            var tid = tInstance.get("tid");
            var test = this.tests.get(tid);
            if (!test) return "Invalid test";
            var options = test.get("options");
            if (test.get("multipleInstance")) {
                return test.get("set") + ' ' + test.get("number") + ' #' + tInstance.get("number");
            } else {
                return test.get("set") + ' ' + test.get("number");
            }
        },

        tiidLongName: function(tiid) {
            var tInstance = this.tInstances.get(tiid);
            if (!tInstance) return "Invalid tInstance";
            var tid = tInstance.get("tid");
            var test = this.tests.get(tid);
            if (!test) return "Invalid test";
            var options = test.get("options");
            if (test.get("multipleInstance")) {
                return test.get("set") + ' ' + test.get("number") + ' #' + tInstance.get("number") + ': ' + test.get("title");
            } else {
                return test.get("set") + ' ' + test.get("number") + ': ' + test.get("title");
            }
        },

        tidShortName: function(tid) {
            var test = this.tests.get(tid);
            if (!test) return "Invalid test";
            return test.get("set") + ' ' + test.get("number");
        },

        tidLongName: function(tid) {
            var test = this.tests.get(tid);
            if (!test) return "Invalid test";
            return test.get("set") + ' ' + test.get("number") + ': ' + test.get("title");
        },

        reloadTestStatsForTID: function(tid) {
            var testStats = this.testStatsColl.get(tid);
            if (testStats) {
                testStats.fetch();
            }
        },

        changeUserUID: function(newUID) {
            if (newUID === "") return;

            var newName;
            var user = this.users.get(newUID);
            if (user) {
                newName = user.get("name");
            } else {
                newName = "Invalid User";
            }
            this.appModel.set({
                "userUID": newUID,
                "userName": newName,
            }, {silent: true});
            this.appModel.setUserCookie();
            this.appModel.trigger("change:userUID change");
        },

        changeUserRole: function(newRole) {
            this.appModel.set("userRole", newRole, {silent: true});
            this.appModel.setUserCookie();
            this.appModel.trigger("change:userRole change");
        },

        changeMode: function(newMode) {
            this.appModel.set("mode", newMode, {silent: true});
            this.appModel.setUserCookie();
            this.appModel.trigger("change:mode change");
        },
    });

    $(function() {
        var appModel = new AppModel();

        var questions = new QuestionCollection([], {
            url: function() {return appModel.apiURL("questions");}
        });
        var tests = new TestCollection([], {
            url: function() {return appModel.apiURL("tests");}
        });
        var tInstances = new TestInstanceCollection.TestInstanceCollection([], {
            tests: tests,
            url: function() {return appModel.apiURL("tInstances/?uid=" + appModel.get("userUID"));}
        });
        var users = new UserCollection([], {
            url: function() {return appModel.apiURL("users");}
        });
        var errorList = new ErrorListModel([], {
            url: function() {return appModel.apiURL("errorList");}
        });
        var pulls = new PullCollection([], {
            url: function() {return appModel.apiURL("coursePulls");}
        });
        var syncModel = new SyncModel.SyncModel();
        var testStatsColl = new TestStatsCollection([], {
            url: function() {return appModel.apiURL("testStats");}
        });

        var router = new AppRouter({model: appModel, tests: tests, tInstances: tInstances});

        var store = new Store({}, {
            router: router,
            appModel: appModel,
            questions: questions,
            tests: tests,
            tInstances: tInstances,
            users: users,
            errorList: errorList,
            pulls: pulls,
            syncModel: syncModel,
            testStatsColl: testStatsColl,
        });

        $.ajaxPrefilter(function(options, originalOptions, jqXHR) {
            var headers = {};
            if (appModel.get("authUID")) headers["X-Auth-UID"] = String(appModel.get("authUID"));
            if (appModel.get("authName")) headers["X-Auth-Name"] = String(appModel.get("authName"));
            if (appModel.get("authDate")) headers["X-Auth-Date"] = String(appModel.get("authDate"));
            if (appModel.get("authSignature")) headers["X-Auth-Signature"] = String(appModel.get("authSignature"));
            if (appModel.get("mode")) headers["X-Mode"] = String(appModel.get("mode"));
            if (appModel.get("userUID")) headers["X-User-UID"] = String(appModel.get("userUID"));
            if (appModel.get("userRole")) headers["X-User-Role"] = String(appModel.get("userRole"));
            options.headers = headers;
        });

        appModel.once("initialized", function() {
            var errors = [];
            async.parallel(
                [
                    function(callback) {
                        questions.fetch({
                            success: function() {callback(null);},
                            error: function() {errors.push("Error fetching questions"); callback(null);},
                        });
                    },
                    function(callback) {
                        tests.fetch({
                            success: function() {callback(null);},
                            error: function() {errors.push("Error fetching tests"); callback(null);},
                        });
                    },
                    function(callback) {
                        tInstances.fetch({
                            success: function() {callback(null);},
                            error: function() {errors.push("Error fetching tInstances"); callback(null);},
                        });
                    },
                    function(callback) {
                        users.fetch({
                            success: function() {callback(null);},
                            error: function() {errors.push("Error fetching users"); callback(null);},
                        });
                    },
                    function(callback) {
                        errorList.fetch({
                            success: function() {callback(null);},
                            error: function() {errors.push("Error fetching errorList"); callback(null);},
                        });
                    },
                    function(callback) {
                        pulls.fetch({
                            success: function() {callback(null);},
                            error: function() {errors.push("Error fetching pulls"); callback(null);},
                        });
                    },
                ],
                function(err) {
                    if (err) {
                        $("#error").append('<div class="alert alert-danger" role="alert">' + err + '</div>');
                        return;
                    }
                    if (errors.length > 0) {
                        $("#error").html('<div class="alert alert-danger" role="alert">' + errors.join(', ') + '</div>');
                        // no return here, keep going despite errors
                    }

                    // load non-critical data
                    store.testStatsColl.fetch({
                        success: function() {},
                        error: function() {
                            $("#error").append('<div class="alert alert-danger" role="alert">Error fetching testStats</div>');
                        },
                    });

                    Backbone.history.start();
                    var appView = new AppView({
                        model: appModel,
                        store: store,
                        questions: questions,
                        tests: tests,
                        tInstances: tInstances,
                        router: router,
                        users: users,
                        errorList: errorList,
                        pulls: pulls,
                        syncModel: syncModel,
                    });
                    appView.render();
                });
        });

        appModel.fetch();
    });
});
