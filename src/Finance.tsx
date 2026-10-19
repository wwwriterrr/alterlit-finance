import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type Balance, type Currency, type Period, type Transaction } from './api';
import { formatDate, monthKey, monthsBack, monthTitle, moscowDay, shortDay } from './date';
import { describe, kindOf } from './describe';
import { IconBook, IconLit } from './Icons';
import KindIcon from './KindIcon';
import RequestLitsDialog from './RequestLitsDialog';
import { links, siteUrl } from './links';
import { useTransactions } from './useTransactions';
import s from './Finance.module.css';

const money = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

const CURRENCIES: { id: Currency; label: string }[] = [
  { id: 'lits', label: 'Литы' },
  { id: 'books', label: 'Буки' },
];

type Preset = 'all' | 'month' | 'quarter' | 'year';
const PRESETS: { id: Preset; label: string; months: number }[] = [
  { id: 'all', label: 'Всё время', months: 0 },
  { id: 'month', label: 'Месяц', months: 1 },
  { id: 'quarter', label: '3 месяца', months: 3 },
  { id: 'year', label: 'Год', months: 12 },
];

const presetPeriod = (months: number): Period => (months ? { from: monthsBack(moscowDay(), months), to: '' } : { from: '', to: '' });

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Валюта и период живут в адресе: ?currency=books&from=2026-01-01&to=2026-03-31 */
function readQuery(): { currency: Currency; period: Period } {
  const q = new URLSearchParams(location.search);
  const day = (k: string) => {
    const v = q.get(k) ?? '';
    return DAY_RE.test(v) ? v : '';
  };
  return { currency: q.get('currency') === 'books' ? 'books' : 'lits', period: { from: day('from'), to: day('to') } };
}

function writeQuery(currency: Currency, period: Period) {
  const q = new URLSearchParams(location.search);
  const set = (k: string, v: string) => (v ? q.set(k, v) : q.delete(k));
  set('currency', currency === 'lits' ? '' : currency);
  set('from', period.from);
  set('to', period.to);
  const search = q.toString();
  history.replaceState(history.state, '', location.pathname + (search ? `?${search}` : '') + location.hash);
}

export default function Finance() {
  const initial = useMemo(readQuery, []);
  const [currency, setCurrency] = useState<Currency>(initial.currency);
  const [period, setPeriod] = useState<Period>(initial.period);
  const balance = useBalance();
  const list = useTransactions(currency, period);
  const [asking, setAsking] = useState(false);

  useEffect(() => writeQuery(currency, period), [currency, period]);

  const preset = PRESETS.find((p) => {
    const pp = presetPeriod(p.months);
    return pp.from === period.from && pp.to === period.to;
  })?.id;

  return (
    <section className={s.root}>
      {/* шапка — как на прежней странице */}
      <h1 className={s.title}>Транзакции</h1>
      <p className={s.info}>
        Тут можно пополнить кошелёк или запросить литы у Администрации. Литы начисляются активным участникам сообщества
        на усмотрение Администрации. Буки — это наша внутренняя валюта для оплаты предзаказа книг, которые предлагает
        ИД «Альтерлит».
      </p>
      <div className={s.btns}>
        <button type="button" className={s.btn} aria-haspopup="dialog" onClick={() => setAsking(true)}>
          <span>Запросить литы</span>
        </button>
        <a className={s.btn} href={links.pay(currency)}>
          <span>Пополнить</span>
        </a>
      </div>
      <RequestLitsDialog open={asking} onClose={() => setAsking(false)} />

      <div className={s.wrap}>
        <div className={s.tabs} role="tablist" aria-label="Валюта">
          {CURRENCIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={currency === c.id}
              className={s.tab}
              onClick={() => setCurrency(c.id)}
            >
              <span className={s.tabLabel}>{c.label}</span>
              <span className={s.tabAmount}>
                {balance ? money.format(balance[c.id]) : '…'}
                <CurrencyIcon currency={c.id} className={s.tabIcon} />
              </span>
            </button>
          ))}
        </div>

        <div className={s.filters}>
          <div className={s.presets} role="group" aria-label="Период">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={s.chip}
                aria-pressed={preset === p.id}
                onClick={() => setPeriod(presetPeriod(p.months))}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className={s.range}>
            <label className={s.dateField}>
              <span>с</span>
              <input
                type="date"
                value={period.from}
                max={period.to || moscowDay()}
                onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))}
              />
            </label>
            <label className={s.dateField}>
              <span>по</span>
              <input
                type="date"
                value={period.to}
                min={period.from || undefined}
                max={moscowDay()}
                onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))}
              />
            </label>
          </div>
        </div>

        <SummaryLine currency={currency} period={period} summary={list.summary} />

        <div role="tabpanel" aria-busy={list.loading !== null}>
          {list.loading === 'first' ? (
            <ListSkeleton />
          ) : list.items.length === 0 && list.error ? (
            <p className={s.state}>
              Не удалось загрузить операции.{' '}
              <button type="button" className={s.linkBtn} onClick={list.retry}>
                Повторить
              </button>
            </p>
          ) : list.items.length === 0 ? (
            <Empty currency={currency} filtered={Boolean(period.from || period.to)} />
          ) : (
            <>
              <MonthGroups items={list.items} />
              <Tail more={list.more} loading={list.loading === 'more'} error={list.error} onMore={list.loadMore} onRetry={list.retry} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/** Баланс для вкладок: при загрузке и дальше — из блока пользователя (alterlit:balance). */
function useBalance() {
  const [balance, setBalance] = useState<Balance | null>(null);
  useEffect(() => {
    let alive = true;
    api.balance().then(
      (b) => alive && setBalance(b),
      () => {},
    );
    const onBalance = (e: Event) => {
      const b = (e as CustomEvent<Balance>).detail;
      if (b && typeof b.lits === 'number') setBalance(b);
    };
    window.addEventListener('alterlit:balance', onBalance);
    return () => {
      alive = false;
      window.removeEventListener('alterlit:balance', onBalance);
    };
  }, []);
  return balance;
}

function CurrencyIcon({ currency, className }: { currency: Currency; className?: string }) {
  return currency === 'lits' ? <IconLit className={className} /> : <IconBook className={className} />;
}

function periodText({ from, to }: Period) {
  if (from && to) return from === to ? `за ${shortDay(from)}` : `с ${shortDay(from)} по ${shortDay(to)}`;
  if (from) return `с ${shortDay(from)}`;
  if (to) return `по ${shortDay(to)}`;
  return 'за всё время';
}

const OPERATIONS: [string, string, string] = ['операция', 'операции', 'операций'];
function plural(n: number, [one, few, many]: [string, string, string]) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function SummaryLine({ currency, period, summary }: { currency: Currency; period: Period; summary: ReturnType<typeof useTransactions>['summary'] }) {
  if (!summary) return <div className={s.summary} aria-hidden="true" />;
  return (
    <div className={s.summary}>
      <span className={s.summaryPeriod}>
        {periodText(period)} · {summary.count} {plural(summary.count, OPERATIONS)}
      </span>
      {summary.count > 0 && (
        <span className={s.summaryTotals}>
          {summary.income > 0 && (
            <span className={s.plus} title="Пришло">
              +{money.format(summary.income)}
              <CurrencyIcon currency={currency} className={s.sumIcon} />
            </span>
          )}
          {summary.outcome > 0 && (
            <span className={s.minus} title="Списано">
              −{money.format(summary.outcome)}
              <CurrencyIcon currency={currency} className={s.sumIcon} />
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function MonthGroups({ items }: { items: Transaction[] }) {
  const groups: { key: string; items: Transaction[] }[] = [];
  for (const t of items) {
    const key = monthKey(t.date);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(t);
    else groups.push({ key, items: [t] });
  }
  return (
    <>
      {groups.map((g) => (
        <section key={g.key} className={s.month} aria-label={monthTitle(g.key)}>
          <h2 className={s.monthTitle}>{monthTitle(g.key)}</h2>
          <ul className={s.list}>
            {g.items.map((t) => (
              <Row key={t.id} t={t} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function Row({ t }: { t: Transaction }) {
  const d = useMemo(() => describe(t), [t]);
  const plus = t.amount > 0;
  return (
    <li className={s.row}>
      <KindIcon kind={kindOf(t)} />
      <div className={s.body}>
        <div className={s.rowTitle} dangerouslySetInnerHTML={{ __html: d.title }} />
        {t.post && (
          <div className={s.note}>
            {t.post.url ? <a href={siteUrl(t.post.url)}>«{t.post.title}»</a> : `«${t.post.title}»`}
          </div>
        )}
        {d.note && <div className={s.note} dangerouslySetInnerHTML={{ __html: d.note }} />}
        {d.quote && <blockquote className={s.quote}>{d.quote}</blockquote>}
        <time className={s.date} dateTime={t.date}>
          {formatDate(t.date)}
        </time>
      </div>
      <div className={s.amount} data-sign={plus ? 'plus' : 'minus'}>
        {plus ? '+' : '−'}
        {money.format(Math.abs(t.amount))}
        <CurrencyIcon currency={t.currency} className={s.amountIcon} />
      </div>
    </li>
  );
}

/** Конец списка: бесконечная подгрузка по мере прокрутки, кнопка — запасной путь. */
function Tail({
  more,
  loading,
  error,
  onMore,
  onRetry,
}: {
  more: boolean;
  loading: boolean;
  error: boolean;
  onMore: () => void;
  onRetry: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const auto = more && !loading && !error;
  useEffect(() => {
    const el = ref.current;
    if (!el || !auto) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onMore(), {
      rootMargin: '600px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [auto, onMore]);

  if (error) {
    return (
      <div className={s.tail}>
        Не удалось загрузить ещё.{' '}
        <button type="button" className={s.linkBtn} onClick={onRetry}>
          Повторить
        </button>
      </div>
    );
  }
  if (!more) {
    return (
      <div className={s.tail}>
        <span className={s.end}>Транзакций больше нет</span>
      </div>
    );
  }
  return (
    <div ref={ref} className={s.tail}>
      {loading ? (
        <span className={s.loadingDots}>Загружаем…</span>
      ) : (
        <button type="button" className={s.linkBtn} onClick={onMore}>
          Показать ещё
        </button>
      )}
    </div>
  );
}

function Empty({ currency, filtered }: { currency: Currency; filtered: boolean }) {
  return (
    <div className={s.empty}>
      <p className={s.emptyTitle}>{filtered ? 'За этот период операций нет' : 'Операций пока не было'}</p>
      <p className={s.emptyText}>
        {filtered
          ? 'Попробуйте выбрать другие даты.'
          : currency === 'books'
            ? 'Буки появятся после пополнения или предзаказа книги.'
            : 'Здесь появятся пополнения, переводы и списания за публикации.'}
      </p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className={s.skeleton} aria-label="Загрузка операций">
      <span className={`${s.ghost} ${s.gMonth}`} />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={s.row}>
          <span className={`${s.kind} ${s.ghost}`} />
          <div className={s.body}>
            <span className={`${s.ghost} ${s.gLine}`} />
            <span className={`${s.ghost} ${s.gShort}`} />
          </div>
          <span className={`${s.ghost} ${s.gAmount}`} />
        </div>
      ))}
    </div>
  );
}
