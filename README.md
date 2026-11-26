# NIRS Dessert Recipes

NIRS Dessert Recipes — учебный проект сайта SweetMate для подбора и просмотра десертов. В репозитории есть React-интерфейс, Node.js API, SQLite-хранилище аккаунтов и событий поиска, BM25-поиск по корпусу Povarenok и необязательная интеграция с GigaChat.

## Команда

| Участник | Зона ответственности |
| --- | --- |
| Просвирякова Дарья | Продукт, сценарии и интерфейс |
| Якубова Динара | Backend, API и интеграция с LLM |
| Маргорина Ирина | Корпус данных, BM25 и benchmark |

## Структура

- backend/ — API, авторизация, SQLite, диалог и LLM.
- bm25/ — загрузка датасета, корпус, индекс, поиск и benchmark.
- sweetmate-frontend/ — React и Vite.
- docs/Product/, docs/Tech/, docs/Service/ — продуктовая, техническая и сервисная документация.

## Запуск

Нужен Node.js 24 или новее и npm. В корне репозитория:

    npm ci
    npm run prepare:data

Команда prepare:data скачивает исходные Parquet-файлы с Hugging Face, собирает корпус и индекс. Эти данные не хранятся в Git; каждому новому клону нужно подготовить их локально.

Для разработки открой два терминала в корне репозитория. В первом запусти backend:

    npm run dev

Во втором запусти интерфейс Vite:

    npm --prefix sweetmate-frontend ci
    npm --prefix sweetmate-frontend run dev

Открой адрес Vite, обычно http://localhost:5173. Запросы /api проксируются на backend на порту 8000. Для собранной версии выполни npm run build, затем npm start; сервер отдаёт её на http://localhost:8000.

Файл .env необязателен для поиска. Чтобы настроить администратора или GigaChat, создай его по примеру .env.example и внеси свои значения. Не добавляй .env или ключи в Git.

## Данные и поиск

Источник — [Povarenok recipes detail](https://huggingface.co/datasets/d0rj/povarenok_recipes_detail). BM25 работает без ключа LLM. GigaChat включается отдельно; без него доступны поиск и структурированные ответы. Фото загружаются по URL источника, если он есть; иначе отображается заглушка.

## Документы и проверки

- [Карта документации](docs/README.md)
- [Текущий статус](STATUS.md)
- [Product](docs/Product/README.md), [Tech](docs/Tech/README.md), [Service](docs/Service/README.md)
- [BM25 и benchmark](bm25/README.md)
- [История изменений](CHANGE_HISTORY.md)

Корневые команды проверок: npm test, npm run test:e2e и npm run build. Команда в package.json не означает, что проверка уже выполнялась; результаты записываются в docs/Service/verification.md.
