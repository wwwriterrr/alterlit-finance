import type { Currency } from './api';

let site = '';

export function configureLinks(prefix: string) {
  site = prefix.replace(/\/$/, '');
}

/** Ссылка на страницу сайта (в dev — на боевой сайт через data-site). */
export const siteUrl = (path: string) => (path.startsWith('/') ? site + path : path);

export const links = {
  pay: (currency: Currency) => siteUrl(`/pay/?currency=${currency}`),
};
