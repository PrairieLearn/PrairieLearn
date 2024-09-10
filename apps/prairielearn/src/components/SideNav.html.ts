import { html } from '@prairielearn/html';

export function SideNav() {
  return html`
    <div class="side-nav">
      <div class="side-nav-section-header">Course</div>

      <div class="side-nav-group mb-3">
        <div>
          <select id="course-picker" class="form-select" aria-label="Course">
            <option selected>XC 101</option>
            <option>Other course</option>
          </select>
        </div>

        <a href="/" class="side-nav-link">
          <i class="fa fa-fw fa-chalkboard-user"></i> Course instances
        </a>
        <a href="/" class="side-nav-link side-nav-link-active">
          <i class="fa fa-fw fa-question" aria-hidden="true"></i> Questions
        </a>
        <a href="/" class="side-nav-link"><i class="fa fa-fw fa-bug"></i> Issues</a>
        <a href="/" class="side-nav-link">
          <i class="fa fa-fw fa-sync" aria-hidden="true"></i> Sync
        </a>
        <a href="/" class="side-nav-link">
          <i class="fa fa-fw fa-edit" aria-hidden="true"></i> Files
        </a>
        <a href="/" class="side-nav-link"><i class="fa fa-fw fa-gear"></i> Settings</a>
      </div>

      <div class="side-nav-section-header">Course instance</div>

      <div class="side-nav-group mb-3">
        <div>
          <select id="course-instance-picker" class="form-select" aria-label="Course instance">
            <option selected>Fall 2024</option>
            <option>Spring 2024</option>
          </select>
        </div>

        <a href="/" class="side-nav-link">
          <i class="fa fa-fw fa-list" aria-hidden="true"></i> Assessments
        </a>
        <a href="/" class="side-nav-link">
          <i class="fa fa-fw fa-scale-balanced" aria-hidden="true"></i> Gradebook
        </a>
        <a href="/" class="side-nav-link">
          <i class="fa fa-fw fa-edit" aria-hidden="true"></i>Files
        </a>
        <a href="/" class="side-nav-link"><i class="fa fa-fw fa-gear"></i> Settings</a>
      </div>
    </div>
  `;
}
