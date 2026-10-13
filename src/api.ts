export type Currency = 'lits' | 'books';

/** /api/v1/users/balance/ */
export interface Balance {
  lits: number;
  books: number;
}

/** Транзакция: GET /api/v1/altermoney/transactions/ и событие transaction личного потока. */
export interface Transaction {
  id: number;
  currency: Currency;
  /** со знаком: + пополнение, − списание */
  amount: number;
  /** Transaction.REASONS / TransactionBooks.REASONS */
  reason: number;
  reason_label: string;
  /** HTML (у переводов — ссылки на пользователей) */
  comment: string | null;
  /** без смещения, по Москве */
  date: string;
  post: { id: number; title: string; url: string | null } | null;
}

export interface Summary {
  income: number;
  /** сколько списано — положительное число */
  outcome: number;
  count: number;
}

export interface TransactionPage {
  objects: Transaction[];
  more: boolean;
  offset: number;
  /** только при offset=0 */
  summary?: Summary;
}

export interface Period {
  /** YYYY-MM-DD включительно; пусто — без границы */
  from: string;
  to: string;
}

/** Текущий пользователь: /api/v1/users/session/self/ */
export interface Me {
  id: number;
  username: string;
  name: string;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    /** detail из ответа DRF, если есть */
    public detail = '',
  ) {
    super(detail || `HTTP ${status}`);
  }
}

let csrfFallback = '';
/** Токен CSRF, если куки csrftoken нет: <div id="alterlit-finance" data-csrf="{{ csrf_token }}"> */
export function setCsrfFallback(token: string) {
  csrfFallback = token;
}

function csrfToken() {
  const m = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : csrfFallback;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.method && init.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
    const token = csrfToken();
    if (token) headers.set('X-CSRFToken', token);
  }
  const r = await fetch(url, { ...init, headers, credentials: 'same-origin' });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new HttpError(r.status, typeof body?.detail === 'string' ? body.detail : '');
  }
  return (await r.json().catch(() => ({}))) as T;
}

const get = <T>(url: string, signal?: AbortSignal) => request<T>(url, { signal });

export const PAGE_SIZE = 30;

export const api = {
  me: () => get<Me>('/api/v1/users/session/self/'),
  balance: () => get<Balance>('/api/v1/users/balance/'),
  /** Обращение в поддержку (текст задачи) — так же просят литы у Администрации. */
  supportTask: (text: string) => request<unknown>('/api/v1/support/task/session/', { method: 'POST', body: JSON.stringify({ text }) }),
  transactions: (currency: Currency, period: Period, offset: number, signal?: AbortSignal) => {
    const q = new URLSearchParams({ currency, offset: String(offset), limit: String(PAGE_SIZE) });
    if (period.from) q.set('from', period.from);
    if (period.to) q.set('to', period.to);
    return get<TransactionPage>(`/api/v1/altermoney/transactions/?${q}`, signal);
  },
};
