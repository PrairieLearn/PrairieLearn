module.exports = function(sequelize, DataTypes) {
    var TestSet = sequelize.define("TestSet", {
        shortName: {type: DataTypes.STRING, field: 'short_name'},
        longName: {type: DataTypes.STRING, field: 'long_name'},
    }, {
        tableName: 'test_sets',
        classMethods: {
            associate: function(models) {
                TestSet.belongsTo(models.CourseInstance);
            }
        }
    });

    return TestSet;
};
