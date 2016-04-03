module.exports = function(sequelize, DataTypes) {
    var TestInstance = sequelize.define("TestInstance", {
        tiid: {type: DataTypes.STRING, unique: true},
        date: DataTypes.DATE,
        number: {type: DataTypes.INTEGER, unique: 'composite_index'},
        testId: {type: DataTypes.INTEGER, field: 'test_id', unique: 'composite_index'},
        userId: {type: DataTypes.INTEGER, field: 'user_id', unique: 'composite_index'},
        authUserId: {type: DataTypes.INTEGER, field: 'auth_user_id'},
    }, {
        tableName: 'test_instances',
        classMethods: {
            associate: function(models) {
                TestInstance.belongsTo(models.Test, {onUpdate: 'SET NULL', onDelete: 'SET NULL'});
                TestInstance.belongsTo(models.User, {onUpdate: 'SET NULL', onDelete: 'SET NULL'});
                TestInstance.belongsTo(models.User, {as: 'auth_user'}, {onUpdate: 'SET NULL', onDelete: 'SET NULL'});
            }
        },
    });

    return TestInstance;
};
