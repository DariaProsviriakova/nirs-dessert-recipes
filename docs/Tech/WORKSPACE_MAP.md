# Карта репозитория

| Путь | Назначение |
| --- | --- |
| `README.md` | Назначение проекта, участницы команды, структура и запуск |
| `AGENTS.md` | Правила работы и ограничения проекта |
| `STATUS.md` | Проверенное текущее состояние frontend-прототипа |
| `CHANGE_HISTORY.md` | История изменений документации и проекта |
| `docs/Product/` | Контекст, сценарии, требования, интерфейс и правила продукта |
| `docs/Service/` | Принятые решения, открытые вопросы, источники и протокол проверок |
| `docs/Tech/` | Архитектура, запуск, данные, доступ, проверки и эта карта |
| `sweetmate-frontend/index.html` | HTML entry point; напрямую подключает `/src/App.tsx` |
| `sweetmate-frontend/src/App.tsx` | React-приложение, локальный каталог, поиск и состояния экранов |
| `sweetmate-frontend/src/styles.css` | Стили, адаптивная компоновка и состояния UI |
| `sweetmate-frontend/public/images/` | Локальные изображения прототипа |
| `sweetmate-frontend/package.json` | Зависимости и скрипты npm |
| `sweetmate-frontend/vite.config.ts` | Конфигурация Vite и React-плагина |
| `docker-compose.yml` | Корневая Compose-конфигурация; не является описанием доступного frontend API |

Запуск frontend выполняется из `sweetmate-frontend/`; команды приведены в [02-running.md](02-running.md).
