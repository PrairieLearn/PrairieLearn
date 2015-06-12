
define(['underscore', 'backbone', 'mustache', 'text!NavView.html'], function(_, Backbone, Mustache, navViewTemplate) {
    
    var NavView = Backbone.View.extend({

        tagName: 'nav',

        events: {
            "click .changeUser": "changeUser"
        },

        initialize: function() {
            this.users = this.options.users;
            this.listenTo(this.model, "change", this.render);
        },

        render: function() {
            var data = {};
            data.navTitle = this.model.get("navTitle");
            data.userName = this.model.get("userName");
            data.perms = '';
            var perms = this.model.get("authPerms");
            if (perms && perms.length > 0)
                data.perms = " (" + perms.join(", ") + ")";
            data.changeUserPerm = this.model.hasPermission("changeUser");
            data.currentAssessmentName = this.model.get("currentAssessmentName");
            data.currentAssessmentLink = this.model.get("currentAssessmentLink");

            data.navHomeAttributes = '';
            data.navAssessAttributes = '';
            data.navStatsAttributes = '';
            data.navAboutAttributes = '';
            data.currentAssessmentAttributes = '';
            switch (this.model.get("page")) {
            case "home":               data.navHomeAttributes           = 'class="active"'; break;
            case "assess":             data.navAssessAttributes         = 'class="active"'; break;
            case "stats":              data.navStatsAttributes          = 'class="active"'; break;
            case "about":              data.navAboutAttributes          = 'class="active"'; break;
            case "testInstance":       data.currentAssessmentAttributes = 'class="active"'; break;
            }

            var html = Mustache.render(navViewTemplate, data);
            this.$el.html(html);
        },

        changeUser: function() {
            var userUID = this.$("#navChangeUID").val();
            var user = this.users.get(userUID);
            var userName = userUID;
            this.model.set({
                userUID: userUID,
                userName: userName
            });
        }
    });

    return {
        NavView: NavView
    };
});
