module.exports = function(sequelize, DataTypes) {
    var Test = sequelize.define("Test", {
        tid: {type: DataTypes.STRING, unique: 'composite_index'},
        courseInstanceId: {type: DataTypes.INTEGER, field: 'course_instance_id', unique: 'composite_index'},
        type: DataTypes.ENUM('Exam', 'RetryExam', 'Basic', 'Game'),
        number: DataTypes.STRING,
        title: DataTypes.STRING,
        config: DataTypes.JSONB,
        testSetId: {type: DataTypes.INTEGER, field: 'test_set_id'},
    }, {
        tableName: 'tests',
        classMethods: {
            associate: function(models) {
                Test.belongsTo(models.CourseInstance, {onUpdate: 'SET NULL', onDelete: 'SET NULL'});
                Test.belongsTo(models.TestSet, {onUpdate: 'SET NULL', onDelete: 'SET NULL'});
            }
        },
        paranoid: true,
    });

    return Test;
};
