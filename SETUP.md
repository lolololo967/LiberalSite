# LIBERAL GROUP — Setup Guide
## GitHub + Vercel + Supabase

---

## Структура файлов

```
liberal-group/
├── index.html          ← главная страница
├── api/
│   ├── auth.js         ← вход администратора
│   └── cards.js        ← CRUD карточек
├── vercel.json         ← конфигурация Vercel
└── img/
    ├── Icon.png        ← иконка сайта
    └── Title.png       ← логотип заголовка
```

---

## ШАГ 1 — Supabase (база данных)

1. Зайди на **https://supabase.com** → Sign Up (или войди)
2. Нажми **New Project**, выбери регион, придумай пароль БД
3. Подожди ~2 минуты пока проект создаётся
4. Зайди в **SQL Editor** (слева) и выполни этот SQL:

```sql
-- Создание таблицы карточек
CREATE TABLE cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  section TEXT NOT NULL CHECK (section IN ('elections', 'referendums', 'voting')),
  election_category TEXT CHECK (election_category IN ('presidential', 'parliamentary')),
  title TEXT NOT NULL,
  date DATE NOT NULL,
  text TEXT,
  options JSONB DEFAULT '[]'::jsonb,
  total_votes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Включить безопасность строк
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

-- Разрешить всем читать карточки (публичный сайт)
CREATE POLICY "allow_public_read" ON cards
  FOR SELECT USING (true);
```

5. Зайди в **Settings → API**:
   - Скопируй **Project URL** (например: `https://abcxyz.supabase.co`)
   - Скопируй **service_role** key (секретный, длинный ключ)

---

## ШАГ 2 — GitHub

1. Зайди на **https://github.com** → New Repository
2. Назови: `liberal-group` (или любое другое)
3. Выбери **Public** или **Private**
4. Загрузи все файлы из папки `liberal-group/`:
   - Через браузер: **Add file → Upload files**
   - Или через командную строку:
     ```bash
     git init
     git add .
     git commit -m "Initial commit"
     git remote add origin https://github.com/ВАШ_НИКНЕЙМ/liberal-group.git
     git push -u origin main
     ```

---

## ШАГ 3 — Vercel (хостинг)

1. Зайди на **https://vercel.com** → Sign Up with GitHub
2. Нажми **New Project** → Import из GitHub → выбери репозиторий `liberal-group`
3. Нажми **Deploy** (подожди ~1 минуту)
4. После деплоя зайди в **Settings → Environment Variables** и добавь:

| Название | Значение |
|----------|----------|
| `ADMIN_PASSWORD` | Придумай надёжный пароль (например: `MyPass2024!`) |
| `TOKEN_SECRET` | Случайная строка (например: `abc123xyz789secretkey`) |
| `SUPABASE_URL` | URL из Supabase (например: `https://abcxyz.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | service_role key из Supabase |

5. После добавления переменных нажми **Redeploy** (Deployments → три точки → Redeploy)

---

## ШАГ 4 — Готово!

Твой сайт будет доступен по адресу: `https://liberal-group.vercel.app`

### Как пользоваться:

**Войти как администратор:**
1. Нажми кнопку **ADMIN** в правом верхнем углу
2. Введи пароль из `ADMIN_PASSWORD`

**Создать карточку:**
1. Войди как администратор
2. Выбери раздел (Выборы / Референдумы / Голосования)
3. Заполни форму: заголовок, дата, описание
4. Добавь варианты ответов (кнопка "+ ДОБАВИТЬ ВАРИАНТ")
5. Нажми **СОХРАНИТЬ КАРТОЧКУ**

**Изменить карточку:**
- Нажми **ИЗМЕНИТЬ** рядом с карточкой в списке

**Удалить карточку:**
- Нажми **УДАЛИТЬ** — появится подтверждение

**Открыть карточку подробнее:**
- На сайте кликни на любую карточку → откроется модальное окно

---

## Обновление сайта

Любые изменения в файлах на GitHub автоматически деплоятся на Vercel.

---

## Структура карточки

```
Заголовок: "Президентские выборы март 2024"
Дата: 2024-03-17
Описание: "Первые официальные президентские выборы группы"

Вариант 1:
  Название: Timofey
  Что означает: Победитель, набрал большинство
  Процент: 62.5%
  Голосов: 125

Вариант 2:
  Название: Кандидат Б
  Что означает: Оппозиция
  Процент: 37.5%
  Голосов: 75

Всего проголосовало: 200
```
