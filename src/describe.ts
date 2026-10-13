import type { Transaction } from './api';
import { sanitize } from './html';

export type Kind = 'admin' | 'fair' | 'market' | 'gift' | 'transfer' | 'topup' | 'preorder' | 'other';

/** Вид операции по reason (у литов и буков свои справочники). */
export function kindOf(t: Transaction): Kind {
  if (t.currency === 'books') {
    return (['other', 'admin', 'preorder', 'topup'] as const)[t.reason] ?? 'other';
  }
  return (['other', 'admin', 'fair', 'market', 'gift', 'transfer', 'topup'] as const)[t.reason] ?? 'other';
}

/** Комментарии, которые сайт пишет сам и которые лишь повторяют вид операции. */
const BOILERPLATE = new Set([
  'Баланс пополнен',
  'Баланс Буков пополнен',
  'Списание за публикацию на Ярмарке Тщеславия',
  'Списание за публикацию "Creative Market"',
]);

export interface Described {
  /** заголовок строки — безопасный HTML (у перевода — ссылка на собеседника) */
  title: string;
  /** пояснение — безопасный HTML или пусто */
  note: string;
  /** сообщение к переводу — текст */
  quote: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Понятный вид операции. Перевод пишется в comment как
 * «Перевод от <a>Отправитель</a> -> <a>Получатель</a>. Комментарий: "…"» —
 * разбираем: «Перевод от Отправителя» или «Перевод Получателю» + сообщение отдельно.
 */
export function describe(t: Transaction): Described {
  const comment = (t.comment ?? '').trim();
  if (kindOf(t) === 'transfer' && comment) {
    const doc = new DOMParser().parseFromString(sanitize(comment), 'text/html');
    const people = doc.querySelectorAll('a');
    const msg = /Комментарий:\s*"([\s\S]*)"\s*$/.exec(doc.body.textContent ?? '');
    if (people.length >= 2) {
      const who = people[t.amount > 0 ? 0 : 1].outerHTML;
      return {
        title: t.amount > 0 ? `Перевод от ${who}` : `Перевод для ${who}`,
        note: '',
        quote: msg ? msg[1] : '',
      };
    }
  }
  return {
    title: esc(t.reason ? t.reason_label : 'Операция'),
    note: comment && !BOILERPLATE.has(comment) ? sanitize(comment) : '',
    quote: '',
  };
}
