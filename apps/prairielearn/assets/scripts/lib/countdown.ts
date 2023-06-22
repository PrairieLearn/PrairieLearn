/*********************************************************************

This code makes a countdown timer UI to a server-determined final time. We assume that the server
and client clocks are not synchronized, so we only use time differentials to relate server to client
times. We also assume that the final time is relatively fixed, though occasional changes in the
server are supported. The key event times are:

Server time:        process                       countdownEnd
                       |                                |
Real time: ------------|----d1----|----d2----|----d3----|------
                                  |          |
Client time:                clientStart     now

process:      server time during response processing
clientStart:  client time as soon as possible after last update
now:          client time when the countdown is rendered
countdownEnd: server time when the timer should expire
d1, d2, d3:   time intervals between real event times

To find clientStart we use the current client time when the JS below first executes during page
render. We assume that d1 is small enough that this would not give the student any advantage,
particularly considering the student would presumably be unable to work on anything in this time
period, since the page is still loading.

We want a tight upper bound on d3 = (countdownEnd - now), and we want to calculate it only using
time differentials computed either purely with server times or purely with client times.

Observe that:
countdownEnd - process = d1 + d2 + d3
                       < d2 + d3

Thus:
d3 > (countdownEnd - process) - (now - clientStart)

This bound is fairly tight if d1 is small.

We assume that we have been passed the value of (countdownEnd - process) in milliseconds as the
variable "serverRemainingMS". Periodically (every one minute) we update this remaining time from the
server, and at this point we update clientStart as well.

*********************************************************************/

export class Countdown {
  serverRemainingMS: number;
  serverTimeLimitMS: number;
  clientStart: number;
  updateServerIfExpired = true;
  serverUpdateURL: string;

  countdownDisplay: HTMLElement;
  countdownProgress: HTMLElement;
  countdownProgressBar: HTMLElement;

  timerOutFn: () => void;
  serverUpdateFailFn: () => void;
  backgroundColorFn: (number) => string;

  constructor(
    displaySelector: string,
    progressSelector: string,
    initialServerRemainingMS: number,
    initialServerTimeLimitMS: number,
    serverUpdateURL: string = null,
    timerOutFn: () => void = null,
    serverUpdateFailFn: () => void = null,
    backgroundColorFn: (number) => string = null
  ) {
    this.countdownDisplay = document.querySelector<HTMLElement>(displaySelector);
    this.countdownProgress = document.querySelector<HTMLElement>(progressSelector);

    if (!this.countdownDisplay || !this.countdownProgress) return;

    this.serverUpdateURL = serverUpdateURL;
    this.timerOutFn = timerOutFn;
    this.serverUpdateFailFn = serverUpdateFailFn;
    this.backgroundColorFn = backgroundColorFn || (() => 'bg-info');

    this.countdownProgress.classList.add('progress');
    this.countdownProgress.innerHTML = '<div class="progress-bar progress-bar-primary"></div>';
    this.countdownProgressBar = this.countdownProgress.querySelector('div');

    this.handleServerResponseRemainingMS({
      serverRemainingMS: initialServerRemainingMS,
      serverTimeLimitMS: initialServerTimeLimitMS,
    });

    if (this.serverUpdateURL) {
      window.setInterval(this.updateServerRemainingMS.bind(this), 60000);
    }
  }

  handleServerResponseRemainingMS(data) {
    this.serverRemainingMS = data.serverRemainingMS;
    this.serverTimeLimitMS = data.serverTimeLimitMS;
    this.clientStart = Date.now();

    console.log('Time remaining: ' + this.serverRemainingMS + ' ms');
    if (this.serverRemainingMS <= 0) {
      this.timerOutFn?.();
      this.updateServerIfExpired = false;
    } else {
      this.displayCountdown();
    }
  }

  updateServerRemainingMS() {
    if (this.serverUpdateURL) {
      fetch(this.serverUpdateURL)
        .then(async (response) => {
          this.handleServerResponseRemainingMS(await response.json());
        })
        .catch((err) => {
          console.log('Error retrieving remaining time', err);
          this.serverUpdateFailFn?.();
        });
    }
  }

  displayCountdown() {
    const remainingMS = Math.max(0, this.serverRemainingMS - (Date.now() - this.clientStart));
    const remainingSec = Math.floor(remainingMS / 1000);
    const remainingMin = Math.floor(remainingSec / 60);
    const perc = 100 - Math.max(0, Math.min(100, (remainingMS / this.serverTimeLimitMS) * 100));
    const backgroundColor = this.backgroundColorFn(remainingSec);

    this.countdownProgressBar.style.width = perc + '%';
    this.countdownProgressBar.className = 'progress-bar ' + backgroundColor;
    this.countdownDisplay.innerText =
      remainingSec >= 60 ? remainingMin + ' min' : remainingSec + ' sec';

    if (remainingMS > 0) {
      // reschedule for the next half-second time
      window.setTimeout(this.displayCountdown.bind(this), (remainingMS - 500) % 1000);
    } else if (this.serverUpdateURL && this.updateServerIfExpired) {
      // If the timer runs out, trigger a new server update to confirm before closing
      this.updateServerRemainingMS();
    } else {
      this.timerOutFn?.();
    }
  }
}
