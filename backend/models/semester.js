module.exports = function(sequelize, DataTypes) {
    var Semester = sequelize.define("Semester", {
        shortName: {type: DataTypes.STRING, unique: true, field: 'short_name'},
        longName: {type: DataTypes.STRING, field: 'long_name'},
        startDate: {type: DataTypes.DATE, field: 'start_date'},
        endDate: {type: DataTypes.DATE, field: 'end_date'},
    }, {
        tableName: 'semesters',
    });

    return Semester;
};
