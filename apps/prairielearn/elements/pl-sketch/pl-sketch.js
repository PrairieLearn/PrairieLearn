window.SketchInput = function (id, overlay_solution = false) {
  function prepareData() {
    // Load SketchResponse
    const si = new window.sketchresponse.default(
      document.getElementById(id + '-si-container'),
      id,
      config,
    );

    // Inject overlay toggle button into si-container if it is enabled
    if (overlay_solution) {
      si.messageBus.on('ready', function (_) {
        const container = document.getElementById(id + '-si-container');
        const buttonWrapper = document.createElement('div');
        buttonWrapper.className = 'position-relative';
        buttonWrapper.innerHTML = `
        <button
            type="button"
            class="js-overlay-toggle btn btn-light border border-dark position-absolute translate-middle bottom-0 end-0 m-3"
            id="${id}-overlay-toggle"
            title="Toggle solution display"
            data-bs-toggle="tooltip"
            data-bs-placement="top"
            aria-label="Toggle solution display"
        >
            <i class="bi bi-layers-fill" aria-hidden="true"></i>
        </button>
      `;
        container.append(buttonWrapper);

        const overlayButton = document.getElementById(id + '-overlay-toggle');
        overlayButton.addEventListener('click', function () {
          const overlays = document.querySelectorAll(`#${id}-si-container .overlay`);
          if (overlays.length > 0) {
            overlays.forEach((overlay) => {
              overlay.style.display = overlay.style.display === 'none' ? 'inherit' : 'none';
            });
            const icon = overlayButton.querySelector('i');
            if (icon) {
              icon.classList.toggle('bi-layers-half');
              icon.classList.toggle('bi-layers-fill');
            }
          }
        });
      });
    }

    si.messageBus.on('warnUser', function (_, error) {
      console.error(error);
    });
    const updateState = function () {
      const siGradeable = JSON.parse(si.getGradeable());
      const siState = JSON.parse(si.getState());
      // State is needed for restoring submissions, gradeable for grading; merge the two dicts to reduce redundancy
      siState['gradeable'] = siGradeable['data'];
      $('#' + id + '-sketchresponse-submission').val(
        btoa(unescape(encodeURIComponent(JSON.stringify(siState)))),
      );
    };
    // si.getGradeable exits drawing mode, so only call it upon form submission instead of live updates
    const questionForm = document.getElementById(id + '-si-container').closest('form');
    if (questionForm) {
      questionForm.addEventListener('submit', updateState);
    }
  }
  const configData = decodeURIComponent(escape(atob($('#' + id + '-sketchresponse-data').text())));
  const config = JSON.parse(configData);

  prepareData();
};
