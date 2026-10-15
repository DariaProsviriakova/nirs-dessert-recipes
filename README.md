# NIRS: рецепты десертов

NIRS Dessert Recipes — учебный проект сайта SweetMate с чатом для подбора и просмотра рецептов. Сейчас в репозитории находится frontend-прототип; его текущее состояние и ограничения записаны в [STATUS.md](STATUS.md).

## Команда

| Участник | Зона ответственности |
| --- | --- |
| Просвирякова Дарья | Продукт и интерфейс: задача, сценарии, документация Product, макет и внешний вид |
| Якубова Динара | Интеграция: связь интерфейса, поиска и вызова LLM |
| Маргорина Ирина | RAG: корпус, индекс BM25, поиск и benchmark |

Роли описывают распределение работы. Интеграция и RAG в прототип пока не включены.

## Структура проекта

```text
nirs-dessert-recipes/
|-- README.md
|-- AGENTS.md
|-- STATUS.md
|-- CHANGE_HISTORY.md
|-- docs/
|   |-- README.md
|   `-- Product/
|       |-- README.md
|       |-- 01-context.md
|       |-- 02-users-and-scenarios.md
|       |-- 03-requirements.md
|       |-- 04-interface-and-behavior.md
|       `-- 05-rules-and-data-meaning.md
`-- sweetmate-frontend/
    |-- index.html
    |-- package.json
    |-- package-lock.json
    |-- vite.config.ts
    |-- tsconfig.json
    |-- public/images/
    `-- src/
        |-- main.tsx
        |-- App.tsx
        `-- styles.css
```

## Запуск

Нужны Node.js и npm.

```bash
cd sweetmate-frontend
npm install
npm run dev
```

Сборка для проверки: `npm run build` из каталога `sweetmate-frontend`.

## Документы

- [Product-документация](docs/Product/README.md) — назначение раздела и ссылки на отдельные документы.
- [Карта документации](docs/README.md) — вход в Product-раздел.
- [Статус проекта](STATUS.md) — что реализовано и какие ограничения проверены.
- [Правила работы](AGENTS.md) — порядок изменения кода и документации.
- [История изменений](CHANGE_HISTORY.md) — записи по датам.
