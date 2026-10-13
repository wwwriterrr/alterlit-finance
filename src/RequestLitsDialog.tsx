import { useEffect, useRef, useState } from 'react';
import { api, HttpError, type Me } from './api';
import s from './RequestLitsDialog.module.css';

/** Больше за один запрос не просят. */
const MAX_AMOUNT = 100_000;
const amountFmt = new Intl.NumberFormat('ru-RU');

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

/**
 * «Запросить литы»: количество и причина уходят задачей в поддержку
 * (POST /api/v1/support/task/session/) — как раньше делала кнопка на старой странице.
 */
export default function RequestLitsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // открытие и закрытие — через showModal/close: фокус внутри, Esc, фон страницы неактивен
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal ставит фокус на первый элемент — крестик; нам нужно поле количества
      dialog.querySelector<HTMLInputElement>('input')?.focus();
      // после отправленной заявки — снова чистая форма
      setStatus((st) => (st.kind === 'sent' ? { kind: 'idle' } : st));
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // имя и логин нужны для текста заявки; грузим один раз при первом открытии
  useEffect(() => {
    if (!open || me) return;
    api.me().then(setMe, () => {});
  }, [open, me]);

  const sending = status.kind === 'sending';
  const value = Number(amount);
  const amountOk = /^\d+$/.test(amount) && value >= 1 && value <= MAX_AMOUNT;
  const canSend = amountOk && comment.trim().length > 0 && !sending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setStatus({ kind: 'sending' });
    try {
      const user = me ?? (await api.me());
      setMe(user);
      await api.supportTask(
        `Пользователь ${user.name} (${user.username}) запрашивает литы в количестве: ${value}. Комментарий: ${comment.trim()}`,
      );
      setStatus({ kind: 'sent' });
      setAmount('');
      setComment('');
    } catch (err) {
      const message =
        err instanceof HttpError && err.detail
          ? err.detail
          : err instanceof HttpError && err.status === 403
            ? 'Сессия истекла — обновите страницу и войдите снова.'
            : 'Не удалось отправить запрос. Попробуйте ещё раз.';
      setStatus({ kind: 'error', message });
    }
  };

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby="request-lits-title"
      // Esc и закрытие формой: синхронизируем состояние родителя
      onClose={onClose}
      // клик по затемнению (вне окна) закрывает
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className={s.box}>
        <button type="button" className={s.close} aria-label="Закрыть" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h2 id="request-lits-title" className={s.title}>
          Запросить литы
        </h2>

        {status.kind === 'sent' ? (
          <div className={s.sent} role="status">
            <svg className={s.check} viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9.5" />
              <path d="M7.8 12.4l2.8 2.8 5.6-6" />
            </svg>
            <p>Ваша просьба будет обработана в ближайшее время.</p>
            <button type="button" className={s.submit} onClick={onClose} autoFocus>
              Хорошо
            </button>
          </div>
        ) : (
          <form className={s.form} onSubmit={submit} noValidate>
            <p className={s.text}>Опишите, какое количество литов вы запрашиваете и на что хотите их потратить.</p>
            <label className={s.field}>
              <span className={s.label}>Количество литов</span>
              <input
                className={s.input}
                // text, а не number: number пропускает «-», «e», «+» и дроби
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={String(MAX_AMOUNT).length}
                autoComplete="off"
                required
                value={amount}
                disabled={sending}
                aria-invalid={amount !== '' && !amountOk}
                // только цифры — в том числе при вставке; ведущие нули отбрасываем
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))}
              />
              {amount !== '' && !amountOk && <span className={s.hint}>От 1 до {amountFmt.format(MAX_AMOUNT)}</span>}
            </label>
            <label className={s.field}>
              <span className={s.label}>На что потратите</span>
              <textarea
                className={`${s.input} ${s.textarea}`}
                rows={4}
                required
                value={comment}
                disabled={sending}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            {status.kind === 'error' && (
              <p className={s.error} role="alert">
                {status.message}
              </p>
            )}
            <button type="submit" className={s.submit} disabled={!canSend}>
              {sending ? 'Отправляем…' : 'Запросить'}
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}
