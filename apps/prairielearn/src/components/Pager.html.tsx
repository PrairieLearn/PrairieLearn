import { html } from '@prairielearn/html';

export function Pager({
  extraQueryParams,
  chosenPage,
  count,
  pageSize,
}: {
  extraQueryParams: string | null;
  chosenPage: number;
  count: number;
  pageSize: number;
}) {
  const { prevPage, currPage, nextPage, lastPage } = pages(chosenPage, count, pageSize);
  const suffix = extraQueryParams ? `&${extraQueryParams}` : '';
  return html`
    <nav aria-label="Change page">
      <ul class="pagination justify-content-center mb-0">
        <li class="page-item ${currPage === 1 ? 'disabled' : ''}">
          <a class="page-link" href="?page=1${suffix}">
            <i class="fa fa-angle-double-left" aria-hidden="true"></i>
            First
          </a>
        </li>
        <li class="page-item ${currPage === 1 ? 'disabled' : ''}">
          <a class="page-link" href="?page=${prevPage}${suffix}">
            <i class="fa fa-angle-left" aria-hidden="true"></i>
            Prev
          </a>
        </li>
        <li class="page-item" aria-current="page">
          <a class="page-link" href="?page=${currPage}${suffix}">Page ${currPage}/${lastPage}</a>
        </li>
        <li class="page-item ${currPage === lastPage ? 'disabled' : ''}">
          <a class="page-link" href="?page=${nextPage}${suffix}">
            Next
            <i class="fa fa-angle-right" aria-hidden="true"></i>
          </a>
        </li>
        <li class="page-item ${currPage === lastPage ? 'disabled' : ''}">
          <a class="page-link" href="?page=${lastPage}${suffix}">
            Last
            <i class="fa fa-angle-double-right" aria-hidden="true"></i>
          </a>
        </li>
      </ul>
    </nav>
  `;
}

export function pages(chosenPage: number, count: number, pageSize: number) {
  const lastPage = Math.max(1, Math.ceil(count / pageSize));

  let currPage = Number(chosenPage);
  if (!Number.isInteger(currPage)) currPage = 1;
  currPage = Math.max(1, Math.min(lastPage, currPage));

  return {
    currPage,
    lastPage,
    prevPage: Math.max(1, currPage - 1),
    nextPage: Math.min(lastPage, currPage + 1),
  };
}
