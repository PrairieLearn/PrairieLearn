//@ts-check
const _ = require('lodash');

export function pages(chosenPage, count, pageSize) {
  let lastPage = Math.ceil(count / pageSize);
  if (lastPage === 0) lastPage = 1;

  let currPage = Number(chosenPage);
  if (!_.isInteger(currPage)) currPage = 1;

  let prevPage = currPage - 1;
  let nextPage = currPage + 1;

  currPage = Math.max(1, Math.min(lastPage, currPage));
  prevPage = Math.max(1, Math.min(lastPage, prevPage));
  nextPage = Math.max(1, Math.min(lastPage, nextPage));

  return { currPage, prevPage, nextPage, lastPage };
}
