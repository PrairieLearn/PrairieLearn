function set_wave(host) {
    let wave_html = Array.from($(host).text()).map((val, index) => {
        return `<span index="${index}" style="position: relative">${val}</span>`;
    }).join('');
    $(host).html(wave_html);

    let elems = $(host).children();
    const n = elems.length;
    const dt = 1.0 / 60.0;
    const c = 4.0;
    const h = 1.0 / (n+1);
    let x = Array(n).fill(0);     /* position */
    let v = Array(n).fill(0);     /* x_t */
    
    elems.mouseover((ev) => {
        const id = parseInt(ev.target.getAttribute('index'));
        v[id] = 2;
    });

    setInterval(() => {
        let u = Array(n).fill(0);
        let chh = c / (h * h);

        /* Solve x_tt */
        u[0] = (-2 * x[0] + x[1]) * chh;
        u[n-1] = (-2 * x[n-1] + x[n-2]) * chh;
        for (let i = 1; i < n - 1; i++) {
            u[i] = (-2 * x[i] + x[i-1] + x[i+1]) * chh;
        }

        /* Integrate x_t and x */
        for (let i = 0; i < n; i++) {
            v[i] += u[i] * dt;
            v[i] *= 0.98;
            x[i] += v[i] * dt;
        }

        /* Update positions */
        elems.each((i, elem) => {
            $(elem).css('top', `${x[i] * 30}px`);
        });
    }, dt * 1000.0);    
}

$(document).ready(() => {
    set_wave('#wave');
});
