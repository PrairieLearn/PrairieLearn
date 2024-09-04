import { html } from '@prairielearn/html';

export function SideNav() {
  return html`
    <div class="side-nav">
      <label for="course-picker" class="form-label">Course</label>
      <select id="course-picker" class="form-select">
        <option selected>XC 101</option>
        <option>Other course</option>
      </select>

      <a href="/"><i class="fa fa-question" aria-hidden="true"></i> Questions</a>
      <a href="/"><i class="fa fa-edit" aria-hidden="true"></i>Files</a>
      <a href="/"><i class="fa fa-bug"></i> Issues</a>

      <div class="side-nav-section-header">Course instance</div>
    </div>
  `;
}
