// Даты с сервера — без смещения, по Москве: «2026-10-13T16:19:00.123456».
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

const DAY_MS = 86_400_000;

/** Сегодня по Москве, YYYY-MM-DD (со сдвигом в днях). */
export function moscowDay(shiftDays = 0): string {
  return new Date(Date.now() + 3 * 3600_000 + shiftDays * DAY_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD → тот же день n месяцев назад (31 марта − 1 месяц = 28/29 февраля). */
export function monthsBack(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 - n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** «2026-10» — ключ группы по месяцу. */
export const monthKey = (iso: string) => iso.slice(0, 7);

/** «Октябрь», в прошлые годы — «Октябрь 2025». */
export function monthTitle(key: string): string {
  const [y, m] = key.split('-');
  const name = MONTHS_NOM[Number(m) - 1] ?? key;
  return y === moscowDay().slice(0, 4) ? name : `${name} ${y}`;
}

/** «сегодня, 16:19», «вчера, 23:10», «3 октября, 09:15» — год уже в заголовке месяца. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, , mo, d, hh, mm] = m;
  const time = `${hh}:${mm}`;
  const day = iso.slice(0, 10);
  if (day === moscowDay()) return `сегодня, ${time}`;
  if (day === moscowDay(-1)) return `вчера, ${time}`;
  return `${Number(d)} ${MONTHS[Number(mo) - 1]}, ${time}`;
}

/** «13.10.2026» для подписи периода. */
export function shortDay(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}.${m}.${y}`;
}
