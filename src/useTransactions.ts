import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Currency, type Period, type Summary, type Transaction } from './api';

export interface TransactionsState {
  items: Transaction[];
  summary: Summary | null;
  more: boolean;
  /** первая страница или следующая */
  loading: 'first' | 'more' | null;
  error: boolean;
}

/** Событие transaction личного потока — его пересылает блок пользователя (alterlit:transaction). */
interface TransactionEvent {
  action: 'created' | 'updated' | 'deleted';
  transaction: Transaction;
}

const newestFirst = (a: Transaction, b: Transaction) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id);

const inPeriod = (t: Transaction, p: Period) => {
  const day = t.date.slice(0, 10);
  return (!p.from || day >= p.from) && (!p.to || day <= p.to);
};

/** Вклад одной транзакции в итоги периода (знак sign: +1 добавить, −1 убрать). */
function shiftSummary(s: Summary | null, t: Transaction, sign: 1 | -1): Summary | null {
  if (!s) return s;
  return {
    income: s.income + (t.amount > 0 ? sign * t.amount : 0),
    outcome: s.outcome + (t.amount < 0 ? sign * -t.amount : 0),
    count: s.count + sign,
  };
}

/**
 * Транзакции одной валюты за период: страницы по 30, новые сверху.
 * Смена валюты или периода — загрузка заново; новые операции из сокета
 * встают в список сразу, и сдвиг offset это учитывает.
 */
export function useTransactions(currency: Currency, period: Period) {
  const [state, setState] = useState<TransactionsState>({
    items: [],
    summary: null,
    more: false,
    loading: 'first',
    error: false,
  });
  // сколько записей сервера уже у нас — offset следующей страницы
  const offset = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const latest = useRef(state);
  latest.current = state;
  const { from, to } = period;

  const load = useCallback(
    (first: boolean) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      if (first) offset.current = 0;
      setState((s) =>
        first
          ? { items: [], summary: null, more: false, loading: 'first', error: false }
          : { ...s, loading: 'more', error: false },
      );
      api.transactions(currency, { from, to }, offset.current, ctrl.signal).then(
        (page) => {
          offset.current += page.objects.length;
          setState((s) => {
            // live-вставка могла опередить страницу — без дублей
            const seen = new Set(s.items.map((t) => t.id));
            return {
              items: [...s.items, ...page.objects.filter((t) => !seen.has(t.id))],
              summary: page.summary ?? s.summary,
              more: page.more,
              loading: null,
              error: false,
            };
          });
        },
        (e: unknown) => {
          if (ctrl.signal.aborted) return;
          console.error('finance: transactions', e);
          setState((s) => ({ ...s, loading: null, error: true }));
        },
      );
    },
    [currency, from, to],
  );

  useEffect(() => {
    load(true);
    return () => abort.current?.abort();
  }, [load]);

  const loadMore = useCallback(() => load(false), [load]);
  const retry = useCallback(() => load(state.items.length === 0), [load, state.items.length]);

  // живые изменения: пополнение, списание, правка или удаление в админке
  useEffect(() => {
    const onTransaction = (e: Event) => {
      const { action, transaction: t } = (e as CustomEvent<TransactionEvent>).detail ?? {};
      if (!t || t.currency !== currency) return;
      // считаем от последнего отрисованного состояния, а не в updater: StrictMode
      // вызывает updater дважды, и offset сдвинулся бы два раза
      const s = latest.current;
      const old = s.items.find((x) => x.id === t.id);
      const fits = action !== 'deleted' && inPeriod(t, { from, to });
      if (!old && !fits) return;
      let items = s.items.filter((x) => x.id !== t.id);
      let summary = old ? shiftSummary(s.summary, old, -1) : s.summary;
      if (old) offset.current -= 1;
      if (fits && (old || action === 'created')) {
        // старше последней загруженной — придёт со следующей страницей
        const last = items[items.length - 1];
        if (!s.more || !last || newestFirst(t, last) < 0) {
          items = [...items, t].sort(newestFirst);
          offset.current += 1;
        }
        summary = shiftSummary(summary, t, 1);
      }
      latest.current = { ...s, items, summary };
      setState(latest.current);
    };
    window.addEventListener('alterlit:transaction', onTransaction);
    return () => window.removeEventListener('alterlit:transaction', onTransaction);
  }, [currency, from, to]);

  return { ...state, loadMore, retry };
}
