# Установка и запуск

Требуется Node.js 24 или новее, npm и интернет для первого скачивания корпуса.

## Первичная подготовка

В корне репозитория выполни:

    npm ci
    npm run prepare:data

Команда скачивает Parquet с Hugging Face, формирует корпус и индекс в bm25/data. Эти локальные данные исключены из Git. .env не нужен для BM25-поиска; для GigaChat скопируй .env.example в .env и задай LLM_PROVIDER и свой LLM_API_KEY.

## Разработка

Открой два терминала в корне репозитория. В первом запусти backend:

    npm run dev

Во втором запусти Vite:

    npm --prefix sweetmate-frontend ci
    npm --prefix sweetmate-frontend run dev

Открой адрес Vite, обычно http://localhost:5173. Vite проксирует /api на http://127.0.0.1:8000.

## Собранный запуск

    npm run build
    npm start

Сборка создаётся в sweetmate-frontend/dist; сервер доступен на http://localhost:8000. Индекс BM25 должен быть подготовлен заранее.

## Команды проверок

    npm test
    npm run test:e2e
    npm run build

Смотри [протокол](../Service/verification.md), чтобы узнать, запускались ли они фактически.
