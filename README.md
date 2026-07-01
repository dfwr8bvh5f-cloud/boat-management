# ניהול צי סירות (Charter Yacht Fleet Management)

אפליקציית Next.js לניהול צי סירות שכירות, עם התחברות אמיתית ומאובטחת דרך Supabase Auth ו-Row Level Security (RLS) שאוכף את ההרשאות ישירות במסד הנתונים.

## תפקידים והרשאות

| תפקיד | גישה |
|---|---|
| **ניהול (management)** | רואה ועורך את כל הסירות, המשתמשים והנתונים בצי |
| **קפטן (captain)** | מחובר לסירה אחת, רואה ועורך את כל הנתונים של הסירה שלו בלבד |
| **בעלים (owner)** | מחובר לסירה אחת, רואה רק רשומות **שאושרו** על ידי הניהול בכל מודול שתומך באישור (כרגע: הוצאות) |

ההרשאות אינן רק ברמת ה-UI — הן אוכפות ב-Postgres דרך Row Level Security, כך שגם קריאה ישירה ל-API של Supabase לא תחשוף נתונים שלא מותרים למשתמש.

### זרימת אישור (Approval workflow)

מודול ההוצאות מיישם זרימת אישור אמיתית: רשומה שנוצרת על ידי קפטן מקבלת סטטוס `pending`, רשומה שנוצרת על ידי ניהול מאושרת אוטומטית (`approved`). ניהול יכול לאשר הוצאה ממתינה (כפתור "אשר"). בעלים רואה רק הוצאות מאושרות — האכיפה היא ב-RLS (טבלת `expenses`) ולא רק ב-UI, כולל על תמונות הקבלות ב-Storage. Trigger בשם `prevent_self_approval` חוסם קפטן מלאשר את עצמו גם דרך קריאת API ישירה.

מודולי תחזוקה/הזמנות/מסמכים עדיין לא עברו לזרימת האישור הזו (בעלים רואה בהם הכל, read-only) — זה מתוכנן למודולים הבאים.

## מודולים

לכל סירה: פרטים בסיסיים, תחזוקה, הזמנות/צ'רטרים, מסמכים (ביטוח/רישיון/רישום) עם העלאת קבצים ל-Supabase Storage, ותקציב+הוצאות (עם קטגוריות, תתי-קטגוריות, קבלות מצולמות וזרימת אישור).

## הקמה

### 1. משתני סביבה

העתיקו את `.env.local.example` ל-`.env.local` ומלאו את הפרטים מ-Supabase (Project Settings → API):

```bash
cp .env.local.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`SUPABASE_SERVICE_ROLE_KEY` הוא מפתח סודי בצד השרת בלבד — הוא משמש למסך "משתמשים" כדי ליצור חשבונות קפטן/בעלים חדשים. אל תחשפו אותו ללקוח ואל תעלו אותו ל-git (הוא כבר ב-`.gitignore`).

### 2. הרצת ה-SQL

בפרויקט Supabase שלכם: **SQL Editor** → הריצו **לפי הסדר** את שני הקבצים תחת `supabase/migrations/` (כל אחד בנפרד, כ-query חדש):

1. `0001_init.sql`
2. `0002_expenses_budget.sql`

הקובץ הראשון יוצר:
- טבלאות: `profiles`, `boats`, `maintenance_records`, `bookings`, `documents`
- Enum לתפקידים (`user_role`) וסטטוסים שונים
- Trigger שיוצר שורת `profile` אוטומטית לכל משתמש חדש ב-Auth
- פונקציות עזר (`current_role`, `current_boat_id`) ומדיניות RLS מלאה לפי התפקידים שלמעלה
- Storage bucket פרטי בשם `documents` עם מדיניות גישה תואמת

הקובץ השני (מודול הוצאות ותקציב) מוסיף:
- טבלאות: `expenses`, `budget_categories`, `budget_subcategories`
- Enum לקטגוריות הוצאה, אופן תשלום, מבצע התשלום וסטטוס אישור
- זרימת האישור המתוארת למעלה, כולל ה-trigger שמונע אישור עצמי
- Storage bucket פרטי בשם `receipts` לתמונות קבלות

### 3. יצירת משתמש הניהול הראשון

אין הרשמה עצמאית באפליקציה — משתמשים נוצרים רק דרך מסך "משתמשים" של תפקיד הניהול. כדי ליצור את משתמש הניהול הראשון (chicken-and-egg):

1. ב-Supabase Dashboard → **Authentication → Users → Add user**, צרו משתמש עם אימייל וסיסמה.
2. ב-**SQL Editor** הריצו (מחליפים את האימייל):

```sql
update public.profiles set role = 'management', boat_id = null
where id = (select id from auth.users where email = 'you@example.com');
```

מרגע זה, המשתמש הזה יכול להתחבר לאפליקציה ולנהל את שאר הצוות דרך מסך "משתמשים".

### 4. הרצה מקומית

```bash
npm install
npm run dev
```

האפליקציה תעלה על [http://localhost:3000](http://localhost:3000) ותפנה אוטומטית למסך ההתחברות.

## מבנה טכני

- **Next.js App Router** + Server Actions לכל פעולות הכתיבה (יצירה/עדכון/מחיקה) — אין API routes נפרדים מלבד הורדת מסמכים.
- **`@supabase/ssr`** לניהול session מבוסס-cookies, כולל middleware (`src/middleware.ts`) שמרענן את ה-session ומגן על נתיבים לא מחוברים.
- **RLS כקו ההגנה האמיתי**: קליינט השרת הרגיל (`src/lib/supabase/server.ts`) פועל תמיד בהקשר המשתמש המחובר, כך שגם אם קוד ה-UI מפספס בדיקת הרשאה, מסד הנתונים לא יחזיר או ישנה נתונים אסורים. קליינט ה-service role (`src/lib/supabase/admin.ts`) משמש אך ורק ליצירה/מחיקה של משתמשים ומיובא בצד שרת בלבד.
- כל טבלה משתמשת ב-`type` (לא `interface`) עבור טיפוסי ה-Row/Insert/Update — נדרש כדי שההיסק הגנרי המורכב של `@supabase/supabase-js` לא יקרוס ל-`never`.
