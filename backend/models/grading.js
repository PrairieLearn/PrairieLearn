module.exports = function(sequelize, DataTypes) {
    var Grading = sequelize.define("Grading", {
        date: DataTypes.DATE,
        submissionId: {type: DataTypes.INTEGER, field: 'submission_id'},
        authUserId: {type: DataTypes.INTEGER, field: 'auth_user_id'},
        score: DataTypes.DOUBLE,
        feedback: DataTypes.JSONB,
    }, {
        tableName: 'gradings',
        classMethods: {
            associate: function(models) {
                Grading.belongsTo(models.Submission, {onUpdate: 'CASCADE', onDelete: 'CASCADE'});
                Grading.belongsTo(models.User, {as: 'auth_user'}, {onUpdate: 'CASCADE', onDelete: 'CASCADE'});
            }
        },
        indexes: [
            {
                fields: ['submission_id'],
            },
        ],
    });

    return Grading;
};
