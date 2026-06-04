import clsx from 'clsx';

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
  return (
    <nav aria-label="Change page">
      <ul className="pagination justify-content-center mb-0">
        <li className={clsx('page-item', { disabled: currPage === 1 })}>
          <a className="page-link" href={`?page=1${suffix}`}>
            <i className="fa fa-angle-double-left" aria-hidden="true" /> First
          </a>
        </li>
        <li className={clsx('page-item', { disabled: currPage === 1 })}>
          <a className="page-link" href={`?page=${prevPage}${suffix}`}>
            <i className="fa fa-angle-left" aria-hidden="true" /> Prev
          </a>
        </li>
        <li className="page-item" aria-current="page">
          <a className="page-link" href={`?page=${currPage}${suffix}`}>
            Page {currPage}/{lastPage}
          </a>
        </li>
        <li className={clsx('page-item', { disabled: currPage === lastPage })}>
          <a className="page-link" href={`?page=${nextPage}${suffix}`}>
            Next <i className="fa fa-angle-right" aria-hidden="true" />
          </a>
        </li>
        <li className={clsx('page-item', { disabled: currPage === lastPage })}>
          <a className="page-link" href={`?page=${lastPage}${suffix}`}>
            Last <i className="fa fa-angle-double-right" aria-hidden="true" />
          </a>
        </li>
      </ul>
    </nav>
  );
}

function pages(chosenPage: number, count: number, pageSize: number) {
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
