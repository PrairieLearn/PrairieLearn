module.exports = function(sequelize, DataTypes) {
    var Course = sequelize.define("Course", {
        shortName: {type: DataTypes.STRING, unique: true, field: 'short_name'},
        title: DataTypes.STRING,
    }, {
        tableName: 'courses',
    });

    return Course;
};
