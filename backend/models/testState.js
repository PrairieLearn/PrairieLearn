module.exports = function(sequelize, DataTypes) {
    var TestState = sequelize.define("TestState", {
        date: DataTypes.DATE,
        open: DataTypes.BOOLEAN,
    }, {
        tableName: 'test_states',
        classMethods: {
            associate: function(models) {
                TestState.belongsTo(models.TestInstance);
                TestState.belongsTo(models.User, {as: 'auth_user'});
            }
        }
    });

    return TestState;
};
