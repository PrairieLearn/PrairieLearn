import RFB from './novnc/core/rfb.js';

function setup_connection() {
    let url = `ws://${window.location.hostname}:${window.location.port}${window.location.pathname}`;
    console.log(url);

    const rfb = new RFB(document.getElementById('screen'), url, {
        wsProtocols: ['binary'],
    });

    // Set parameters that can be changed on an active connection
    rfb.viewOnly = false;
    rfb.scaleViewport = false;
    rfb.resizeSession = true;
}

setup_connection();
