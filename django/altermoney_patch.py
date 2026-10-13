# Страница /finance/ — остров React (как чат и блок пользователя). Бэкенду нужна одна ручка:
#
#   GET /api/v1/altermoney/transactions/?currency=lits&from=2026-01-01&to=2026-10-13&offset=0&limit=30
#
#       currency — lits (Transaction) | books (TransactionBooks), по умолчанию lits;
#       from, to — даты YYYY-MM-DD включительно, любую можно не указывать;
#       offset, limit — страница (limit 1…100, по умолчанию 30). Новые сверху.
#
#   → {"objects": [{"id": 17150, "currency": "lits", "amount": 5.0, "reason": 1,
#                   "reason_label": "Операция Администратора", "comment": "test 2",
#                   "date": "2026-10-13T16:19:00", "post": null}, …],
#      "more": true, "offset": 0,
#      "summary": {"income": 1180.0, "outcome": 1050.0, "count": 26}}
#
#       summary — за весь выбранный период и валюту (не за страницу); только при offset=0.
#       post — {"id", "title", "url"} для списаний за публикацию (Transaction.for_post), иначе null.
#   Ошибки параметров — 400 {"detail": "…"}, аноним — 403.
#
# Живое обновление страницы — через события transaction/balance личного потока
# (balance_patch.py из userbar): страница слушает их через блок пользователя.
# Поэтому событие transaction теперь собирается тем же сериализатором, что и список (п. 4).
#
# Страницу /finance/ в Django оставляем (п. 5) — меняем только шаблон.


# ── 1. api/altermoney/serializers.py (новое приложение api.altermoney) ─────────────
from rest_framework import serializers

from altermoney.models import TransactionBooks


class TransactionSerializer(serializers.Serializer):
    """Транзакция в литах (Transaction) или буках (TransactionBooks) — общий вид."""
    id = serializers.IntegerField()
    currency = serializers.SerializerMethodField()
    amount = serializers.FloatField()  # Decimal → число, как у /api/v1/users/balance/
    reason = serializers.IntegerField()
    reason_label = serializers.CharField(source='get_reason_display')
    comment = serializers.CharField(allow_null=True)
    date = serializers.DateTimeField()
    post = serializers.SerializerMethodField()

    def get_currency(self, obj):
        return 'books' if isinstance(obj, TransactionBooks) else 'lits'

    def get_post(self, obj):
        post = getattr(obj, 'for_post', None)  # у TransactionBooks поля нет
        if post is None:
            return None
        # ПРОВЕРЬТЕ: имя поля заголовка у blog.Post и наличие get_absolute_url
        return {
            'id': post.pk,
            'title': getattr(post, 'title', None) or str(post),
            'url': post.get_absolute_url() if hasattr(post, 'get_absolute_url') else None,
        }


# ── 2. api/altermoney/views.py ─────────────────────────────────────────────────
from decimal import Decimal

from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils.dateparse import parse_date
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from altermoney.models import Transaction, TransactionBooks
from api.altermoney.serializers import TransactionSerializer

MODELS = {'lits': Transaction, 'books': TransactionBooks}
DEFAULT_LIMIT = 30
MAX_LIMIT = 100


def _sum(condition):
    return Coalesce(Sum('amount', filter=condition), Value(Decimal(0)),
                    output_field=DecimalField(max_digits=22, decimal_places=6))


class TransactionList(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        model = MODELS.get(params.get('currency', 'lits'))
        if model is None:
            return Response({'detail': 'currency: lits или books'}, status=400)
        try:
            offset = int(params.get('offset', 0))
            limit = int(params.get('limit', DEFAULT_LIMIT))
        except ValueError:
            return Response({'detail': 'offset и limit — целые числа'}, status=400)
        if offset < 0 or not 1 <= limit <= MAX_LIMIT:
            return Response({'detail': f'offset ≥ 0, limit от 1 до {MAX_LIMIT}'}, status=400)

        dates = {}
        for key in ('from', 'to'):
            raw = params.get(key)
            if not raw:
                continue
            try:
                dates[key] = parse_date(raw)
            except ValueError:  # формат верный, а даты нет: 2026-02-30
                dates[key] = None
            if dates[key] is None:
                return Response({'detail': f'{key}: дата в формате ГГГГ-ММ-ДД'}, status=400)
        if 'from' in dates and 'to' in dates and dates['from'] > dates['to']:
            return Response({'detail': 'from позже to'}, status=400)

        qs = model.objects.filter(user=request.user)
        # __date — календарный день в часовом поясе сайта, границы включительно
        if 'from' in dates:
            qs = qs.filter(date__date__gte=dates['from'])
        if 'to' in dates:
            qs = qs.filter(date__date__lte=dates['to'])

        page_qs = qs.order_by('-date', '-id')
        if model is Transaction:
            page_qs = page_qs.select_related('for_post')
        page = list(page_qs[offset:offset + limit + 1])

        data = {
            'objects': TransactionSerializer(page[:limit], many=True).data,
            'more': len(page) > limit,
            'offset': offset,
        }
        if offset == 0:
            totals = qs.aggregate(income=_sum(Q(amount__gt=0)), outcome=_sum(Q(amount__lt=0)), count=Count('pk'))
            data['summary'] = {
                'income': float(totals['income']),
                'outcome': float(-totals['outcome']),  # положительное число: сколько списано
                'count': totals['count'],
            }
        return Response(data)


# ── 3. api/urls.py (общий файл API, /api/v1/…) ───────────────────────────
#     from api.altermoney import views as altermoney_views
#     path('altermoney/transactions/', altermoney_views.TransactionList.as_view(), name='altermoney-transactions'),
#
# В INSTALLED_APPS api.altermoney добавлять не нужно (моделей нет). А если добавляете —
# только с AppConfig(label='api_altermoney'): метка по умолчанию «altermoney» совпадёт
# с приложением altermoney, и Django не запустится.


# ── 4. altermoney/events.py — событие transaction тем же сериализатором ─────
# Заменить transaction_to_json целиком (для live-вставки на странице нужен post):
def transaction_to_json(t):
    from api.altermoney.serializers import TransactionSerializer  # избегаем цикличного импорта
    return dict(TransactionSerializer(t).data)  # ReturnDict → обычный dict для слоя каналов


# ── 5. Шаблон страницы /finance/ ─────────────────────────────────────────────
# Вьюху страницы оставить (только для авторизованных, как сейчас), весь
# <section id="finance">…</section>, его <style> и <script> с кнопками — заменить на:
#
#     <div id="alterlit-finance"></div>
#
# и подключить сборку (в блоке стилей и скриптов страницы):
#
#     <link rel="stylesheet" href="/assets/finance/finance.css?v=1">
#     <script type="module" src="/assets/finance/finance.js?v=1"></script>
#
# Запрос транзакций — из БД, без контекста шаблона: вьюха может больше ничего не передавать.
