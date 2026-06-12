# 🏆 World Cup 2026 Predictions

A tiny, mobile-first web app where your group predicts every World Cup match and a
leaderboard tracks the points automatically.

- **Sign in with Google** — one tap, no passwords.
- **Pick Home / Draw / Away** for each match. Picks **lock automatically at kick-off**.
- **Auto-scoring** — 1 point per correct group-stage call, then it grows each round:
  | Stage | Points per correct pick |
  |---|---|
  | Group stage | 1 |
  | Round of 32 | 2 |
  | Round of 16 | 3 |
  | Quarter-final | 4 |
  | Semi-final | 5 |
  | Third-place play-off | 6 |
  | Final | 7 |
- **Admin screen** (you only) to type in each match result. The leaderboard updates instantly.
- All 104 matches are pre-loaded with kick-off times.

Stack: **Next.js** (deploy free on Vercel) + **Supabase** (free Postgres + Google auth).
Total cost: **$0** on free tiers.

---

## How participants use it (the whole experience)

1. You send one link in the WhatsApp group.
2. They open it → tap **Sign in with Google** → pick a display name once.
3. They tap their prediction for each upcoming match. Done. It autosaves.
4. They check the **Leaderboard** tab anytime.

That's the entire flow — no registration forms, no passwords, no app to install.

---

## One-time setup (about 20 minutes)

You'll do this once. Follow it top to bottom.

### 1. Create the database (Supabase)

1. Go to <https://supabase.com> → sign in → **New project**.
2. Pick a name and a strong database password, choose a region near you, click **Create**.
3. When it's ready, open **SQL Editor** → **New query**.
4. Open the file `supabase/schema.sql` from this project, copy **all** of it, paste it in, and click **Run**. This creates the tables, security rules, the auto-scoring leaderboard, and loads all 104 matches.

### 2. Turn on Google login

**a) Create Google OAuth credentials**

1. Go to <https://console.cloud.google.com> → create a project (or use an existing one).
2. **APIs & Services → OAuth consent screen**: choose **External**, fill in app name + your email, save. (You can leave it in "Testing" — just add each participant's Gmail under **Test users**, or click **Publish app** so anyone can sign in.)
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized redirect URIs** → add: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
     (Find `YOUR-PROJECT-REF` in Supabase → **Project Settings → API → Project URL**.)
   - Create, then copy the **Client ID** and **Client secret**.

**b) Enable it in Supabase**

1. Supabase → **Authentication → Providers → Google** → toggle on.
2. Paste the **Client ID** and **Client secret** → **Save**.

### 3. Get your Supabase keys

Supabase → **Project Settings → API**, copy:
- **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 4. Deploy the site (Vercel)

1. Put this project on GitHub (create a repo and push these files), or drag-and-drop import.
2. Go to <https://vercel.com> → **Add New → Project** → import the repo.
3. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon public key
4. Click **Deploy**. You'll get a URL like `https://your-app.vercel.app`.

### 5. Connect the URLs (so login redirects work)

1. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `https://your-app.vercel.app`
   - **Redirect URLs**: add `https://your-app.vercel.app` (and `http://localhost:3000` if you'll run it locally).

### 6. Make yourself the admin

1. Open your deployed site once and **sign in with Google** (this creates your profile).
2. Supabase → **SQL Editor**, run:
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'admin@accudetails.com');
   ```
   (Change the email if you signed in with a different Google account.)
3. Refresh the site — you'll now see the **Admin** tab to enter results.

### 7. Share it

Drop the Vercel link in the WhatsApp group. That's it.

---

## Running it locally (optional)

```bash
npm install
cp .env.local.example .env.local   # then fill in your two Supabase values
npm run dev                        # open http://localhost:3000
```

---

## How scoring works

- Each match stores a `points` value based on its stage (1 → 7 as in the table above).
- When you (admin) set a result, the `get_leaderboard()` function sums, for every player,
  `points` for each match where their pick matches the result. Nothing to calculate by hand.

## Notes

- Knockout fixtures show placeholder names (e.g. "Winner M73") until the bracket is known.
  When teams are confirmed, you can rename them in Supabase → **Table editor → matches**,
  or just leave them — predictions and scoring work either way.
- Kick-off times are stored in UTC; everyone sees them in their own local time.
- Picks lock at kick-off automatically, enforced both in the UI and by database security rules.
