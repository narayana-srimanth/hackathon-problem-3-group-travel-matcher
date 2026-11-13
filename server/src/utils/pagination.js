// Every list endpoint returns { items, page, limit, total } (API spec §1).
const skipOf = ({ page, limit }) => (page - 1) * limit;

const toPage = (items, { page, limit }, total) => ({ items, page, limit, total });

// For lists built in memory (e.g. ranked matches)
const paginateArray = (all, { page, limit }) =>
  toPage(all.slice(skipOf({ page, limit }), page * limit), { page, limit }, all.length);

module.exports = { skipOf, toPage, paginateArray };
