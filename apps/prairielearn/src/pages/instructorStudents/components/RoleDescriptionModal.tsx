export function RoleDescriptionModal() {
  return (
    <div
      className="modal fade"
      id="role-help"
      tabIndex={-1}
      aria-labelledby="role-help-label"
      aria-hidden="true"
    >
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id="role-help-label">
              Roles
            </h5>
            <button
              type="button"
              className="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close"
            ></button>
          </div>
          <div className="modal-body">
            <ul>
              <li>
                <strong>Staff</strong> is a member of the course staff. Depending on course
                settings, they may have permission to see the data of all users, and to edit the
                information of other users.
              </li>
              <li>
                <strong>Student</strong> is a student participating in the class. They can only see
                their own information, and can do assessments.
              </li>
              <li>
                <strong>None</strong> is a user who at one point was part of the course but is no
                longer enrolled in the course or part of the staff. They can no longer access the
                course but their work done within the course has been retained.
              </li>
            </ul>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-primary" data-bs-dismiss="modal">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
