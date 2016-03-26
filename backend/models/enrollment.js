module.exports = function(sequelize, DataTypes) {
    var Enrollment = sequelize.define("Enrollment", {
        role: DataTypes.ENUM('Student', 'TA', 'Instructor', 'Superuser'),
        user_id: {type: DataTypes.INTEGER, unique: 'composite_index'},
        course_instance_id: {type: DataTypes.INTEGER, unique: 'composite_index'},
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
