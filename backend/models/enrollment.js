module.exports = function(sequelize, DataTypes) {
    var Enrollment = sequelize.define("Enrollment", {
        role: DataTypes.ENUM('Student', 'TA', 'Instructor', 'Superuser'),
    }, {
        tableName: 'enrollments',
        classMethods: {
            associate: function(models) {
                Enrollment.belongsTo(models.User);
                Enrollment.belongsTo(models.CourseInstance);
            }
        }
    });

    return Enrollment;
};
