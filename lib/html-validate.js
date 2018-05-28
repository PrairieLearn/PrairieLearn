const { Tokenizer } = require('htmlparser2');

const noop = () => {};

const voidElements = {
    __proto__: null,
    area: true,
    base: true,
    basefont: true,
    br: true,
    col: true,
    command: true,
    embed: true,
    frame: true,
    hr: true,
    img: true,
    input: true,
    isindex: true,
    keygen: true,
    link: true,
    meta: true,
    param: true,
    source: true,
    track: true,
    wbr: true,

    //common self closing svg elements
    path: true,
    circle: true,
    ellipse: true,
    line: true,
    rect: true,
    use: true,
    stop: true,
    polyline: true,
    polygon: true,
};

/**
 * Validates HTML; at the moment, this just consists of checking that only void
 * elements as defined by the HTML spec are self-closing.
 *
 * If validation fails, the callback will be an Error object describing the
 * errors.
 */
module.exports.validateHtml = function(html) {
    let tagName = '';
    const errors = [];

    const callbacks = {
        onopentagname: (newTagName) => {
            tagName = newTagName;
        },
        onselfclosingtag: () => {
            if (!(tagName in voidElements)) {
                errors.push(`${tagName} is not a void element and cannot be self-closing`);
            }
        },
        ontext: noop,
        onopentagend: noop,
        onclosetag: noop,
        onattribname: noop,
        onattribdata: noop,
        onattribend: noop,
        onend: noop,
        oncomment: noop,
        ondeclaration: noop,
        onprocessinginstruction: noop,
        oncdata: noop,
    };

    var tok = new Tokenizer({}, callbacks);
    tok.write(html);
    tok.end();
    if (!errors.length) {
        return;
    }

    throw new Error(`Error validating HTML: ${errors.join('; ')}`);
};
