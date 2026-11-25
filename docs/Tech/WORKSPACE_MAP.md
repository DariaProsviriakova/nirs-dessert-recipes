# Карта репозитория

| Путь | Назначение |
| --- | --- |
| backend/ | HTTP API, аккаунты, сессии, поиск, LLM и аналитика |
| backend/tests/ | Серверные и браузерные тесты |
| backend/.data/ | Локальная рабочая SQLite; Git игнорирует |
| backend/.test-artifacts/ | Отдельные тестовые базы, трассировки и скриншоты; Git игнорирует |
| bm25/ | Готовая часть участницы по RAG, без изменений |
| bm25/data/generated/ | Локально собранные корпус и индекс; Git игнорирует |
| sweetmate-frontend/src/App.tsx | Существующий интерфейс с интеграцией API |
| sweetmate-frontend/src/api.ts | Клиент API |
| sweetmate-frontend/src/AdminPanel.tsx | Агрегированный обзор |
| sweetmate-frontend/public/images/recipe-placeholder.svg | Заглушка отсутствующего фото |
| .env.example | Настройки без секретов |
| .env | Локальные настройки и секреты; Git игнорирует |
| package.json / package-lock.json | Корневые команды и зависимости браузерных тестов |
| playwright.config.mjs | Изолированный браузерный стенд |
| .nvmrc | Node.js 24 |
| docs/ | Product, Service, Tech |
| README.md / STATUS.md / CHANGE_HISTORY.md / AGENTS.md | Вход, статус, история и правила работы |

## Контекстный диалог

backend/dialogue.mjs — сценарии и контекст; backend/recipe-data.mjs — исходные КБЖУ, состав и пересчёт; backend/tests/dialogue.test.mjs — регрессии продолжений.

backend/recipe-memory.mjs и backend/tests/recipe-memory.test.mjs — память блюд всего чата и проверки ссылок.
