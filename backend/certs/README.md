# Сертификат GigaChat

russian_trusted_root_ca.pem — публичный корневой сертификат Russian Trusted Root CA.
Источник: https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt
Документация: https://developers.sber.ru/docs/ru/gigachat/certificates

Загружен с проверкой HTTPS 2026-11-25.
SHA-256: D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31
Действителен до 2032-02-27.

backend/transport.mjs добавляет его только в TLS-клиент LLM через LLM_CA_FILE.
Системное и браузерное хранилище доверия не меняются. Проверка сертификатов не отключается.
Файл публичный и не содержит API-ключей или закрытых ключей.

Переводы строк PEM нормализованы в LF; DER-содержимое и отпечаток сертификата не изменены.
