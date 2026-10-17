# Запуск и сборка

## Предварительные требования

- Node.js, совместимый с версией Vite в `package-lock.json`.
- npm.

## Установка и запуск

```bash
cd sweetmate-frontend
npm install
npm run dev
```

Vite выводит локальный адрес в терминал. Скрипт разработки запускает `vite --host 0.0.0.0`.

## Проверка production-сборки

```bash
cd sweetmate-frontend
npx tsc --noEmit
npm run build
npm run preview
```

`npm run build` сначала выполняет `tsc --noEmit`, затем собирает frontend посредством Vite в `dist/`. `npm run preview` запускает локальный просмотр собранной версии.

Переменные окружения и backend-сервисы frontend для запуска не требует. Наличие корневого `docker-compose.yml` не означает, что этим прототипом предоставляется API.
