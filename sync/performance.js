const scopedData = {};

module.exports = function(scopeName) {
    if (!scopedData[scopeName]) {
        scopedData[scopeName] = {};
    }

    const scope = scopedData[scopeName];

    function start(name) {
        scope[name] = new Date();
    }

    function end(name) {
        if (!(name in scope)) {
            return;
        }
        if (process.env.PROFILE_SYNC) {
            console.log(`${name} took ${(new Date()) - scope[name]}ms`);
        }
    }

    function timedFunc(name, func, callback) {
        start(name);
        func((err) => {
            end(name);
            callback(err);
        });
    }

    return {
        start,
        end,
        timedFunc,
    };
};
