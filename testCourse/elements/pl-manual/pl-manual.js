function PLManual(uuid, ansName) {
  const hideClass = 'd-none';
  const plManualId = `#pl-manual-${uuid}`;
  const popoverBtnId = `#pl-manual-regrade-button-${uuid}`;
  const popoverBodyId = `#pl-manual-regrade-popover-body-${uuid}`;
  const popoverTempBodyIdName = `pl-manual-regrade-popover-temp-body-${uuid}`;
  const popoverTempBodyId = `#${popoverTempBodyIdName}`;

  // Set up our popover (content body, santization so we can have inputs, ect.)
  $(popoverBtnId)
    .popover({
      sanitize: false,
      container: 'body',
      content: () => `<div id='${popoverTempBodyIdName}'></div>`,
    })
    .on('hide.bs.popover', () => {
      // TODO: Input validation; max of score as 100%? min of 0?
      $(popoverBodyId).clone().addClass(hideClass).appendTo(plManualId);
    })
    .on('inserted.bs.popover', () =>
      $(popoverBodyId)
        .removeClass(hideClass)
        .detach()
        .appendTo(popoverTempBodyId)
    );

  // Just change over our points to be scaled out of 1 before form submit
  $(plManualId)
    .closest('form')
    .on('submit', () => {
      const pointsInput = $(`input[name="${ansName}.points"]`);
      pointsInput.val(pointsInput.val() / 100);
    });
}
