const { PAGE } = require('../domain/constants');

// { page, limit } (already validated) → what a Mongo query needs
function paginate({ page = PAGE.DEFAULT_PAGE, limit = PAGE.DEFAULT_LIMIT } = {}) {
  return { page, limit, skip: (page - 1) * limit };
}

// The spec's Page<T>: { items, page, limit, total }
function toPage(items, page, limit, total) {
  return { items, page, limit, total };
}

// For lists built in memory (e.g. ranked matches)
function slicePage(all, page, limit) {
  const { skip } = paginate({ page, limit });
  return toPage(all.slice(skip, skip + limit), page, limit, all.length);
}

module.exports = { PAGE, paginate, toPage, slicePage };
