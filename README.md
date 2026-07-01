# RAG-чатбот по данным Kaggle

Проект представляет собой клиент-серверный RAG-чатбот. Он ищет релевантные фрагменты в локально построенном векторном индексе, передает найденный контекст в LLM через Ollama и возвращает ответ с источниками.

## Что внутри

- `apps/frontend` - веб-интерфейс чата на Next.js.
- `apps/backend` - Fastify API, RAG retrieval, вызовы Ollama и хранение истории.
- `packages/shared` - общие Zod-схемы и TypeScript-типы.
- `data/raw/kaggle` - исходные данные Kaggle.
- `data/processed` - сгенерированные `ingestion-manifest.json` и `vector-index.json`.

## Как работает RAG

1. `ingest` читает Kaggle `.arrow` файлы, берет поля `title`, `section`, `text`, фильтрует почти пустые секции и режет текст на чанки.
2. `index` прогоняет чанки через embedding-модель Ollama и сохраняет векторы в `data/processed/vector-index.json`.
3. При вопросе пользователя backend строит embedding самого вопроса.
4. Backend сравнивает embedding вопроса с embedding чанков, выбирает ближайшие фрагменты и передает их в LLM.
5. LLM отвечает по-русски только на основе найденного контекста.

Важно: индекс документов можно построить один раз, но embedding каждого нового вопроса нужен на каждом запросе. Поэтому backend должен иметь доступ к embedding endpoint через `OLLAMA_EMBED_HOST`.

## Требования

- Node.js `>=20.11`
- npm
- Ollama CLI/сервер для embedding-модели
- Kaggle-датасет в `data/raw/kaggle`
- Опционально Docker для PostgreSQL

Для текущей конфигурации используется:

- LLM: `gpt-oss:120b` через `OLLAMA_HOST=https://ollama.com`
- Embeddings: `nomic-embed-text-v2-moe` через `OLLAMA_EMBED_HOST=http://localhost:11434`

## Быстрый старт

1. Установить зависимости:

```bash
npm install
```

2. Создать `.env`:

```powershell
copy .env.example .env
```

3. Настроить `.env`.

Минимально проверь:

```env
OLLAMA_API_KEY=...
OLLAMA_MODEL=gpt-oss:120b
OLLAMA_HOST=https://ollama.com

OLLAMA_EMBED_HOST=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text-v2-moe
OLLAMA_EMBED_DIMENSIONS=768
OLLAMA_EMBED_BATCH_SIZE=32
```

Если локальная Ollama падает при indexing, уменьши:

```env
OLLAMA_EMBED_BATCH_SIZE=8
```

4. Скачать/положить Kaggle данные в:

```text
data/raw/kaggle/
```

Ожидаемая структура:

```text
data/raw/kaggle/
  data-00000-of-00004.arrow
  data-00001-of-00004.arrow
  data-00002-of-00004.arrow
  data-00003-of-00004.arrow
  dataset_info.json
  state.json
```

5. Запустить Ollama локально и убедиться, что embedding-модель есть:

```bash
ollama list
```

Если модели нет:

```bash
ollama pull nomic-embed-text-v2-moe
```

6. Собрать RAG-индекс:

```bash
npm run rag:build
```

По умолчанию берется только `RAG_INGEST_MAX_DOCUMENTS=3000`, чтобы проект быстро запускался. В полном датасете строк намного больше, поэтому увеличение лимита заметно увеличит время indexing и размер индекса.

7. Запустить backend и frontend:

```bash
npm run dev
```

Frontend будет на `http://localhost:3000`, backend на `http://localhost:4000`.

## Переменные окружения

### Backend

- `PORT` - порт backend, по умолчанию `4000`.
- `HOST` - host backend, обычно `0.0.0.0`.
- `DATABASE_URL` - строка подключения PostgreSQL. Если не задана, история хранится в памяти.
- `RAG_INGEST_MAX_DOCUMENTS` - сколько документов брать из датасета при ingestion.
- `RAG_RETRIEVER_TOP_K` - сколько фрагментов отдавать в LLM.
- `RAG_RETRIEVER_MIN_SCORE` - минимальный cosine score для найденных фрагментов.
- `RAG_DEBUG_RETRIEVAL` - `true`, чтобы логировать найденные фрагменты и score.
- `OLLAMA_API_KEY` - API key для Ollama Cloud.
- `OLLAMA_MODEL` - модель генерации ответа, например `gpt-oss:120b`.
- `OLLAMA_HOST` - host генерации, например `https://ollama.com`.
- `OLLAMA_EMBED_HOST` - host embedding-модели.
- `OLLAMA_EMBED_MODEL` - embedding-модель.
- `OLLAMA_EMBED_DIMENSIONS` - размерность embedding-векторов.
- `OLLAMA_EMBED_BATCH_SIZE` - размер batch при построении индекса.

### Frontend

- `NEXT_PUBLIC_API_URL` - URL backend API, например `http://localhost:4000`.

## PostgreSQL для истории

Запустить базу:

```bash
npm run db:up
```

Остановить:

```bash
npm run db:down
```

Логи:

```bash
npm run db:logs
```

Если `DATABASE_URL` задан, backend пишет историю чата в PostgreSQL. Если нет, используется in-memory хранилище, и история пропадает после перезапуска backend.

## Команды разработки

Запуск всего проекта:

```bash
npm run dev
```

Только backend:

```bash
npm run dev:backend
```

Только frontend:

```bash
npm run dev:frontend
```

Сборка RAG-индекса:

```bash
npm run rag:build
```

Проверка типов:

```bash
npm run typecheck
```

Тесты:

```bash
npm run test
```

Lint:

```bash
npm run lint
```

## Частые проблемы

### Ответ выглядит как список найденных источников, а не как ответ модели

Это fallback backend-а. Значит LLM-вызов не сработал или вернул пустой ответ. Проверь:

- `OLLAMA_API_KEY`
- `OLLAMA_HOST`
- `OLLAMA_MODEL`
- логи backend, там будет сообщение `Ollama chat request failed`

### В выдаче попадаются странные короткие источники

Датасет хранит статьи по секциям. Некоторые строки содержат только `title` и `section`, почти без текста. Ingestion фильтрует короткий `text`, но после изменения фильтра надо пересобрать индекс:

```bash
npm run rag:build
```

### Не находится нужная тема

По умолчанию индексируются только первые `3000` документов. Увеличь лимит:

```env
RAG_INGEST_MAX_DOCUMENTS=50000
```

После этого пересобери индекс:

```bash
npm run rag:build
```

Чем больше лимит, тем дольше indexing.

### Indexing идет долго

Это нормально. Ingestion просто читает и режет текст, а indexing прогоняет каждый чанк через нейросетевую embedding-модель.

Если Ollama падает на indexing, уменьши:

```env
OLLAMA_EMBED_BATCH_SIZE=8
```

### На хостинге нет ресурсов для embeddings

Даже при готовом `vector-index.json` backend должен строить embedding каждого нового вопроса. Поэтому на хостинге нужен доступный `OLLAMA_EMBED_HOST`: локальная Ollama, отдельный VPS, домашний сервер или внешний embedding endpoint.

## Что пересобирать и когда

Пересобирай `npm run rag:build`, если изменились:

- данные в `data/raw/kaggle`;
- `RAG_INGEST_MAX_DOCUMENTS`;
- логика ingestion/chunking;
- embedding-модель;
- embedding dimensions.

Не нужно пересобирать индекс, если изменился только frontend или prompt LLM.

## Деплой: Render + GitHub Pages

В репозитории предусмотрена следующая production-схема:

- backend запускается на Render из корневого `Dockerfile` и описан в `render.yaml`;
- frontend собирается в статические файлы и публикуется workflow `.github/workflows/deploy-pages.yml`;
- LLM и embedding-модель вызываются по удаленным Ollama API;
- готовый `data/processed/vector-index.json` копируется прямо в Docker-образ.

### 1. Подготовить индекс

Индекс не строится на Render: это долго и требует embedding-модель. Построй его локально:

```bash
npm run rag:build
```

Каталог `data/processed` не исключен из Git, поэтому готовый индекс попадет в репозиторий и затем в Docker-образ. Текущий файл около 85 МБ и укладывается в ограничение GitHub 100 МБ на один файл, но при заметном росте индекса понадобится Git LFS или объектное хранилище.

Даже с готовым индексом embedding нового вопроса вычисляется при каждом запросе. Поэтому `OLLAMA_EMBED_HOST` на Render не может быть `localhost`: нужен удаленный Ollama endpoint, на котором доступна та же `OLLAMA_EMBED_MODEL`, что использовалась при построении индекса. Размерность также должна совпадать.

Ollama Cloud и локальная библиотека Ollama имеют разные наборы доступных моделей. Наличие модели в `ollama pull` не означает, что она доступна через `https://ollama.com`. Перед деплоем проверь список cloud-моделей:

```bash
curl https://ollama.com/api/tags \
  -H "Authorization: Bearer $OLLAMA_API_KEY"
```

На момент подготовки конфигурации `nomic-embed-text-v2-moe` не была доступна в cloud-списке проекта. Практические варианты: поднять Ollama с этой моделью на отдельной доступной машине/VPS либо выбрать внешний embedding-сервис и пересобрать индекс той же моделью. Render нельзя настраивать на `OLLAMA_EMBED_HOST=http://localhost:11434`, если Ollama не запущена внутри того же контейнера.

### 2. Развернуть backend на Render

1. В Render выбери **New > Blueprint** и подключи репозиторий.
2. Render прочитает `render.yaml` и соберет `Dockerfile`.
3. Заполни переменные с `sync: false`: Ollama host/model и API keys.
4. Дождись успешной проверки `/health` и скопируй URL вида `https://rksp-rag-backend.onrender.com`.

Секреты не передаются в Docker build и не хранятся в Git. Если `DATABASE_URL` не задан, история чата хранится в памяти и исчезает при перезапуске бесплатного instance.

### 3. Развернуть frontend на GitHub Pages

1. В GitHub открой **Settings > Secrets and variables > Actions > Variables**.
2. Создай переменную `RENDER_API_URL` со значением публичного URL backend без завершающего `/`.
3. В **Settings > Pages > Build and deployment** выбери источник **GitHub Actions**.
4. Запусти workflow `Deploy frontend to GitHub Pages` или отправь commit в `main`.

Для этого репозитория frontend будет доступен по адресу `https://defridwamn.github.io/rkspKusrach/`. Разрешенный origin уже указан в `render.yaml` через `CORS_ORIGINS`.

### Обязательная конфигурация Ollama

В коде нет запасных значений для Ollama host/model. Backend завершит запуск с понятной ошибкой, если отсутствуют `OLLAMA_HOST` или `OLLAMA_MODEL`; embedding-вызовы требуют `OLLAMA_EMBED_HOST`, `OLLAMA_EMBED_MODEL`, `OLLAMA_EMBED_DIMENSIONS` и `OLLAMA_EMBED_BATCH_SIZE`. Локальные значения перечислены в `.env.example`, production-значения задаются в Render.
