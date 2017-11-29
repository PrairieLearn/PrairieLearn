(function() {
    function PrairieUtil() {};

    /**
     * To support unicode strings, we use a method from Mozilla to decode:
     * first we get the bytestream, then we percent-encode it, then we
     * decode that to the original string.
     * https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding#The_Unicode_Problem
     * @param  {String} str the base64 string to decode
     * @return {String}     the decoded string
     */
    PrairieUtil.b64DecodeUnicode = function(str) {
        // Going backwards: from bytestream, to percent-encoding, to original string.
        return decodeURIComponent(atob(str).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    };

    PrairieUtil.b64EncodeUnicode = function(str) {
        // first we use encodeURIComponent to get percent-encoded UTF-8,
        // then we convert the percent encodings into raw bytes which
        // can be fed into btoa.
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
            function toSolidBytes(match, p1) {
                return String.fromCharCode('0x' + p1);
        }));
    };

    /**
     * Checks if the given file contents should be treated as binary or
     * text. Uses the same method as git: if the first 8000 bytes contain a
     * NUL character ('\0'), we consider the file to be binary.
     * http://stackoverflow.com/questions/6119956/how-to-determine-if-git-handles-a-file-as-binary-or-as-text
     * @param  {String}  file  File contents to check
     * @return {Boolean}       If the file is recognized as binary
     */
    PrairieUtil.isBinary = function(file) {
        var nulIdx = file.indexOf('\0');
        var fileLength = file.length;
        return nulIdx != -1 && nulIdx <= (fileLength <= 8000 ? fileLength : 8000);
    };

    /**
     * Uses a hidden element to copy the given string to the clipboard.
     * @param  {String} str The string to copy
     */
    PrairieUtil.copyToClipboard = function(str) {
        // Uses code from https://github.com/zenorocha/clipboard.js/blob/master/src/clipboard-action.js
        var isRTL = document.documentElement.getAttribute('dir') == 'rtl';
        var fakeElem = document.createElement('textarea');
        // Prevent zooming on iOS
        fakeElem.style.fontSize = '12pt';
        // Reset box model
        fakeElem.style.border = '0';
        fakeElem.style.padding = '0';
        fakeElem.style.margin = '0';
        // Move element out of screen horizontally
        fakeElem.style.position = 'absolute';
        fakeElem.style[ isRTL ? 'right' : 'left' ] = '-9999px';
        // Move element to the same position vertically
        let yPosition = window.pageYOffset || document.documentElement.scrollTop;
        fakeElem.style.top = `${yPosition}px`;

        fakeElem.setAttribute('readonly', '');
        fakeElem.value = str;

        document.body.appendChild(fakeElem);

        fakeElem.select();
        fakeElem.setSelectionRange(0, fakeElem.value.length);

        try {
            document.execCommand('copy');
        } catch (e) {
            // Do nothing!
        }

        document.body.removeChild(fakeElem);
    };

    window.PrairieUtil = PrairieUtil;
})();
