# Источники

| Источник | Что подтверждает | Сверено | Примечание |
| --- | --- | --- | --- |
| [Povarenok recipes detail](https://huggingface.co/datasets/d0rj/povarenok_recipes_detail) | Исходные Parquet корпуса | 2026-11-26 | Автоматический отбор не равен ручной проверке рецептов |
| bm25/scripts/ и bm25/src/ | Загрузка, нормализация, индекс, запросы и benchmark полного корпуса | 2026-11-26 | Ручная разметка — bm25/data/manual-benchmark-queries.json |
| bm25/data/course-benchmark.json и course-benchmark-results.json | Учебный срез D01–D30, 15 вопросов, gold ID и результаты | 2026-11-28 | Answer Accuracy оценивает карточки; свободный текст проверяется вручную |
| backend/ | API, SQLite, авторизация, события, BM25 и LLM | 2026-11-28 | Источник текущего серверного поведения |
| sweetmate-frontend/src/ | Интерфейс, API-клиент, чаты и избранное | 2026-11-28 | Чаты и избранное остаются в браузере; пустые выдачи и ошибки показываются в интерфейсе |
| sweetmate-frontend/public/images/ | Статические изображения и заглушка | 2026-11-26 | Фото рецептов загружаются по URL; права требуют проверки |
| package.json и lock-файлы | Скрипты и версии зависимостей | 2026-11-26 | BM25 имеет отдельный package-lock.json |

Product-страницы в основном отражают исходную постановку со статусами на 2026-10-15; требования к качеству benchmark дополнены 2026-11-28. Текущее состояние кода смотри в [STATUS.md](../../STATUS.md) и [Tech](../Tech/README.md).

Структура разделов сверялась с [примером Service verification](https://github.com/rowapepe/minecraft-mod-picker/blob/main/docs/Service/verification.md) и [примером Tech](https://github.com/rowapepe/minecraft-mod-picker/tree/main/docs/Tech); содержимое проекта Minecraft не переносилось.
