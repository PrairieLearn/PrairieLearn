/**
 * A set of useful extensions to the Set prototype.
 */

Set.prototype.union = function(other) {
    var union = new Set(this);
    for (const elem of other) {
        union.add(elem);
    }
    return union;
};

Set.prototype.map = function(callback) {
    const res = [];
    for (const elem of this) {
        res.push(callback(elem, this));
    }
    return res;
};
