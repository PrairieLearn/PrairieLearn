const ERR = require('async-stacktrace');
const _ = require('lodash');

const config = require('./config');

process.on('message', (m) => {
    console.log(`child ${process.pid} got message id ${m.id} for fcn '${m.fcn}'`);
    if (m.fcn == 'init') {
        init(m.args, (err, args) => {
            process.send({id: m.id, err, args});
        });
    } else {
        console.log('ERROR: worker unknown fcn', m);
        process.exit(2);
    }
});

function init(args, callback) {
    _.assign(config, args.config);
    callback(null);
}
