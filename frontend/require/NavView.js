
define(['underscore', 'backbone', 'Mustache', 'text!NavView.html'], function(_, Backbone, Mustache, navViewTemplate) {
    
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
            data.userName = this.model.get("userName");
            data.perms = '';
            var perms = this.model.get("authPerms");
            if (perms && perms.length > 0)
                data.perms = " (" + perms.join(", ") + ")";
            data.seeQuestionsPerm = this.model.hasPermission("seeQuestions");
            data.seeDebugPerm = this.model.hasPermission("seeDebug");
            data.changeUserPerm = this.model.hasPermission("changeUser");

            data.navHomeAttributes = '';
            data.navHomeworksAttributes = '';
            data.navExamsAttributes = '';
            data.navQuestionsAttributes = '';
            data.navStatsAttributes = '';
            data.navAboutAttributes = '';
            data.navActivityAttributes = '';
            data.navDebugAttributes = '';
            switch (this.model.get("page")) {
            case "home":      data.navHomeAttributes =      'class="active"'; break;
            case "homeworks": data.navHomeworksAttributes = 'class="active"'; break;
            case "exams":     data.navExamsAttributes =     'class="active"'; break;
            case "questions": data.navQuestionsAttributes = 'class="active"'; break;
            case "stats":     data.navStatsAttributes =     'class="active"'; break;
            case "about":     data.navAboutAttributes =     'class="active"'; break;
            case "activity":  data.navActivityAttributes =  'class="active"'; break;
            case "debug":     data.navDebugAttributes =     'class="active"'; break;
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
