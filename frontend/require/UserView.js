
define(['underscore', 'backbone', 'mustache', 'renderer', 'text!UserView.html'], function(_, Backbone, Mustache, renderer, UserViewTemplate) {

    var UserView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
        },

        render: function() {
            var that = this;
            var data = {};
            data.changeModePerm = this.model.hasPermission("changeMode");
            data.changeUserPerm = this.model.hasPermission("changeUser");
            data.mode = this.model.get("mode");
            data.authUID = this.model.get("authUID");
            data.authName = this.model.get("authName");
            data.authRole = this.model.get("authRole");
            data.userUID = this.model.get("userUID");
            data.userName = this.model.get("userName");
            data.userRole = this.model.get("userRole");
            data.roleList = this.model.availableRoles();
            var html = Mustache.render(UserViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        }
    });

    return {
        UserView: UserView
    };
});
