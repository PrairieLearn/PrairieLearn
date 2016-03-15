module.exports = function(sequelize, DataTypes) {
    var TestInstance = sequelize.define("TestInstance", {
        tiid: {type: DataTypes.STRING, unique: true},
        date: DataTypes.DATE,
        number: DataTypes.INTEGER,
    }, {
        tableName: 'test_instances',
        classMethods: {
            associate: function(models) {
                TestInstance.belongsTo(models.Test);
                TestInstance.belongsTo(models.User);
            }
        }
    });

    return TestInstance;
};
