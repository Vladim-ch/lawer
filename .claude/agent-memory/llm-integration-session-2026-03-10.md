# LLM Integration Session — 2026-03-10

## Решение
Self-hosted LLM: **Ollama + Qwen2.5-1.5B** (Q4_K_M, ~1.3GB RAM, CPU-only).
Роль: посредник между пользователем (чат) и MCP-серверами (document-processor, template-engine).

## Ограничения сервера
- 2 vCPU, 4GB RAM (2GB свободно), 60GB диск, нет GPU
- Ollama лимитирован: mem_limit 1536m, cpus 1.5

## План реализации (от агента Plan)

10 шагов, выполняем последовательно:

| # | Шаг | Статус |
|---|-----|--------|
| 1 | docker-compose.yml + .env — ollama, ollama-init, volume | DONE |
| 2 | backend/src/config/env.ts — расширить конфиг LLM | TODO |
| 3 | backend/src/config/systemPrompt.ts — системный промпт | TODO |
| 4 | backend/src/services/llmService.ts — клиент Ollama со стримингом | TODO |
| 5 | backend/src/services/mcpClient.ts — MCP stdio клиент | TODO |
| 6 | backend/src/services/agentService.ts — оркестратор ReAct loop | TODO |
| 7 | backend/src/services/messageService.ts — заменить заглушку | TODO |
| 8 | backend/Dockerfile + package.json — MCP в сборку | TODO |
| 9 | (опц.) frontend — индикатор tool-use | TODO |
| 10 | Тестирование и тюнинг | TODO |

## Архитектура

```
Frontend (SSE) → Backend → agentService (ReAct loop) → llmService → Ollama API
                                ↕
                          mcpClient (stdio) → MCP servers
```

- ReAct loop: LLM получает системный промпт с инструментами, отвечает `<tool_call>JSON</tool_call>`, backend парсит, вызывает MCP, возвращает результат LLM, макс 3 итерации
- MCP через `@modelcontextprotocol/sdk` (stdio child_process с пулингом)
- BullMQ очередь с concurrency=1 для последовательной обработки
- SSE-формат не меняется — фронтенд работает без изменений

## Ключевые параметры LLM
- Температура: 0.3 (точность > креативность)
- num_ctx: 2048 (экономия RAM)
- num_predict: 1024 (лимит генерации)
- OLLAMA_KEEP_ALIVE: 5m (выгрузка при простое)
- OLLAMA_NUM_PARALLEL: 1, OLLAMA_MAX_LOADED_MODELS: 1
- LLM_MAX_CONTEXT: 10 сообщений истории

## Шаг 1: Детали (DONE)

### docker-compose.yml
- Добавлен сервис `ollama` (ollama/ollama:latest) с лимитами памяти/CPU
- Добавлен `ollama-init` (curlimages/curl) — одноразовый pull модели
- Volume `ollama_data` для персистентности
- Backend depends_on ollama: service_healthy
- **Fix:** healthcheck изменён с `curl` на `ollama list` (curl отсутствует в образе)

### .env.example
- LLM_PROVIDER=ollama
- OLLAMA_URL=http://ollama:11434
- OLLAMA_MODEL=qwen2.5:1.5b
- LLM_MAX_CONTEXT=10

## Сравнение планов
Запускались два агента: project-manager и Plan (встроенный).
Выбран план от **Plan** — лучше архитектурные решения (BullMQ очередь, OLLAMA_KEEP_ALIVE, cpus limit, init-контейнер).
