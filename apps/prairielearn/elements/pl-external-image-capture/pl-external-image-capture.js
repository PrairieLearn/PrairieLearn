window.PLExternalImageCapture = function (
    courseInstanceId,
    instanceQuestionId,
    elementId
) {
    // const externalImageCapture = null;
    const scanSubmissionButton = document.querySelector('#scan-submission-button');
    if (!scanSubmissionButton) {
        return;
    }

    const path = `/pl/course_instance/${courseInstanceId}/instance_question/${instanceQuestionId}/external_image_capture/element/${elementId}`;
    console.log('External image capture path:', path);

    scanSubmissionButton.addEventListener('click', async () => {
        fetch(
            path, { method: 'GET'}
        ).then((result) => {
            if (!result.ok) {
                throw new Error(`Failed to fetch external image capture: ${result.status}`);
            }
            console.log('Result', result);
        })
    });
}