# API и доступ

Все ответы — JSON, кроме 204. Ошибка: { "message": "понятный текст" } без трассировки.
Для изменяющих запросов обязательны Content-Type: application/json и X-SweetMate-Request: 1.
Origin, если передан, должен входить в APP_ORIGINS. CORS для чужих сайтов не открывается.
Сессия — HttpOnly cookie sweetmate_session, SameSite=Lax, срок 7 дней по умолчанию.

| Метод | Доступ | Вход / ответ |
| --- | --- | --- |
| GET /api/health | Все | status, search, catalogSize, llm |
| POST /api/auth/register | Все | email, password, confirmPassword → Account, 201 и cookie |
| POST /api/auth/login | Все | email, password → Account, 200 и cookie |
| GET /api/auth/me | Вошедший | Account |
| POST /api/auth/logout | Все | 204, отзыв текущей сессии и очистка cookie |
| PATCH /api/profile | Вошедший | displayName → Account |
| POST /api/profile/password | Вошедший | currentPassword, newPassword, confirmPassword → 204; прочие сессии отзываются |
| DELETE /api/profile | Вошедший | 204; удаление только своего аккаунта |
| POST /api/search | Вошедший | query, context?, history? → SearchResponse |
| GET /api/recipes/:id | Вошедший | Recipe из корпуса |
| GET /api/recipes/popular | Вошедший | До четырёх Recipe по попаданиям за период ANALYTICS_DAYS |
| GET /api/admin/stats | Только admin | Агрегаты requests, byDay, noResults, popular, catalogSize, period, services |

Account: id, email, displayName, role. Хеш пароля не возвращается.
Регистрация всегда создаёт user, поле role от клиента игнорируется. Администратор создаётся настройками сервера, не специальным email в браузере.
Гость видит только статический демонстрационный пример. Администратор может вернуться к своему чату; доступ к чужим чатам и профилям не предоставляется.

SearchResponse: queryId, status (found / exact / empty / clarification), recipes (0–3), recipeDetail (одна запись или null), answer, llmStatus, action, context, nutrition.
Состояния llmStatus: ok, not_configured, unavailable, insufficient_data, invalid_response, not_needed.
Для числовых сценариев LLM не вызывается (not_needed). Для прочих сценариев, включая уточнения/пустую выдачу, возможно разговорное пояснение. При exact полный рецепт строится из записи корпуса.
Балл BM25 наружу не отдаётся.

Вопрос: 1–500 Unicode-символов, не только пробелы. Имя: 1–32 символа. Пароль: 6–128 символов.
Коды: 400 — валидация, 401 — нет сессии/неверный вход, 403 — чужая роль/Origin, 404 — нет записи,
409 — повторный email, 413 — тело более 16 КиБ для обычных маршрутов или 1 МиБ для /api/search, 415 — неверный Content-Type, 429 — частые попытки, 500 — ошибка сервиса.

Принятый вопрос учитывается один раз на один POST /api/search, включая ошибку поиска. Повторная ручная отправка — отдельный вопрос.
Пустые и некорректные вопросы, открытие карточки и популярного рецепта событие не создают.
Популярность — число уникальных попаданий recipeId в выдачу, не лайки и не старые демо-счётчики.
Текст вопроса и персональные сведения в административный API не включаются.

Автообновление панели — каждые 10 секунд при активной вкладке и при возвращении на неё.

## Контекст и рецепты

context: version=3, ingredients, excludedIngredients, topic, displayedIds (до 3), selectedRecipeId, servings (1–100), filters, sort, pendingNutritionQuery.
ID не принимаются на доверии: сервер повторно получает источник по каталогу. Клиент сохраняет возвращённый context в сообщении своего чата.
history: до шести сообщений role=user/assistant, text до 400 символов; переписка не сохраняется в серверную аналитику.

action: search, choose, nutrition, calories, servings, chat или clarification.
nutrition: null либо recipeId, title, basis (per100g/perServing/wholeDish), basisLabel, values (четыре показателя или null).
Recipe дополнен ingredientEntries, matchedIngredients, additionalIngredients, originalServings, scaled, portionNote.
Результат nutrition не дублирует карточки: отображает отдельную таблицу для выбранного блюда.
Карточки выбирает сервер, свободный текст модели не меняет их ID и не определяет популярность.

## Уточнение КБЖУ без нового поиска

«Сколько калорий?» в текущем чате не запускает подбор по слову «калорий» и не добавляет карточки.
При нескольких показанных блюдах ответ уточняет выбор. «У первого» продолжает этот вопрос, в том числе после перезагрузки.
Контекст содержит pendingNutritionRequest для ожидающего уточнения.
Случайный латинский ввод без распознанного названия даёт уточнение без повторения прошлой выдачи.

## Обсуждение рецепта

action дополнен discuss. Ответ содержит текст и context; recipes=[], recipeDetail=null.
Для выбора блюда используется прежний selectedRecipeId, при уточнении context.pendingRecipeQuestion хранит исходный вопрос.
Внешней модели передаётся discussion с исходным вопросом, типом, выбранным рецептом и известными фактами.
Для portion_size передаются порции, portionWeightGrams=null и явное отсутствие массы; КБЖУ не используются для вывода массы.

## Память рецептов

context дополнен knownRecipeIds (все уникальные рецепты чата) и recipeGroups (последовательность подборок по 1–3 ID).
Память не обрезается до последних сообщений. Неизвестные ID отбрасываются по серверному каталогу.
Имена и состав из клиента не считаются источником: сведения загружаются сервером по ID.
Для компактной памяти /api/search принимает JSON до 1 МиБ; прочие маршруты сохраняют лимит 16 КиБ.
При превышении лимита запрос явно отклоняется, память не обрезается молча.
discuss с типом cooking_time возвращает время источника без новых карточек.
