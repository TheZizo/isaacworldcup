import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const FOOTBALL_TOKEN = process.env.FOOTBALL_API_TOKEN
const CRON_SECRET = process.env.CRON_SECRET

// Map the data provider's country names to the names used in our matches table.
// Keys and values are both "normalized" (lowercase, accents/punctuation/spaces removed).
const ALIASES = {
  korearepublic: "southkorea",
  iriran: "iran",
  iranislamicrepublic: "iran",
  unitedstates: "usa",
  unitedstatesofamerica: "usa",
  cotedivoire: "ivorycoast",
  turkiye: "turkey",
  bosniaandherzegovina: "bosniaherzegovina",
  congodr: "drcongo",
  democraticrepublicofthecongo: "drcongo",
  caboverde: "capeverde",
  czechia: "czechrepublic",
}

function norm(s) {
  if (!s) return ""
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function canon(s) {
  const n = norm(s)
  return ALIASES[n] || n
}

async function handle(req) {
  // Allow Vercel Cron (sends "Authorization: Bearer <CRON_SECRET>") or a manual
  // call with ?secret=<CRON_SECRET>. If no CRON_SECRET is set, allow (dev only).
  const auth = req.headers.get("authorization") || ""
  const secret = new URL(req.url).searchParams.get("secret")
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}` && secret !== CRON_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!SUPABASE_URL || !SERVICE_KEY || !FOOTBALL_TOKEN) {
    return Response.json(
      { error: "Missing env vars: need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY, FOOTBALL_API_TOKEN" },
      { status: 500 },
    )
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Our fixtures that may need a result.
  const { data: rows, error: dbErr } = await supabase
    .from("matches")
    .select("id, home, away, result")
  if (dbErr) return Response.json({ error: dbErr.message }, { status: 500 })

  // Finished World Cup matches from the provider.
  const res = await fetch(
    "https://api.football-data.org/v4/competitions/WC/matches",
    { headers: { "X-Auth-Token": FOOTBALL_TOKEN }, cache: "no-store" },
  )
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300)
    return Response.json(
      { error: `Football API returned ${res.status}`, detail },
      { status: 502 },
    )
  }
  const payload = await res.json()
  const finished = (payload.matches || []).filter(
    (m) => m.status === "FINISHED" && m.score && m.score.winner,
  )

  // Index provider results by normalized "home|away" team pair.
  // (Group-stage pairings are unique; knockout rows in our DB still hold
  //  placeholder names so they won't false-match.)
  const byPair = new Map()
  for (const m of finished) {
    const pair = canon(m.homeTeam && m.homeTeam.name) + "|" + canon(m.awayTeam && m.awayTeam.name)
    const winner =
      m.score.winner === "HOME_TEAM" ? "home" : m.score.winner === "AWAY_TEAM" ? "away" : "draw"
    byPair.set(pair, winner)
  }

  const updates = []
  for (const r of rows || []) {
    const winner = byPair.get(canon(r.home) + "|" + canon(r.away))
    if (winner && r.result !== winner) updates.push({ id: r.id, result: winner })
  }

  let updated = 0
  for (const u of updates) {
    const { error } = await supabase.from("matches").update({ result: u.result }).eq("id", u.id)
    if (!error) updated++
  }

  return Response.json({
    ok: true,
    checked: (rows || []).length,
    finishedFromApi: finished.length,
    updated,
    changes: updates,
  })
}

export async function GET(req) {
  return handle(req)
}
export async function POST(req) {
  return handle(req)
}
