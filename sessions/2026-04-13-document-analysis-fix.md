# Сессия 2026-04-13: Починка анализа прикреплённых договоров

## Проблема
При загрузке договора (PDF/DOCX) и запросе «проанализируй» ассистент выдавал шаблонный «пустой» ответ вместо реального анализа содержимого документа.

## Диагностика

Делегировано двум Explore-агентам параллельно: расследование бэкенд-потока и проверка MCP `parse_document`.

### Поток обработки документа
1. `POST /api/documents` (multipart) → `documentController.upload`
2. `documentService.uploadDocument`: загрузка в MinIO, вызов MCP `parse_document`, сохранение `Document.contentText`
3. `POST /api/conversations/:id/stream` с `attachments: [{documentId, filename}]`
4. `messageService.streamResponse`: подгрузка `doc.contentText`, склейка в конец `userMessage`
5. `agentService.runAgent` → Ollama (`qwen2.5:7b`) со стримингом

### Найденные баги

| # | Файл | Проблема |
|---|------|----------|
| 1 | `documentService.ts:46-63` | Ошибка MCP `parse_document` молча проглатывается в `catch` → `contentText = null` |
| 2 | `messageService.ts:74-85` | При `contentText = null` attachment тихо пропускается — LLM не знает, что документ был |
| 3 | `systemPrompt.ts` | Правило #2 утверждает «текст УЖЕ извлечён», правило #8 требует структуру — LLM честно генерит «рыбу» с пустыми полями |
| 4 | `documentService.ts:13` | `.doc` в `FILE_TYPE_MAP`, но MCP-парсер его не поддерживает — всегда fail |
| 5 | `env.ts:54` | `LLM_MAX_CONTEXT = 10` — маловато для длинных договоров |
| 6 | `mcp-document-processor` | RTF читается как UTF-8 (сырые коды вместо текста) — второстепенный баг |

**Главный корень (≈70%):** цепочка (1)→(2)→(3). MCP падает → `null` → пустое сообщение в LLM → шаблонный ответ.

## Исправления

Делегировано `backend-developer`. Коммит `e7a3704 fix(backend): handle document extraction failures in analysis flow`.

### Изменения
- **`backend/src/services/documentService.ts`**
  - Убран `.doc` из `FILE_TYPE_MAP` (отвергается валидацией на входе).
  - Расширена обработка ответа `parse_document`: отдельные warn-логи для `isError`, пустого `parsed.text`, неожиданной формы ответа. Исключения не пробрасываются — загрузка в MinIO проходит, `contentText` остаётся `null`.
- **`backend/src/services/messageService.ts`**
  - Вместо тихого пропуска добавляется явный маркер: `[Прикреплённый документ "filename" (TYPE): текст не удалось извлечь автоматически...]` — LLM теперь знает о проблеме.
  - Для несуществующего документа — `[Документ "filename" недоступен]`.
- **`backend/src/config/systemPrompt.ts`**
  - Правило #2: инструкция про маркер «текст не удалось извлечь» — сообщить пользователю, а не фантазировать.
  - Правило #8: явный запрет на шаблонный анализ с пустыми полями «не указано».
- **`backend/src/config/env.ts`**
  - `LLM_MAX_CONTEXT` дефолт: 10 → 20.

### Статистика
`4 files changed, 36 insertions(+), 8 deletions(-)`

## Что осталось / TODO
- Контекст `num_ctx = 16384` (~12k токенов) всё ещё тесен для очень длинных договоров (30+ страниц). При необходимости — увеличить `LLM_NUM_CTX` или добавить chunking/RAG по прикреплённому документу.
- RTF-парсер: заменить `buffer.toString("utf-8")` в MCP на настоящий RTF-парсер (напр. `rtf-parser` или stripping через regex).
- Компиляцию `npx tsc --noEmit` на хосте прогнать не удалось (нет `node`/`node_modules`); проверить при запуске backend-контейнера.

## Push
`0d31b4b..e7a3704 master -> master` (origin: github.com/Vladim-ch/lawer)
