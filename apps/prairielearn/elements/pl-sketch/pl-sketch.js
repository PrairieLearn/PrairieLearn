window.SketchInput = function (id) {
  function prepareData() {
    const si = new window.SketchInput.default(
      document.getElementById(id + '-si-container'),
      id,
      config,
    );
    si.messageBus.on('warnUser', function (_, error) {
      console.error(error);
    });
    const updateState = function () {
      const siGradeable = JSON.parse(si.getGradeable());
      const siState = JSON.parse(si.getState());
      // State is needed for restoring submissions, gradeable for grading; merge the two dicts to reduce redundancy
      siState['gradeable'] = siGradeable['data'];
      $('#' + id + '-sketchresponse-submission').val(btoa(JSON.stringify(siState)));
    };
    // si.getGradeable exits drawing mode, so only call it upon form submission instead of live updates
    const questionForm = document.getElementById(id + '-si-container').closest('form');
    if (questionForm) {
      questionForm.addEventListener('submit', updateState);
    }
  }
  const configData = atob($('#' + id + '-sketchresponse-data').text());
  const config = JSON.parse(configData);

  prepareData();
};
