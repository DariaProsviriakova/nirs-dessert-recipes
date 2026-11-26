# Карта репозитория

| Путь | Назначение |
| --- | --- |
| README.md, STATUS.md | Описание проекта и текущий статус |
| AGENTS.md, CHANGE_HISTORY.md | Правила работы и история |
| .env.example, package.json | Пример настройки и корневые команды |
| backend/ | HTTP API, авторизация, SQLite, диалог и LLM |
| backend/tests/ | Backend- и браузерные сценарии |
| bm25/src/ | Токенизация, запросы и ранжирование |
| bm25/scripts/ | Загрузка данных, индекс и benchmark |
| bm25/data/ | Ручная разметка и локальные генерируемые данные |
| sweetmate-frontend/src/ | React, API-клиент и административная панель |
| sweetmate-frontend/public/images/ | Статические изображения и заглушка |
| docs/Product/ | Продуктовая постановка |
| docs/Service/ | Решения, источники и проверки |
| docs/Tech/ | Техническая документация |

Корпус и индекс строятся командой npm run prepare:data и в Git не входят. См. [02-running.md](02-running.md) и [03-data.md](03-data.md).
