var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var Sequelize = require('sequelize');

var config = require('../config');
var logger = require('../logger');

var sequelize = new Sequelize(config.sdbAddress, {
    define: {
        underscored: true,
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
    },
});

// multiple-file layout based on https://github.com/sequelize/express-example/blob/master/models/index.js

var db = {};

fs
    .readdirSync(__dirname)
    .filter(function(file) {
        return /^.+\.js$/.test(file) && (file !== "index.js");
    })
    .forEach(function(file) {
        var model = sequelize.import(path.join(__dirname, file));
        db[model.name] = model;
    });

Object.keys(db).forEach(function(modelName) {
    if ("associate" in db[modelName]) {
        db[modelName].associate(db);
    }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
