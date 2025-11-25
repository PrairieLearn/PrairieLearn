import { useRef, useState } from 'preact/compat';
import { Button, Modal } from 'react-bootstrap';

export function CreateCourseInstanceModal({
  show,
  onHide,
  courseShortName,
  csrfToken,
  timezone,
  initialStartDateFormatted,
  initialEndDateFormatted,
}: {
  show: boolean;
  onHide: () => void;
  courseShortName: string;
  csrfToken: string;
  timezone: string;
  initialStartDateFormatted: string;
  initialEndDateFormatted: string;
}) {
  const [accessDatesEnabled, setAccessDatesEnabled] = useState(false);

  const startAccessDateRef = useRef<HTMLInputElement | null>(null);
  const endAccessDateRef = useRef<HTMLInputElement | null>(null);

  const handleValidateDates = () => {
    const startInput = startAccessDateRef.current;
    const endInput = endAccessDateRef.current;

    if (!startInput || !endInput) return;

    if (!accessDatesEnabled) {
      endInput.setCustomValidity('');
      return;
    }

    const startAccessDate = new Date(startInput.value);
    const endAccessDate = new Date(endInput.value);

    if (startAccessDate >= endAccessDate) {
      endInput.setCustomValidity('End access date must be after start access date');
    } else {
      endInput.setCustomValidity('');
    }
  };

  return (
    <Modal show={show} backdrop="static" size="lg" onHide={onHide}>
      <form method="POST">
        <Modal.Header closeButton>
          <Modal.Title>Create course instance</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div class="mb-3">
            <label class="form-label" for="long_name">
              Long name
            </label>
            <input
              type="text"
              class="form-control"
              id="long_name"
              name="long_name"
              aria-describedby="long_name_help"
              required
            />
            <small id="long_name_help" class="form-text text-muted">
              The full course instance name, such as &quot;Fall 2025&quot;. Users see it joined to
              the course name, e.g. &quot;
              {courseShortName} Fall 2025&quot;.
            </small>
          </div>
          <div class="mb-3">
            <label class="form-label" for="short_name">
              Short name
            </label>
            <input
              type="text"
              class="form-control"
              id="short_name"
              name="short_name"
              pattern="[\-A-Za-z0-9_\/]+"
              aria-describedby="short_name_help"
              required
            />
            <small id="short_name_help" class="form-text text-muted">
              A short name, such as &quot;Fa25&quot; or &quot;W25b&quot;. This is used in menus and
              headers where a short description is required. Use only letters, numbers, dashes, and
              underscores, with no spaces.
            </small>
          </div>
          <div class="form-check mb-3">
            <input
              type="checkbox"
              class="form-check-input"
              id="access_dates_enabled"
              name="access_dates_enabled"
              aria-describedby="access_dates_enabled_help"
              checked={accessDatesEnabled}
              onChange={(event) => {
                const target = event.currentTarget;
                setAccessDatesEnabled(target.checked);
              }}
            />
            <label class="form-check-label" for="access_dates_enabled">
              Make course instance available to students
              <br />
              <small id="access_dates_enabled_help" class="form-text text-muted mt-0">
                This can be enabled later.
              </small>
            </label>
          </div>
          <div id="accessDates" hidden={!accessDatesEnabled}>
            <div class="mb-3">
              <label class="form-label" for="start_access_date">
                Access start date
              </label>
              <div class="input-group date-picker">
                <input
                  ref={startAccessDateRef}
                  class="form-control date-picker"
                  type="datetime-local"
                  id="start_access_date"
                  name="start_access_date"
                  value={initialStartDateFormatted}
                  aria-describedby="start_access_date_help"
                />
                <span class="input-group-text date-picker">{timezone}</span>
              </div>
              <small id="start_access_date_help" class="form-text text-muted">
                The date when students can access the course instance. Can be edited later.
              </small>
            </div>
            <div class="mb-3">
              <label class="form-label" for="end_access_date">
                Access end date
              </label>
              <div class="input-group date-picker">
                <input
                  ref={endAccessDateRef}
                  class="form-control date-picker"
                  type="datetime-local"
                  id="end_access_date"
                  name="end_access_date"
                  value={initialEndDateFormatted}
                  aria-describedby="end_access_date_help"
                />
                <span class="input-group-text date-picker">{timezone}</span>
              </div>
              <small id="end_access_date_help" class="form-text text-muted">
                The date when students can no longer access the course instance. Can be edited
                later.
              </small>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <input type="hidden" name="__action" value="add_course_instance" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <Button variant="secondary" type="button" onClick={onHide}>
            Cancel
          </Button>
          <Button
            variant="primary"
            id="add_course_instance_button"
            type="submit"
            onClick={handleValidateDates}
          >
            Create
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
