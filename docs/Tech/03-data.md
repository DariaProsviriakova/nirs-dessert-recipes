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
