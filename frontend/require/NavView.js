
define(['underscore', 'backbone', 'mustache', 'text!NavView.html'], function(_, Backbone, Mustache, navViewTemplate) {

    var NavView = Backbone.View.extend({

        tagName: 'nav',

        events: {
            "click #nav-reload": "reload",
        },

        initialize: function() {
            this.store = this.options.store;
            this.users = this.options.users;
            this.tests = this.options.tests;
            this.tInstances = this.options.tInstances;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.tests, "all", this.render);
            this.listenTo(this.tInstances, "all", this.render);
        },

        render: function() {
            var data = {};
            data.navTitle = this.model.get("navTitle");
            data.userName = this.model.get("userName");
            data.userRole = this.model.get("userRole");
            data.mode = this.model.get("mode");
            data.viewOtherUsersPerm = this.model.hasPermission("viewOtherUsers", "auth");
            data.viewSync = this.model.hasPermission("viewCoursePulls");
            data.viewErrors = this.model.hasPermission("viewErrors");
            data.devMode = this.model.get("devMode");

            var tid = this.model.get("tid");
            var tiid = this.model.get("tiid");
            if (tid) {
                var test = this.tests.get(tid);
                if (test) {
                    var testOptions = test.get("options");
                    if (this.model.hasPermission("seeAdminPages")) {
                        data.currentDetailName = "Admin";
                        data.currentDetailLink = "#t/" + tid;
                    }
                    if (tiid) {
                        var tInstance = this.tInstances.get(tiid);
                        var tiNumber = tInstance.get("number");
                        if (tInstance) {
                            data.currentAssessmentName = this.store.tiidShortName(tiid);
                            data.currentAssessmentLink = "#ti/" + tid + "/" + tiNumber;
                        }
                    }
                }
            }

            data.navHomeAttributes = '';
            data.navAssessAttributes = '';
            data.navStatsAttributes = '';
            data.navAboutAttributes = '';
            data.navUserAttributes = '';
            data.navSyncAttributes = '';
            data.navErrorsAttributes = '';
            data.currentAssessmentAttributes = '';
            data.currentDetailAttributes = '';
            switch (this.model.get("page")) {
            case "home":               data.navHomeAttributes           = 'class="active"'; break;
            case "assess":             data.navAssessAttributes         = 'class="active"'; break;
            case "stats":              data.navStatsAttributes          = 'class="active"'; break;
            case "about":              data.navAboutAttributes          = 'class="active"'; break;
            case "user":               data.navUserAttributes           = 'class="active"'; break;
            case "sync":               data.navSyncAttributes           = 'class="active"'; break;
            case "errors":             data.navErrorsAttributes         = 'class="active"'; break;
            case "testInstance":       data.currentAssessmentAttributes = 'class="active"'; break;
            case "testDetail":         data.currentDetailAttributes     = 'class="active"'; break;
            }

            var html = Mustache.render(navViewTemplate, data);
            this.$el.html(html);
        },

        reload: function() {
            var successFn = function(submission) {
                document.location.reload(true);
            };
            var errorFn = function(jqXHR, textStatus, errorThrown) {
                var e = textStatus ? textStatus : "Unknown error";
                if (e === "error" && errorThrown)
                    e = errorThrown;
                $("#error").append('<div class="alert alert-danger" role="alert">Error reloading: ' + e + '</div>');
            };
            $.ajax({
                dataType: "json",
                url: this.model.apiURL("reload"),
                type: "POST",
                processData: false,
                data: JSON.stringify({uid: this.model.get("authUID")}),
                contentType: 'application/json; charset=UTF-8',
                timeout: 7000,
                success: successFn,
                error: errorFn,
            });
        },
    });

    return {
        NavView: NavView
    };
});
