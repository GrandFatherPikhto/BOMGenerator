// Number formatting helpers for the client.
export function formatMoney(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return Number(value).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(value) {
  if (!value) {
    return '';
  }
  return new Date(value).toLocaleString('ru-RU');
}
