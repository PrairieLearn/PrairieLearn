module.exports = function(sequelize, DataTypes) {
    var CourseInstance = sequelize.define('CourseInstance', {
        courseId: {type: DataTypes.INTEGER, field: 'course_id', unique: 'composite_index'},
        semesterId: {type: DataTypes.INTEGER, field: 'semester_id', unique: 'composite_index'},
    }, {
        tableName: 'course_instances',
        classMethods: {
            associate: function(models) {
                CourseInstance.belongsTo(models.Course, {onDelete: 'CASCADE', onUpdate: 'CASCADE'});
                CourseInstance.belongsTo(models.Semester, {onDelete: 'CASCADE', onUpdate: 'CASCADE'});
            }
        },
    });

    return CourseInstance;
};
