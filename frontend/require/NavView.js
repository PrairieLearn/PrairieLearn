
define(['underscore', 'backbone', 'mustache', 'text!NavView.html'], function(_, Backbone, Mustache, navViewTemplate) {

    var NavView = Backbone.View.extend({

        tagName: 'nav',

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
                        if (tInstance) {
                            data.currentAssessmentName = this.store.tiidShortName(tiid);
                            data.currentAssessmentLink = "#ti/" + tiid;
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
            data.currentAssessmentAttributes = '';
            data.currentDetailAttributes = '';
            switch (this.model.get("page")) {
            case "home":               data.navHomeAttributes           = 'class="active"'; break;
            case "assess":             data.navAssessAttributes         = 'class="active"'; break;
            case "stats":              data.navStatsAttributes          = 'class="active"'; break;
            case "about":              data.navAboutAttributes          = 'class="active"'; break;
            case "user":               data.navUserAttributes           = 'class="active"'; break;
            case "sync":               data.navSyncAttributes           = 'class="active"'; break;
            case "testInstance":       data.currentAssessmentAttributes = 'class="active"'; break;
            case "testDetail":         data.currentDetailAttributes     = 'class="active"'; break;
            }

            var html = Mustache.render(navViewTemplate, data);
            this.$el.html(html);
        },
    });

    return {
        NavView: NavView
    };
});
