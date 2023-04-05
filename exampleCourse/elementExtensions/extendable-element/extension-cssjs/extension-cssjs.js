function set_wave(host) {
  let wave_html = Array.from($(host).text())
    .map((val, index) => {
      return `<span index="${index}" style="position: relative">${val}</span>`;
    })
    .join('');
  $(host).html(wave_html);

  let elems = $(host).children();
  const n = elems.length;
  const c = 1;
  const damping = 0.95;
  const dx = 1.0 / (n + 1);
  const dt = Math.min(dx / c, 1.0 / 60.0);
  let x = Array(n).fill(0); /* x_t */
  let x_p = Array(n).fill(0); /* x_{t-1} */

  elems.mouseover((ev) => {
    const id = parseInt(ev.target.getAttribute('index'));
    x[id] = x[id] * 1.01 + 0.1;
  });

  setInterval(() => {
    let u = Array(n).fill(0);
    let cdtdx = Math.pow((c * dt) / dx, 2);

    /* Compute x_{t+1} */
    u[0] = 2 * x[0] - x_p[0] + cdtdx * (0 - 2 * x[0] + x[1]);
    u[n - 1] = 2 * x[n - 1] - x_p[n - 1] + cdtdx * (x[n - 2] - 2 * x[n - 1] + 0);
    for (let i = 1; i < n - 1; i++) {
      u[i] = 2 * x[i] - x_p[i] + cdtdx * (x[i - 1] - 2 * x[i] + x[i + 1]);
    }

    /* Update x_t and x_{t-1} */
    for (let i = 0; i < n; i++) {
      x_p[i] = x[i];
      x[i] = u[i] * damping;
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
