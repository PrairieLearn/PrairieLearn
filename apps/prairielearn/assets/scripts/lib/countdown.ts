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

export function setupCountdown(options: {
  displaySelector: string;
  progressSelector: string;
  initialServerRemainingMS: number;
  initialServerTimeLimitMS: number;
  serverUpdateURL?: string;
  onTimerOut?: () => void;
  onServerUpdateFail?: () => void;
  getBackgroundColor?: (number) => string;
}) {
  const countdownDisplay = document.querySelector<HTMLElement>(options.displaySelector);
  const countdownProgress = document.querySelector<HTMLElement>(options.progressSelector);

  if (!countdownDisplay || !countdownProgress) return;

  let serverRemainingMS: number;
  let serverTimeLimitMS: number;
  let clientStart: number;
  let updateServerIfExpired = true;
  let nextCountdownDisplay: number | null = null;

  countdownProgress.classList.add('progress');
  countdownProgress.innerHTML = '<div class="progress-bar progress-bar-primary"></div>';
  const countdownProgressBar = countdownProgress.querySelector('div');

  handleServerResponseRemainingMS({
    serverRemainingMS: options.initialServerRemainingMS,
    serverTimeLimitMS: options.initialServerTimeLimitMS,
  });

  if (options.serverUpdateURL) {
    window.setInterval(updateServerRemainingMS, 60000);
  }

  function handleServerResponseRemainingMS(data) {
    serverRemainingMS = data.serverRemainingMS;
    serverTimeLimitMS = data.serverTimeLimitMS;
    clientStart = Date.now();

    console.log('Time remaining: ' + serverRemainingMS + ' ms');
    if (serverRemainingMS <= 0) {
      options.onTimerOut?.();
      updateServerIfExpired = false;
    } else {
      displayCountdown();
    }
  }

  function updateServerRemainingMS() {
    if (options.serverUpdateURL) {
      fetch(options.serverUpdateURL)
        .then(async (response) => {
          handleServerResponseRemainingMS(await response.json());
        })
        .catch((err) => {
          console.log('Error retrieving remaining time', err);
          options.onServerUpdateFail?.();
        });
    }
  }

  function displayCountdown() {
    const remainingMS = Math.max(0, serverRemainingMS - (Date.now() - clientStart));
    const remainingSec = Math.floor(remainingMS / 1000);
    const remainingMin = Math.floor(remainingSec / 60);
    const perc = 100 - Math.max(0, Math.min(100, (remainingMS / serverTimeLimitMS) * 100));
    const backgroundColor = options.getBackgroundColor?.(remainingSec) || 'bg-info';

    countdownProgressBar.style.width = perc + '%';
    countdownProgressBar.className = 'progress-bar ' + backgroundColor;
    countdownDisplay.innerText = remainingSec >= 60 ? remainingMin + ' min' : remainingSec + ' sec';

    if (remainingMS > 0) {
      // cancel any existing scheduled call to displayCountdown
      if (nextCountdownDisplay != null) clearTimeout(nextCountdownDisplay);
      // reschedule for the next half-second time
      nextCountdownDisplay = setTimeout(displayCountdown, (remainingMS - 500) % 1000);
    } else if (options.serverUpdateURL && updateServerIfExpired) {
      // If the timer runs out, trigger a new server update to confirm before closing
      updateServerRemainingMS();
    } else {
      options.onTimerOut?.();
    }
  }
}
