# alterlit-finance

Страница `/finance/` сайта alterlit.ru — остров на React + TypeScript + Vite (как чат и блок пользователя).

- Шапка как прежде: «Транзакции», пояснение, «Запросить литы» и «Пополнить» (`/pay/?currency=<вкладка>`).
- «Запросить литы» — окно (`<dialog>`) с количеством и причиной; заявка уходит задачей в поддержку:
  `POST /api/v1/support/task/session/ {text: "Пользователь <имя> (<логин>) запрашивает литы в количестве: N. Комментарий: …"}`.
- Вкладки «Литы» / «Буки» с балансом, период: «Всё время», «Месяц», «3 месяца», «Год» или свои даты «с … по …».
- Итоги за период: сколько пришло и списано, число операций.
- Операции сгруппированы по месяцам, у каждой — знак вида, понятный заголовок (у переводов — «Перевод от X» / «Перевод для X» и сообщение цитатой), публикация для списаний, сумма со знаком.
- Бесконечная подгрузка по 30 (IntersectionObserver), кнопка «Показать ещё» — запасной путь.
- Валюта и период сохраняются в адресе: `/finance/?currency=books&from=2026-01-01&to=2026-03-31`.
- Живые изменения без своего сокета: блок пользователя пересылает события личного потока как
  `alterlit:transaction` и `alterlit:balance` — новые операции встают в список, баланс во вкладках меняется.

## API

`GET /api/v1/altermoney/transactions/?currency=lits|books&from=YYYY-MM-DD&to=YYYY-MM-DD&offset=0&limit=30`
→ `{objects, more, offset, summary?}`. Патч бэка — `django/altermoney_patch.py`.

## Разработка

```sh
npm install
npm run dev      # http://localhost:5175
npm run build    # dist/finance.js, dist/finance.css → /assets/finance/
```

`.env.local` (в git не попадает):

- `BACKEND_URL=https://alterlit.ru`, `DEV_COOKIE=…` — прокси `/api`, `/media`, `/ws` с сессией;
- `DEV_FIXTURES=1` — ручку транзакций отдаёт dev-сервер из `dev-fixtures/<currency>.json` (тоже вне git),
  пока её нет на сервере.

На dev-странице внизу слева — кнопки имитации событий «+50 / −20 литов».

## Подключение

```html
<div id="alterlit-finance"></div>
<link rel="stylesheet" href="/assets/finance/finance.css?v=1">
<script type="module" src="/assets/finance/finance.js?v=1"></script>
```
