# План закрытия MVP — 2026-04-01

## Что уже готово (не трогаем)
- Чат-интерфейс + SSE-стриминг + tool-use индикатор
- Аутентификация + RBAC + admin panel
- Markdown-рендеринг (react-markdown + remark-gfm уже подключены)
- LLM-агент (ReAct loop через Ollama)
- MCP-серверы: document-processor, template-engine
- История диалогов (sidebar + переключение + удаление)
- Docker-инфраструктура

## Что осталось — 4 задачи

### Задача 1. Загрузка файлов (upload)
**Агенты:** backend-developer → frontend-chat-ui → docker-deployer
**Сложность:** L | **Приоритет:** Критический

**Backend:**
- Эндпоинт `POST /api/documents/upload` — принимает multipart/form-data
- Сохранение файла в MinIO (клиент `minio` уже в package.json)
- Извлечение текста: передача файла в MCP `parse_document`
- Запись в таблицу `Document` (модель уже есть в Prisma)

**Frontend:**
- Кнопка прикрепления файла в `ChatInput` (скрепка)
- Preview прикреплённого файла перед отправкой
- Отправка файла вместе с сообщением или отдельно
- Индикатор загрузки

---

### Задача 2. Скачивание сгенерированных документов
**Агенты:** backend-developer → frontend-chat-ui
**Сложность:** M | **Приоритет:** Критический

**Backend:**
- Эндпоинт `GET /api/documents/:id/download` — отдаёт файл из MinIO
- При вызове MCP `generate_docx` / `fill_template` — результат сохраняется в MinIO + запись в `Document`
- В SSE-стрим добавить событие `type: "file"` с `documentId` и `filename`

**Frontend:**
- В `MessageBubble` — рендеринг ссылки на скачивание при наличии файла в ответе
- Кнопка скачивания со стилем (иконка документа + имя файла)

---

### Задача 3. Подсветка синтаксиса кода в markdown
**Агенты:** frontend-chat-ui
**Сложность:** S | **Приоритет:** Средний

- Добавить `rehype-highlight` (или `react-syntax-highlighter`) для блоков кода
- CSS стили для подсветки
- Кнопка «Копировать код»

---

### Задача 4. Базовые шаблоны договоров (2-3 штуки)
**Агенты:** mcp-developer
**Сложность:** M | **Приоритет:** Критический

- Создать шаблоны в MCP template-engine:
  - Договор поставки
  - Договор оказания услуг
  - NDA (соглашение о неразглашении)
- Каждый шаблон с плейсхолдерами (стороны, суммы, сроки, реквизиты)
- Seed-скрипт для заполнения таблицы `Template` в БД

---

## Порядок выполнения

```
Параллельно:
├── [backend-developer] Задача 1 (upload endpoint + MinIO)
├── [mcp-developer]     Задача 4 (шаблоны договоров)
└── [frontend-chat-ui]  Задача 3 (подсветка кода)

Последовательно после Задачи 1:
├── [frontend-chat-ui]  Задача 1 (UI загрузки файлов)
├── [backend-developer] Задача 2 (download endpoint + SSE file event)
└── [frontend-chat-ui]  Задача 2 (UI скачивания файлов)

Финал:
└── [docker-deployer]   Проверка Dockerfile (multer/busboy, размер upload)
```

## Что НЕ входит в MVP (отложено на Фазу 2+)
- BullMQ очереди (зависимость есть, но для MVP обработка синхронная)
- RAG / pgvector embeddings
- Тесты
- CI/CD
