const ERR = require('async-stacktrace');
const util = require('util');
const ejs = require('ejs');
const { expose } = require('threads/worker');

const renderSync = (filename, locals, callback) => {
    ejs.renderFile(filename, locals, null, (err, str) => {
        if (ERR(err, callback)) return;
        callback(null, str);
    });
};
const renderAsync = util.promisify(renderSync);

expose(async function render(filename, locals) {
    const str = await renderAsync(filename, locals);
    return str;
});
