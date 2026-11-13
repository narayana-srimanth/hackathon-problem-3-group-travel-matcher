// Makes user text safe to embed in a RegExp (E05's name search)
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toIso = (date) => (date instanceof Date ? date.toISOString() : (date ?? null));

module.exports = { escapeRegex, toIso };
