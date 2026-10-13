import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Finance from './Finance';
import { configureLinks } from './links';
import { setCsrfFallback } from './api';

// Шаблон /finance/ ставит <div id="alterlit-finance"> (страница только для авторизованных).
// data-site — префикс ссылок на сайт (по умолчанию пусто: тот же домен).
const rootEl = document.getElementById('alterlit-finance');
if (rootEl) {
  configureLinks(rootEl.dataset.site ?? '');
  setCsrfFallback(rootEl.dataset.csrf ?? '');
  createRoot(rootEl).render(
    <StrictMode>
      <Finance />
    </StrictMode>,
  );
}
