const config = require('./config');

module.exports.create = function(callback) {
    const type = config.externalGradingFileStoreType;
    switch(type) {
        case 's3':
            callback(null, require('./externalGradingFileStoreS3'));
            break;
        case 'disk':
            callback(null, require('./externalGradingFileStoreDisk'));
            break;
        default:
            callback(new Error(`Unrecognized external grading file store type: ${type}`));
    }
};
