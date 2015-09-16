
define(['underscore', 'backbone', 'mustache', 'text!NavView.html'], function(_, Backbone, Mustache, navViewTemplate) {

    var NavView = Backbone.View.extend({

        tagName: 'nav',

        initialize: function() {
            this.users = this.options.users;
            this.listenTo(this.model, "change", this.render);
        },

        render: function() {
            var data = {};
            data.navTitle = this.model.get("navTitle");
            data.userName = this.model.get("userName");
            data.userRole = this.model.get("userRole");
            data.mode = this.model.get("mode");
            data.viewOtherUsersPerm = this.model.hasPermission("viewOtherUsers", "auth");
            data.viewSync = this.model.hasPermission("viewCoursePulls") && this.model.get("gitCourseBranch");
            data.currentAssessmentName = this.model.get("currentAssessmentName");
            data.currentAssessmentLink = this.model.get("currentAssessmentLink");

            data.navHomeAttributes = '';
            data.navAssessAttributes = '';
            data.navStatsAttributes = '';
            data.navAboutAttributes = '';
            data.navUserAttributes = '';
            data.navSyncAttributes = '';
            data.currentAssessmentAttributes = '';
            switch (this.model.get("page")) {
            case "home":               data.navHomeAttributes           = 'class="active"'; break;
            case "assess":             data.navAssessAttributes         = 'class="active"'; break;
            case "stats":              data.navStatsAttributes          = 'class="active"'; break;
            case "about":              data.navAboutAttributes          = 'class="active"'; break;
            case "user":               data.navUserAttributes           = 'class="active"'; break;
            case "sync":               data.navSyncAttributes           = 'class="active"'; break;
            case "testInstance":       data.currentAssessmentAttributes = 'class="active"'; break;
            case "testDetail":         data.currentAssessmentAttributes = 'class="active"'; break;
            }

            var html = Mustache.render(navViewTemplate, data);
            this.$el.html(html);
        },
    });

    return {
        NavView: NavView
    };
});
