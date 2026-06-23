import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FOOTBALL_TOKEN = process.env.FOOTBALL_API_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;

// How long (seconds) we reuse the provider's response. This protects the free
// tier rate limit: no matter how many people open the site at once, the
// football API is actually hit at most once per window.
const CACHE_SECONDS = 60;

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
};

function norm(s) {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function canon(s) {
  const n = norm(s);
  return ALIASES[n] || n;
}

// Order-independent key for a pair of teams.
function pairKey(a, b) {
  return [canon(a), canon(b)].sort().join("|");
}

async function handle(req) {
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") || "";
  const secret = url.searchParams.get("secret");
  const debug = url.searchParams.get("debug") === "1";
  // A correct secret (cron Bearer header or ?secret=) unlocks "force": bypass
  // the cache for an instant manual refresh. The endpoint is otherwise public
  // so the website can trigger it on load WITHOUT shipping the secret to the
  // browser. Syncing is idempotent and only ever writes official results.
  const privileged =
    !!CRON_SECRET &&
    (auth === `Bearer ${CRON_SECRET}` || secret === CRON_SECRET);
  const force = privileged && url.searchParams.get("force") === "1";

  if (!SUPABASE_URL || !SERVICE_KEY || !FOOTBALL_TOKEN) {
    return Response.json(
      {
        error:
          "Missing env vars: need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY, FOOTBALL_API_TOKEN",
      },
      { status: 500 },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Our fixtures that may need a result.
  const { data: rows, error: dbErr } = await supabase
    .from("matches")
    .select("id, home, away, result");
  if (dbErr) return Response.json({ error: dbErr.message }, { status: 500 });

  // Finished World Cup matches from the provider. The response is cached for
  // CACHE_SECONDS (shared across all visitors) unless ?force=1 is used.
  const res = await fetch(
    "https://api.football-data.org/v4/competitions/WC/matches",
    {
      headers: { "X-Auth-Token": FOOTBALL_TOKEN },
      ...(force
        ? { cache: "no-store" }
        : { next: { revalidate: CACHE_SECONDS } }),
    },
  );
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    return Response.json(
      { error: `Football API returned ${res.status}`, detail },
      { status: 502 },
    );
  }
  const payload = await res.json();
  const finished = (payload.matches || []).filter(
    (m) => m.status === "FINISHED" && m.score && m.score.winner,
  );

  // Index provider results by an ORDER-INDEPENDENT pair key, remembering which
  // team won so we can translate to OUR fixture's home/away orientation even
  // when the provider lists the teams in the opposite order.
  const byPair = new Map();
  const finishedPairs = [];
  for (const m of finished) {
    const home = m.homeTeam && m.homeTeam.name;
    const away = m.awayTeam && m.awayTeam.name;
    const w = m.score.winner; // HOME_TEAM | AWAY_TEAM | DRAW
    const winnerCanon =
      w === "HOME_TEAM"
        ? canon(home)
        : w === "AWAY_TEAM"
          ? canon(away)
          : "draw";
    byPair.set(pairKey(home, away), winnerCanon);
    finishedPairs.push({ home, away, winner: w });
  }

  const updates = [];
  const unmatched = [];
  for (const r of rows || []) {
    const winnerCanon = byPair.get(pairKey(r.home, r.away));
    if (winnerCanon === undefined) continue;
    const result =
      winnerCanon === "draw"
        ? "draw"
        : winnerCanon === canon(r.home)
          ? "home"
          : "away";
    if (r.result !== result)
      updates.push({ id: r.id, home: r.home, away: r.away, result });
  }

  if (debug) {
    const ourKeys = new Set((rows || []).map((r) => pairKey(r.home, r.away)));
    for (const fp of finishedPairs) {
      if (!ourKeys.has(pairKey(fp.home, fp.away))) unmatched.push(fp);
    }
  }

  let updated = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from("matches")
      .update({ result: u.result })
      .eq("id", u.id);
    if (!error) updated++;
  }

  return Response.json({
    ok: true,
    checked: (rows || []).length,
    finishedFromApi: finished.length,
    updated,
    changes: updates,
    ...(debug ? { finishedPairs, unmatchedFromApi: unmatched } : {}),
  });
}

export async function GET(req) {
  return handle(req);
}
export async function POST(req) {
  return handle(req);
}
