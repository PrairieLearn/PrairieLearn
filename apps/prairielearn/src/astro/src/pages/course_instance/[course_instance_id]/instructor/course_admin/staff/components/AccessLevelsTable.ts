import { html } from '@prairielearn/html';

export function AccessLevelsTable() {
  return html`
    <table
      class="table table-striped table-sm border"
      style="max-width: 45em"
      aria-label="Recommended access levels"
    >
      <tr>
        <th scope="col">Role</th>
        <th class="text-center" scope="col">Course content access</th>
        <th class="text-center" scope="col">Student data access</th>
      </tr>
      <tr>
        <td>Instructor</td>
        <td class="text-center">Course content owner</td>
        <td class="text-center">Student data editor</td>
      </tr>
      <tr>
        <td>TAs developing course content</td>
        <td class="text-center">Course content editor</td>
        <td class="text-center">Student data editor</td>
      </tr>
      <tr>
        <td>Student content developers (not TAs)</td>
        <td class="text-center">Course content editor</td>
        <td class="text-center">None</td>
      </tr>
      <tr>
        <td>TAs involved in grading</td>
        <td class="text-center">None</td>
        <td class="text-center">Student data editor</td>
      </tr>
      <tr>
        <td>Other TAs</td>
        <td class="text-center">None</td>
        <td class="text-center">Student data viewer</td>
      </tr>
      <tr>
        <td>Instructors from other classes</td>
        <td class="text-center">Course content viewer</td>
        <td class="text-center">None</td>
      </tr>
    </table>
  `;
}
