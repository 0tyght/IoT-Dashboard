'use strict';

const bangkokTimestamp = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: false
});

function localTimestamp(value) {
  return bangkokTimestamp.format(new Date(value)).replace(' ', 'T').replace(',', '.') + '+07:00';
}

function csvCell(value) {
  let text = value == null ? '' : String(value);
  // Keep real numeric measurements numeric and prevent text from becoming formulas in Excel.
  if (!(typeof value === 'number' && Number.isFinite(value)) && /^[\s]*[=+\-@\t\r]/.test(text) && !/^[-+]?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

module.exports = { csvCell, localTimestamp };
