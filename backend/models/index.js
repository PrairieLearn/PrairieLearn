var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var Sequelize = require('sequelize');

var config = require('../config');

// multiple-file layout based on https://github.com/sequelize/express-example/blob/master/models/index.js

var db = {};

db.sequelize = null;
db.Sequelize = Sequelize;

db.init = function() {
    db.sequelize = new Sequelize(config.sdbAddress, {
        // comment out the logging function below to see all SQL calls
        logging: function() {}, // suppress output of SQL statements to stdout
        define: {
            underscored: true,
        },
    });
    fs
        .readdirSync(__dirname)
        .filter(function(file) {
            return /^.+\.js$/.test(file) && (file !== "index.js");
        })
        .forEach(function(file) {
            var model = db.sequelize.import(path.join(__dirname, file));
            db[model.name] = model;
        });

    Object.keys(db).forEach(function(modelName) {
        if ("associate" in db[modelName]) {
            db[modelName].associate(db);
        }
    });
};

module.exports = db;
