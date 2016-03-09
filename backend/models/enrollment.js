module.exports = function(sequelize, DataTypes) {
    var Enrollment = sequelize.define("Enrollment", {
        role: DataTypes.ENUM('Student', 'TA', 'Instructor', 'Superuser'),
        userId: {type: DataTypes.INTEGER, field: 'user_id', unique: 'composite_index'},
        courseInstanceId: {type: DataTypes.INTEGER, field: 'course_instance_id', unique: 'composite_index'},
    }, {
        tableName: 'enrollments',
        classMethods: {
            associate: function(models) {
                Enrollment.belongsTo(models.User, {onUpdate: 'SET NULL', onDelete: 'SET NULL'});
                Enrollment.belongsTo(models.CourseInstance, {onUpdate: 'SET NULL', onDelete: 'SET NULL'});
            }
        },
    });

    return Enrollment;
};
