# Данные и хранение

## Каталог рецептов

Тип `Recipe` и локальный массив `recipeLibrary` объявлены в `sweetmate-frontend/src/App.tsx`. Запись содержит `id`, `title`, `description`, `image`, `time`, `difficulty`, `tag`, `ingredients`, `steps`, `requestCount` и `aliases`. Изображения находятся в `sweetmate-frontend/public/images/`.

## Модели чата

В `App.tsx` описаны типы:

| Тип | Данные |
| --- | --- |
| `Message` | `id`, `role`, `text`, необязательные `recipes` или `recipeDetail` |
| `Chat` | `id`, `title`, массив `messages` |

Тексты ответа и стартовые диалоги сформированы в клиентском коде; отдельного слоя API или доступа к базе нет.

## Browser storage

| Ключ | Назначение |
| --- | --- |
| `sweetmate:chats` | Чаты, разделённые по нормализованному email |
| `sweetmate:favorites` | Избранное по локальному профилю |
| `sweetmate:requestCounts` | Демонстрационные счётчики рецептов |
| `sweetmate:password` | Демо-пароль в открытом виде |
| `sweetmate:profileName` | Отображаемое имя |
| `sweetmate:user` | Состояние демо-профиля |
| `sweetmate:email` | Email текущего демо-профиля |

`localStorage` принадлежит браузеру и origin: данные не синхронизируются между устройствами, не шифруются приложением и не образуют серверное разделение аккаунтов. Пароль и персональные реальные данные хранить нельзя.

## Каталог BM25 и изображения

Исходные Parquet-файлы находятся в bm25/data/raw/, подготовленный корпус — в bm25/data/generated/dessert-corpus.jsonl, индекс поиска — в bm25/data/generated/bm25-index.json.gz. Эти локальные данные игнорируются Git; после клонирования их можно скачать и подготовить командой npm run prepare:data из корня проекта.

При подготовке корпуса поле main_image_url сохраняется как imageUrl, только если это HTTPS-ссылка на povarenok.ru или www.povarenok.ru. Backend возвращает эту ссылку в поле image; карточки используют её напрямую и переходят на /images/recipe-placeholder.svg, если фото отсутствует или не загрузилось. Изображения не скачиваются локально и не индексируются BM25. Условия использования фотографий остаются открытым вопросом GAP-06.
