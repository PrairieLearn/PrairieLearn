import { html, HtmlSafeString } from '@prairielearn/html';

export function Application({
  topNav,
  sideNav,
  main,
}: {
  topNav: HtmlSafeString;
  sideNav: HtmlSafeString;
  main: HtmlSafeString;
}) {
  return html`
    <div class="app-container">
      <div class="app-top-nav">${topNav}</div>
      <div class="app-side-nav">${sideNav}</div>
      <div class="app-main">
        <div class="app-main-container">${main}</div>
      </div>
    </div>
  `;
}
