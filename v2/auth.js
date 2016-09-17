
module.exports = {};

module.exports.from_req = function(req) {
    return {
        auth_uid: req.authUID,
        auth_name: req.authName,
        auth_date: req.authDate,
        auth_signature: req.authSignature,
        mode: req.mode,
        user_uid: req.userUID,
    };
};
