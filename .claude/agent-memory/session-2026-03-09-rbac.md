# Сессия 2026-03-09: Контроль доступа и RBAC

## Задача
Пользователь недоволен открытой регистрацией. Нужен полноценный контроль доступа:
- `istadmin` — единственный администратор, только он создаёт новые УЗ
- Ролевая модель: admin, lawyer, viewer (согласно TZ.md §3.1)
- Пароль задаётся при первом входе (mustChangePassword)

## Что сделано

### Backend (все файлы изменены/созданы)

| Файл | Что сделано |
|------|-------------|
| `backend/prisma/schema.prisma` | Добавлено поле `mustChangePassword Boolean @default(true)` к модели User |
| `backend/prisma/seed.ts` | **Новый.** Seed: создаёт `istadmin` (email: `admin@lawer.local`, пароль: `changeme123`, role: admin, mustChangePassword: true). Upsert для идемпотентности |
| `backend/package.json` | Добавлена секция `"prisma": { "seed": "tsx prisma/seed.ts" }` |
| `backend/src/middleware/roleMiddleware.ts` | **Новый.** `requireRole(...roles)` — проверяет `req.user.role`, возвращает 403 |
| `backend/src/services/authService.ts` | Удалён `register`. Login возвращает `mustChangePassword`. Добавлен `changePassword` |
| `backend/src/controllers/authController.ts` | Удалён `register`. Добавлен `changePassword` |
| `backend/src/routes/auth.ts` | Удалён `POST /register`. Добавлен `POST /change-password` (требует auth) |
| `backend/src/services/userService.ts` | **Новый.** CRUD пользователей: list, getById, create, update, delete (защита от удаления себя и последнего админа) |
| `backend/src/controllers/userController.ts` | **Новый.** Контроллер для userService |
| `backend/src/routes/admin.ts` | **Новый.** `GET/POST /api/admin/users`, `GET/PATCH/DELETE /api/admin/users/:id` — всё за `authMiddleware` + `requireRole('admin')` |
| `backend/src/index.ts` | Зарегистрированы admin routes на `/api/admin` |

### Frontend

| Файл | Что сделано |
|------|-------------|
| `frontend/src/stores/authStore.ts` | Убран `register`, добавлены `mustChangePassword` в стейт и `changePassword` метод |
| `frontend/src/app/register/page.tsx` | Заменён на редирект в `/login` |
| `frontend/src/app/login/page.tsx` | Убрана ссылка на регистрацию. После логина: если `mustChangePassword` → `/change-password`, иначе → `/chat` |
| `frontend/src/app/change-password/page.tsx` | **Новый.** Форма смены пароля (текущий + новый + подтверждение), русский UI |
| `frontend/src/app/chat/layout.tsx` | Добавлена проверка `mustChangePassword` → редирект на `/change-password` |
| `frontend/src/app/admin/layout.tsx` | **Новый.** Guard: проверка auth + role === admin |
| `frontend/src/app/admin/users/page.tsx` | **Новый.** Админ-панель: таблица пользователей, создание/редактирование/удаление/сброс пароля |
| `frontend/src/components/Sidebar.tsx` | Ссылка «Управление пользователями» видна только admin |

## API эндпоинты (итоговые)

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| POST | `/api/auth/login` | Нет | Логин, возвращает `mustChangePassword` |
| GET | `/api/auth/profile` | JWT | Профиль текущего пользователя |
| POST | `/api/auth/change-password` | JWT | Смена пароля, сбрасывает `mustChangePassword` |
| GET | `/api/admin/users` | Admin | Список пользователей |
| GET | `/api/admin/users/:id` | Admin | Детали пользователя |
| POST | `/api/admin/users` | Admin | Создание пользователя |
| PATCH | `/api/admin/users/:id` | Admin | Обновление (+ resetPassword) |
| DELETE | `/api/admin/users/:id` | Admin | Удаление пользователя |

## Что НЕ сделано (нужно выполнить в Docker)

1. Миграция Prisma:
   ```bash
   npx prisma migrate dev --name add-must-change-password
   ```
2. Seed базы:
   ```bash
   npx prisma db seed
   ```
3. Пересборка контейнеров (`docker compose up --build`)
4. Аудит-лог действий (запланировано на будущее)
5. Git-коммит изменений не создан
