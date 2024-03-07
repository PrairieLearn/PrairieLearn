//@ts-check
/**
 * This is a semantic layer on top of the `==` operator that should only
 * be used when comparing IDs.
 *
 * Normally, using the `==` operator is not recommended, since it can have
 * unexpected behavior. In fact, doing so is a lint error! The recommended
 * alternative is the "strict equal" operator: `===`.
 *
 * However, the IDs that we use throughout our codebase are sometimes strings
 * and sometimes numbers, depending on where they code from. For instance, an
 * ID might be a number if it's queried and returned in JSON, but it'll be a
 * string if it's queried directly or if it comes in the body of a request. We
 * actually take advantage of the type coercion that `==` performs so that we
 * can easily compare two IDs no matter what type they have.
 *
 * To avoid the need to litter our codebase with `// eslint-disable` comments,
 * one should use this wrapper function whenever there's a need to check IDs
 * for equality.
 *
 * In the future, the existence of this function could make it easier to start
 * parsing IDs as `BigInt` objects as they come out of the database.
 *
 * @param {string | number} id1
 * @param {string | number} id2
 */
export function idsEqual(id1, id2) {
  // eslint-disable-next-line eqeqeq
  return id1 == id2;
}
