module.exports = function(sequelize, DataTypes) {
    var TestState = sequelize.define("TestState", {
        date: DataTypes.DATE,
        open: DataTypes.BOOLEAN,
        testInstanceId: {type: DataTypes.INTEGER, field: 'test_instance_id'},
        authUserId: {type: DataTypes.INTEGER, field: 'auth_user_id'},
    }, {
        tableName: 'test_states',
        classMethods: {
            associate: function(models) {
                TestState.belongsTo(models.TestInstance, {onUpdate: 'CASCADE', onDelete: 'CASCADE'});
                TestState.belongsTo(models.User, {as: 'auth_user'}, {onUpdate: 'SET NULL', onDelete: 'SET NULL'});
            }
        },
    });

    return TestState;
};
