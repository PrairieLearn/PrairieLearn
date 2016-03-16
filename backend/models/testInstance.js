module.exports = function(sequelize, DataTypes) {
    var TestInstance = sequelize.define("TestInstance", {
        tiid: {type: DataTypes.STRING, unique: true},
        date: DataTypes.DATE,
        number: {type: DataTypes.INTEGER, unique: 'composite_index'},
        test_id: {type: DataTypes.INTEGER, unique: 'composite_index'},
        user_id: {type: DataTypes.INTEGER, unique: 'composite_index'},
    }, {
        tableName: 'test_instances',
        classMethods: {
            associate: function(models) {
                TestInstance.belongsTo(models.Test);
                TestInstance.belongsTo(models.User);
                TestInstance.belongsTo(models.User, {as: 'auth_user'});
            }
        }
    });

    return TestInstance;
};
