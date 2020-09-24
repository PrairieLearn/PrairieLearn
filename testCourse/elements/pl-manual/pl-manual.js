function ManualGradingElement(uuid) {
  $(`#pl-manual-${uuid}`)
    .closest('form')
    .on('submit', () => {
      // This should be a sum out of 100 (percentage)
      let points = 0;
      let feedback = [];

      // Iterate over children and grab out appropriate values
      // TODO: Augment so we can persist the state of certain children instead of only
      //        passing on a single point/feedback value
      // SPIKE: Figure out what anchors to give to children and validate uniqueness in pl-manual.py
      $(`#pl-manual-${uuid}`)
        .children('input')
        .toArray()
        .forEach((child) => {
          const val = child.getAttribute('value');
          const field = child.getAttribute('name');
          switch (field) {
            case 'points':
              points += parseInt(val);
            case 'feedback':
              feedback.push(val);
              break;
            default:
              throw new Error(
                `Unable to attribute field "${field}" to a score.`
              );
          }
        });

      // FIXME: Remove demo logging
      console.log(uuid, points, feedback);

      // These are the actual fields that the form submission will take a look at
      $(`#pl-manual-points-${uuid}`).attr('value', points / 100);
      $(`#pl-manual-feedback-${uuid}`).attr('value', JSON.stringify(feedback));
    });
}
