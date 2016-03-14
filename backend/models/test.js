module.exports = function(sequelize, DataTypes) {
    var Test = sequelize.define("Test", {
        tid: {type: DataTypes.STRING, unique: true},
        type: DataTypes.ENUM('Exam', 'RetryExam', 'Basic', 'Game'),
        number: DataTypes.STRING,
        title: DataTypes.STRING,
        config: DataTypes.JSONB,
    }, {
        tableName: 'tests',
        classMethods: {
            associate: function(models) {
                Test.belongsTo(models.TestSet);
            }
        }
    });

    return Test;
};
