
define(['underscore', 'backbone', 'mustache', 'renderer', 'text!UserView.html'], function(_, Backbone, Mustache, renderer, UserViewTemplate) {

    var UserView = Backbone.View.extend({

        tagName: 'div',

        events: {
            "submit #changeUIDForm": "changeUID",
            "submit #changeRoleForm": "changeRole",
            "submit #changeModeForm": "changeMode",
        },

        initialize: function() {
            this.store = this.options.store;
            this.users = this.options.users;
            this.listenTo(this.model, "change", this.render);
        },

        render: function() {
            var that = this;
            var data = {};
            data.changeModePerm = this.model.hasPermission("changeMode", "auth");
            data.viewOtherUsersPerm = this.model.hasPermission("viewOtherUsers", "auth");
            data.mode = this.model.get("mode");
            data.authUID = this.model.get("authUID");
            data.authName = this.model.get("authName");
            data.authRole = this.model.get("authRole");
            data.userUID = this.model.get("userUID");
            data.userName = this.model.get("userName");
            data.userRole = this.model.get("userRole");
            data.roleList = _(this.model.availableRoles()).map(function(role) {
                var obj = {value: role, name: role};
                if (role == data.userRole) {
                    obj.selected = "selected";
                    obj.name = obj.name + " (currently active)";
                }
                return obj;
            });
            data.userList = this.users.map(function(user) {return user.get("uid");});
            data.modeList = _(["Default", "Public", "Exam"]).map(function(mode) {
                var obj = {value: mode, name: mode};
                if (mode == data.mode) {
                    obj.selected = "selected";
                    obj.name = obj.name + " (currently active)";
                }
                return obj;
            });
            var html = Mustache.render(UserViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        },

        changeUID: function(event) {
            event.preventDefault();
            var newUID = this.$("#changeViewUID").val();
            this.store.changeUserUID(newUID);
        },

        changeRole: function(event) {
            event.preventDefault();
            var newRole = this.$("#changeViewRole").val();
            this.store.changeUserRole(newRole);
        },

        changeMode: function(event) {
            event.preventDefault();
            var newMode = this.$("#changeMode").val();
            this.store.changeMode(newMode);
        },
    });

    return {
        UserView: UserView
    };
});
