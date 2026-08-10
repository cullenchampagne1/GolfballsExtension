/* Pure helpers for the proposal builder's left-hand structure rail. A proposal
   line can expand into multiple email rows (one per quantity split), so moves
   are performed by line id and keep every generated row for that item together. */

const _list = (value) => Array.isArray(value) ? value : [];
const _hasId = (value) => value !== undefined && value !== null && String(value) !== '';
const _rawKey = (line, index) => _hasId(line && line.id) ? `line:${String(line.id)}` : `raw:${index}`;
const _rowKey = (row, index) => _hasId(row && row.lineId) ? `line:${String(row.lineId)}` : `row:${index}`;

function _sectionItems(section) {
  const rawLines = _list(section && section.rawLines);
  const rows = _list(section && section.lines);
  const keys = [];
  const seen = new Set();
  const add = (key) => { if (!seen.has(key)) { seen.add(key); keys.push(key); } };

  rawLines.forEach((line, index) => add(_rawKey(line, index)));
  rows.forEach((row, index) => add(_rowKey(row, index)));

  return keys.map((key, index) => {
    const rawLine = rawLines.find((line, rawIndex) => _rawKey(line, rawIndex) === key) || null;
    const itemRows = rows.filter((row, rowIndex) => _rowKey(row, rowIndex) === key);
    const firstRow = itemRows[0] || null;
    const product = (rawLine && rawLine.product) || {};
    const giftSet = rawLine && rawLine.decoration && rawLine.decoration.giftSet;
    const rawQty = _list(rawLine && rawLine.splits).reduce((sum, split) => sum + (Number(split && split.qty) || 0), 0);
    const rowQty = itemRows.reduce((sum, row) => sum + (Number(row && row.qty) || 0), 0);

    return {
      key,
      title: (giftSet && giftSet.name) || product.title || (firstRow && firstRow.title) || `Item ${index + 1}`,
      brand: (firstRow && firstRow.brand) || product.brand || '',
      quantity: itemRows.length ? rowQty : rawQty,
      free: !!((rawLine && rawLine.free) || itemRows.some((row) => row && row.free)),
    };
  });
}

/** Build the sidebar's section/item outline without changing the email source. */
export function buildProposalOutline(source) {
  if (!source) return [];
  const hasSections = Array.isArray(source.sections) && source.sections.length > 0;
  const sections = hasSections ? source.sections : [source];
  return sections.map((section, index) => ({
    index,
    key: (section && section.cartLink) || `section:${index}`,
    label: (section && (section.optionName || section.name)) || (hasSections ? `Option ${index + 1}` : 'Proposal'),
    items: _sectionItems(section),
  }));
}

function _move(values, fromIndex, toIndex) {
  const next = values.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function _orderByItemKeys(values, keyOf, orderedKeys) {
  const buckets = new Map();
  values.forEach((value, index) => {
    const key = keyOf(value, index);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(value);
  });
  const next = [];
  orderedKeys.forEach((key) => {
    next.push(...(buckets.get(key) || []));
    buckets.delete(key);
  });
  buckets.forEach((bucket) => next.push(...bucket));
  return next;
}

function _moveInSection(section, fromIndex, toIndex) {
  const items = _sectionItems(section);
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length || fromIndex === toIndex) return section;
  const orderedKeys = _move(items.map((item) => item.key), fromIndex, toIndex);
  return {
    ...section,
    rawLines: _orderByItemKeys(_list(section && section.rawLines), _rawKey, orderedKeys),
    lines: _orderByItemKeys(_list(section && section.lines), _rowKey, orderedKeys),
  };
}

/**
 * Return a new source with one item moved inside one proposal section. Product
 * rows, raw personalization data, and the combined multi-proposal raw list stay
 * in the same order. Invalid/no-op moves return the original source object.
 */
export function moveProposalItem(source, sectionIndex, fromIndex, toIndex) {
  if (!source) return source;
  const hasSections = Array.isArray(source.sections) && source.sections.length > 0;
  if (!hasSections) return _moveInSection(source, fromIndex, toIndex);
  if (sectionIndex < 0 || sectionIndex >= source.sections.length) return source;

  const current = source.sections[sectionIndex];
  const moved = _moveInSection(current, fromIndex, toIndex);
  if (moved === current) return source;
  const sections = source.sections.map((section, index) => index === sectionIndex ? moved : section);
  return {
    ...source,
    sections,
    rawLines: sections.flatMap((section) => _list(section && section.rawLines)),
  };
}
