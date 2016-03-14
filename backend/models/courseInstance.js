module.exports = function(sequelize, DataTypes) {
    var CourseInstance = sequelize.define('CourseInstance', {
    }, {
        tableName: 'course_instances',
        classMethods: {
            associate: function(models) {
                CourseInstance.belongsTo(models.Course);
                CourseInstance.belongsTo(models.Semester);
            }
        }
    });

    return CourseInstance;
};
