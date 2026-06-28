"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const PICKS = [
  ["home", "Home"],
  ["draw", "Draw"],
  ["away", "Away"],
];
// Knockout matches (any stage past the group stage, i.e. points > 1) cannot end
// in a draw, so only Home / Away are offered there.
const KO_PICKS = [
  ["home", "Home"],
  ["away", "Away"],
];
function picksFor(m) {
  return m && m.points > 1 ? KO_PICKS : PICKS;
}

const ROUND_LABEL = {
  1: "Groups",
  2: "Round of 32",
  3: "Round of 16",
  4: "Quarters",
  5: "Semis",
  6: "3rd place",
  7: "Final",
};

const FLAGS = {
  southafrica: "🇿🇦",
  canada: "🇨🇦",
  germany: "🇩🇪",
  paraguay: "🇵🇾",
  netherlands: "🇳🇱",
  morocco: "🇲🇦",
  brazil: "🇧🇷",
  japan: "🇯🇵",
  france: "🇫🇷",
  sweden: "🇸🇪",
  ivorycoast: "🇨🇮",
  cotedivoire: "🇨🇮",
  norway: "🇳🇴",
  mexico: "🇲🇽",
  ecuador: "🇪🇨",
  england: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  drcongo: "🇨🇩",
  congodr: "🇨🇩",
  usa: "🇺🇸",
  unitedstates: "🇺🇸",
  bosniaherzegovina: "🇧🇦",
  bosniaandherzegovina: "🇧🇦",
  belgium: "🇧🇪",
  senegal: "🇸🇳",
  portugal: "🇵🇹",
  croatia: "🇭🇷",
  spain: "🇪🇸",
  austria: "🇦🇹",
  switzerland: "🇨🇭",
  algeria: "🇩🇿",
  argentina: "🇦🇷",
  capeverde: "🇨🇻",
  caboverde: "🇨🇻",
  colombia: "🇨🇴",
  ghana: "🇬🇭",
  australia: "🇦🇺",
  egypt: "🇪🇬",
  uruguay: "🇺🇾",
  southkorea: "🇰🇷",
  korearepublic: "🇰🇷",
  iran: "🇮🇷",
  qatar: "🇶🇦",
  saudiarabia: "🇸🇦",
  tunisia: "🇹🇳",
  nigeria: "🇳🇬",
  cameroon: "🇨🇲",
  denmark: "🇩🇰",
  poland: "🇵🇱",
  serbia: "🇷🇸",
  wales: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  italy: "🇮🇹",
  turkey: "🇹🇷",
  turkiye: "🇹🇷",
  ukraine: "🇺🇦",
  czechrepublic: "🇨🇿",
  czechia: "🇨🇿",
  greece: "🇬🇷",
  romania: "🇷🇴",
  hungary: "🇭🇺",
  peru: "🇵🇪",
  chile: "🇨🇱",
  venezuela: "🇻🇪",
  panama: "🇵🇦",
  costarica: "🇨🇷",
  jamaica: "🇯🇲",
  honduras: "🇭🇳",
  newzealand: "🇳🇿",
  jordan: "🇯🇴",
  uzbekistan: "🇺🇿",
  iraq: "🇮🇶",
  uae: "🇦🇪",
  china: "🇨🇳",
  indonesia: "🇮🇩",
  thailand: "🇹🇭",
  mali: "🇲🇱",
  burkinafaso: "🇧🇫",
  kenya: "🇰🇪",
  zambia: "🇿🇲",
  angola: "🇦🇴",
  guinea: "🇬🇳",
  gabon: "🇬🇦",
  namibia: "🇳🇦",
  benin: "🇧🇯",
  mozambique: "🇲🇿",
  uganda: "🇺🇬",
  tanzania: "🇹🇿",
  slovenia: "🇸🇮",
  slovakia: "🇸🇰",
  finland: "🇫🇮",
  iceland: "🇮🇸",
  ireland: "🇮🇪",
  albania: "🇦🇱",
  georgia: "🇬🇪",
  montenegro: "🇲🇪",
  northmacedonia: "🇲🇰",
  israel: "🇮🇱",
  bolivia: "🇧🇴",
  suriname: "🇸🇷",
  curacao: "🇨🇼",
  haiti: "🇭🇹",
  elsalvador: "🇸🇻",
  guatemala: "🇬🇹",
  trinidadandtobago: "🇹🇹",
  bahrain: "🇧🇭",
  oman: "🇴🇲",
  kuwait: "🇰🇼",
  palestine: "🇵🇸",
  lebanon: "🇱🇧",
  syria: "🇸🇾",
};
function flag(name) {
  if (!name) return "";
  const k = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z]/g, "");
  return FLAGS[k] || "";
}

function optionsFor(m) {
  const o = [{ val: "home", label: m.home, flag: flag(m.home) }];
  if (!(m.points > 1)) o.push({ val: "draw", label: "Draw", flag: "" });
  o.push({ val: "away", label: m.away, flag: flag(m.away) });
  return o;
}

function resultLabel(m) {
  if (!m.result) return "";
  if (m.result === "home") return m.home;
  if (m.result === "away") return m.away;
  return "Draw";
}

function labelFor(v) {
  return v === "home"
    ? "Home"
    : v === "draw"
      ? "Draw"
      : v === "away"
        ? "Away"
        : "";
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function lockInfo(iso, now) {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return { locked: true, soon: false, text: "Locked" };
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const mm = mins % 60;
  let text;
  if (d > 0) text = "Locks in " + d + "d " + h + "h";
  else if (h > 0) text = "Locks in " + h + "h " + mm + "m";
  else text = "Locks in " + mm + "m";
  return { locked: false, soon: mins < 90, text };
}

function initials(name) {
  const parts = (name || "").trim().split(/\s+/);
  const a = parts[0] ? parts[0][0] : "";
  const b = parts[1] ? parts[1][0] : "";
  return (a + b).toUpperCase() || "?";
}
function avatarClass(name) {
  const s = name || "";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return "av" + (h % 6);
}

export default function Home() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("matches");
  const [matches, setMatches] = useState([]);
  const [preds, setPreds] = useState({});
  const [board, setBoard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [msg, setMsg] = useState("");
  const [roster, setRoster] = useState([]);

  // Admin-only state
  const [adminTab, setAdminTab] = useState("results");
  const [players, setPlayers] = useState([]);
  const [adminMatchId, setAdminMatchId] = useState("");
  const [matchVotes, setMatchVotes] = useState({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s),
    );
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      sub.subscription.unsubscribe();
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setLoading(false);
      return;
    }
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function flash(text) {
    setMsg(text);
    setTimeout(() => setMsg(""), 3800);
  }

  async function bootstrap() {
    setLoading(true);
    const prof = await loadProfile();
    if (prof) {
      await Promise.all([loadMatches(), loadPreds(prof), loadBoard()]);
    } else {
      await loadRoster();
    }
    setLoading(false);
    if (prof) triggerSync();
  }

  // Fire-and-forget background sync. The site shows instantly; if a new result
  // lands, the matches + leaderboard refresh a moment later. The endpoint is
  // public and rate-limit-safe (the feed is cached server-side), so it is fine
  // to call on every load.
  async function triggerSync() {
    try {
      const r = await fetch("/api/sync-results", { cache: "no-store" });
      const j = await r.json();
      if (j && j.updated > 0) {
        await loadMatches();
        await loadBoard();
      }
    } catch (_e) {
      /* ignore - syncing is best-effort */
    }
  }

  async function loadProfile() {
    const uid = session.user.id;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("auth_id", uid)
      .maybeSingle();
    setProfile(data || null);
    return data || null;
  }
  async function loadRoster() {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name")
      .is("auth_id", null)
      .order("display_name");
    setRoster(data || []);
  }
  async function claim(pId) {
    const { error } = await supabase.rpc("claim_profile", { p_id: pId });
    if (error) {
      flash(error.message || "Couldn't claim that name.");
      await loadRoster();
      return;
    }
    await bootstrap();
  }
  async function loadMatches() {
    const { data } = await supabase
      .from("matches")
      .select("*")
      .order("kickoff");
    setMatches(data || []);
  }
  async function loadPreds(prof) {
    const p = prof || profile;
    if (!p) return;
    const { data } = await supabase
      .from("predictions")
      .select("*")
      .eq("user_id", p.id);
    const map = {};
    (data || []).forEach((row) => {
      map[row.match_id] = row.pick;
    });
    setPreds(map);
  }
  async function loadBoard() {
    const { data, error } = await supabase.rpc("get_leaderboard");
    if (!error) setBoard(data || []);
  }

  // ---- Admin helpers ----
  async function loadPlayers() {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name")
      .order("display_name");
    setPlayers(data || []);
  }
  async function loadMatchVotes(matchId) {
    if (!matchId) {
      setMatchVotes({});
      return;
    }
    const { data } = await supabase
      .from("predictions")
      .select("user_id, pick")
      .eq("match_id", matchId);
    const map = {};
    (data || []).forEach((r) => {
      map[r.user_id] = r.pick;
    });
    setMatchVotes(map);
  }
  function selectAdminMatch(id) {
    setAdminMatchId(id);
    loadMatchVotes(id);
  }
  async function setPlayerVote(userId, matchId, value) {
    if (value === null) {
      const { error } = await supabase
        .from("predictions")
        .delete()
        .eq("user_id", userId)
        .eq("match_id", matchId);
      if (error) {
        flash("Couldn't clear vote: " + error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from("predictions")
        .upsert(
          { user_id: userId, match_id: matchId, pick: value },
          { onConflict: "user_id,match_id" },
        );
      if (error) {
        flash("Couldn't save vote: " + error.message);
        return;
      }
    }
    await loadMatchVotes(matchId);
    if (profile && userId === profile.id) await loadPreds(profile);
  }

  async function pick(matchId, value) {
    const prev = preds[matchId];
    setPreds((p) => ({ ...p, [matchId]: value }));
    const { error } = await supabase
      .from("predictions")
      .upsert(
        { user_id: profile.id, match_id: matchId, pick: value },
        { onConflict: "user_id,match_id" },
      );
    if (error) {
      setPreds((p) => ({ ...p, [matchId]: prev }));
      flash("Couldn't save - this match may have kicked off already.");
    }
  }

  async function setResult(matchId, value) {
    const { error } = await supabase
      .from("matches")
      .update({ result: value || null })
      .eq("id", matchId);
    if (error) {
      flash("Couldn't set result: " + error.message);
      return;
    }
    await loadMatches();
    await loadBoard();
  }

  function signIn() {
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  }
  function signOut() {
    supabase.auth.signOut();
  }

  if (!session) return <Landing onSignIn={signIn} />;
  if (loading)
    return (
      <div className="center">
        <div className="spinner" />
      </div>
    );
  if (!profile)
    return (
      <Claim
        roster={roster}
        email={session.user.email}
        onClaim={claim}
        onSignOut={signOut}
      />
    );

  const meIdx = board.findIndex((r) => r.user_id === profile.id);
  const meRow = meIdx >= 0 ? board[meIdx] : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brandmark">🏆</span>
          <span className="brandtext">WC Predictions</span>
        </div>
        <div className="user">
          {meRow && (
            <span className="rankchip">
              #{meIdx + 1} · {meRow.points} pts
            </span>
          )}
          <div className={"avatar " + avatarClass(profile.display_name)}>
            {initials(profile.display_name)}
          </div>
          <button className="link" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {msg && <div className="toast">{msg}</div>}

      <main className="content">
        {tab === "matches" && (
          <Matches matches={matches} preds={preds} now={now} onPick={pick} />
        )}
        {tab === "leaderboard" && (
          <Leaderboard board={board} meId={profile.id} />
        )}
        {tab === "admin" && profile.is_admin && (
          <Admin
            matches={matches}
            players={players}
            adminTab={adminTab}
            setAdminTab={setAdminTab}
            onSetResult={setResult}
            adminMatchId={adminMatchId}
            onSelectMatch={selectAdminMatch}
            matchVotes={matchVotes}
            onSetVote={setPlayerVote}
          />
        )}

        <footer className="foot">
          1 point per correct pick in the group stage, then more each round (R32
          = 2, R16 = 3, QF = 4, SF = 5, 3rd = 6, Final = 7). Picks lock at
          kick-off.
        </footer>
      </main>

      <nav className="bottomnav">
        <div className="bottomnav-inner">
          <button
            className={tab === "matches" ? "active" : ""}
            onClick={() => setTab("matches")}
          >
            <span className="ico">⚽</span>
            <span className="lbl">Matches</span>
          </button>
          <button
            className={tab === "leaderboard" ? "active" : ""}
            onClick={() => {
              setTab("leaderboard");
              loadBoard();
            }}
          >
            <span className="ico">🏆</span>
            <span className="lbl">Ranking</span>
          </button>
          {profile.is_admin && (
            <button
              className={tab === "admin" ? "active" : ""}
              onClick={() => {
                setTab("admin");
                loadPlayers();
              }}
            >
              <span className="ico">⚙️</span>
              <span className="lbl">Admin</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}

function Landing({ onSignIn }) {
  return (
    <div className="landing">
      <div className="landing-bg" />
      <div className="hero">
        <div className="logo">🏆</div>
        <h1>
          World Cup 2026
          <br />
          <span className="grad">Predictions League</span>
        </h1>
        <p className="sub">
          Call every match. Earn points for each correct pick — worth more as
          the rounds get bigger. Top the table by the final to win.
        </p>
        <div className="chips">
          <span className="chip">⚽ 104 matches</span>
          <span className="chip">📈 Live leaderboard</span>
          <span className="chip">🔒 Locks at kickoff</span>
        </div>
        <button className="google" onClick={onSignIn}>
          <span className="g">G</span> Continue with Google
        </button>
        <p className="fineprint">Sign in once, then claim your name.</p>
      </div>
    </div>
  );
}

function Claim({ roster, email, onClaim, onSignOut }) {
  return (
    <div className="landing">
      <div className="landing-bg" />
      <div className="hero claim">
        <div className="logo">🏆</div>
        <h1>Claim your name</h1>
        <p className="sub">
          You're signed in as <strong>{email}</strong>. Tap your name below to
          link it to this login — you only do this once.
        </p>
        {!roster.length ? (
          <p className="muted">
            All names are claimed. If yours is missing, ask the admin to add it.
          </p>
        ) : (
          <div className="namecard">
            {roster.map((p) => (
              <button key={p.id} className="row" onClick={() => onClaim(p.id)}>
                <span className={"avatar " + avatarClass(p.display_name)}>
                  {initials(p.display_name)}
                </span>
                <span className="nm">{p.display_name}</span>
                <span className="go">Claim →</span>
              </button>
            ))}
          </div>
        )}
        <button className="link" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function Matches({ matches, preds, now, onPick }) {
  const [round, setRound] = useState(null);
  if (!matches.length) return <div className="empty">No matches yet.</div>;
  const rounds = [...new Set(matches.map((m) => m.points))].sort(
    (a, b) => a - b,
  );
  const upcoming = matches.find((m) => new Date(m.kickoff).getTime() > now);
  const defaultRound = upcoming ? upcoming.points : rounds[rounds.length - 1];
  const active = round != null && rounds.includes(round) ? round : defaultRound;
  const shown = matches.filter((m) => m.points === active);
  const openMatches = shown.filter((m) => new Date(m.kickoff).getTime() > now);
  const predicted = openMatches.filter((m) => preds[m.id]).length;
  const groups = [];
  let last = null;
  shown.forEach((m) => {
    const d = fmtDate(m.kickoff);
    if (d !== last) {
      groups.push({ date: d, items: [] });
      last = d;
    }
    groups[groups.length - 1].items.push(m);
  });
  return (
    <div className="matchespane">
      <div className="roundtabs">
        {rounds.map((r) => (
          <button
            key={r}
            className={active === r ? "active" : ""}
            onClick={() => setRound(r)}
          >
            {ROUND_LABEL[r] || "Stage " + r}
          </button>
        ))}
      </div>
      <div className="roundmeta">
        <span className="roundtitle">{ROUND_LABEL[active] || "Stage"}</span>
        {openMatches.length > 0 && (
          <span
            className={
              "progress" + (predicted === openMatches.length ? " done" : "")
            }
          >
            {predicted}/{openMatches.length} predicted
          </span>
        )}
      </div>
      {groups.map((g) => (
        <section key={g.date} className="daygroup">
          <div className="dayhead">{g.date}</div>
          {g.items.map((m) => (
            <MatchCard
              key={m.id}
              m={m}
              mine={preds[m.id]}
              now={now}
              onPick={onPick}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function MatchCard({ m, mine, now, onPick }) {
  const li = lockInfo(m.kickoff, now);
  const locked = li.locked;
  const opts = optionsFor(m);
  return (
    <div
      className={
        "mcard" + (locked ? " locked" : "") + (m.result ? " resolved" : "")
      }
    >
      <div className="mcard-top">
        <span className={"stagepill s" + m.points}>{m.stage}</span>
        <span className="ptspill">
          {m.points} pt{m.points > 1 ? "s" : ""}
        </span>
        <span
          className={
            "lockpill" + (li.soon ? " soon" : "") + (locked ? " locked" : "")
          }
        >
          {locked ? "🔒 Locked" : "⏱ " + li.text}
        </span>
      </div>
      <div className="mcard-time">
        {fmtDate(m.kickoff)} · {fmtTime(m.kickoff)}
      </div>
      <div className={"picrow" + (opts.length === 2 ? " two" : "")}>
        {opts.map((o) => {
          const sel = mine === o.val;
          const isResult = m.result === o.val;
          let cls = "teampick";
          if (o.val === "draw") cls += " draw";
          if (sel) cls += " sel";
          if (m.result) {
            if (isResult) cls += " correct";
            else if (sel) cls += " wrong";
          }
          return (
            <button
              key={o.val}
              disabled={locked}
              className={cls}
              onClick={() => onPick(m.id, o.val)}
            >
              {o.flag && <span className="fl">{o.flag}</span>}
              <span className="tn">{o.label}</span>
              {sel && <span className="chk">✓</span>}
            </button>
          );
        })}
      </div>
      {m.result ? (
        <div className="mcard-result">
          Result: <strong>{resultLabel(m)}</strong>
          {mine ? (
            mine === m.result ? (
              <span className="ok"> · you nailed it ✓</span>
            ) : (
              <span className="no"> · missed</span>
            )
          ) : (
            <span className="muted"> · no pick</span>
          )}
        </div>
      ) : locked && !mine ? (
        <div className="mcard-result muted">Locked — no pick made</div>
      ) : null}
    </div>
  );
}

function Leaderboard({ board, meId }) {
  if (!board.length)
    return (
      <div className="empty">No scores yet. Check back after kick-off.</div>
    );
  const meIdx = board.findIndex((r) => r.user_id === meId);
  const me = meIdx >= 0 ? board[meIdx] : null;
  return (
    <div className="lbpane">
      {me && (
        <div className="myrank">
          <div className="myrank-pos">#{meIdx + 1}</div>
          <div className="myrank-mid">
            <div className="myrank-name">
              {me.display_name} <span className="you">YOU</span>
            </div>
            <div className="myrank-sub">{me.correct} correct picks</div>
          </div>
          <div className="myrank-pts">
            <span className="n">{me.points}</span>
            <span className="u">pts</span>
          </div>
        </div>
      )}
      <div className="lblist">
        {board.map((r, i) => {
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
          return (
            <div
              key={r.user_id}
              className={
                "lbrow" +
                (r.user_id === meId ? " me" : "") +
                (i < 3 ? " top" : "")
              }
            >
              <div className="lbrank">{medal || i + 1}</div>
              <div className={"avatar " + avatarClass(r.display_name)}>
                {initials(r.display_name)}
              </div>
              <div className="lbname">{r.display_name}</div>
              <div className="lbcorrect">{r.correct} ✓</div>
              <div className="lbpts">{r.points}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Admin({
  matches,
  players,
  adminTab,
  setAdminTab,
  onSetResult,
  adminMatchId,
  onSelectMatch,
  matchVotes,
  onSetVote,
}) {
  return (
    <div>
      <div className="subtabs">
        <button
          className={adminTab === "results" ? "active" : ""}
          onClick={() => setAdminTab("results")}
        >
          Results
        </button>
        <button
          className={adminTab === "votes" ? "active" : ""}
          onClick={() => setAdminTab("votes")}
        >
          Player votes
        </button>
      </div>
      {adminTab === "results" ? (
        <AdminResults matches={matches} onSetResult={onSetResult} />
      ) : (
        <AdminVotes
          matches={matches}
          players={players}
          adminMatchId={adminMatchId}
          onSelectMatch={onSelectMatch}
          matchVotes={matchVotes}
          onSetVote={onSetVote}
        />
      )}
    </div>
  );
}

function AdminResults({ matches, onSetResult }) {
  if (!matches.length) return <div className="empty">No matches.</div>;
  return (
    <div className="list">
      {matches.map((m) => (
        <div key={m.id} className="mcard">
          <div className="mcard-top">
            <span className={"stagepill s" + m.points}>#{m.match_no}</span>
            <span className="lockpill">
              {fmtDate(m.kickoff)} {fmtTime(m.kickoff)}
            </span>
          </div>
          <div className="picrow">
            {optionsFor(m).map((o) => (
              <button
                key={o.val}
                className={
                  "teampick" +
                  (m.result === o.val ? " sel correct" : "") +
                  (o.val === "draw" ? " draw" : "")
                }
                onClick={() =>
                  onSetResult(m.id, m.result === o.val ? null : o.val)
                }
              >
                {o.flag && <span className="fl">{o.flag}</span>}
                <span className="tn">{o.label}</span>
              </button>
            ))}
          </div>
          <div className="mcard-result muted">
            {m.result
              ? "Result set: " + resultLabel(m) + " (tap again to clear)"
              : "No result set"}
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminVotes({
  matches,
  players,
  adminMatchId,
  onSelectMatch,
  matchVotes,
  onSetVote,
}) {
  const m = matches.find((x) => String(x.id) === String(adminMatchId));
  return (
    <div className="card">
      <h3 className="vhead">Enter players' votes</h3>
      <p className="hint">
        Pick a match, then set each player's prediction. Use this for votes
        collected on WhatsApp. You can edit these anytime, even after kick-off.
        Tap a selected button again to clear it.
      </p>
      <select
        className="matchpick"
        value={adminMatchId || ""}
        onChange={(e) => onSelectMatch(e.target.value)}
      >
        <option value="">Select a match…</option>
        {matches.map((x) => (
          <option key={x.id} value={x.id}>
            #{x.match_no} {x.home} vs {x.away}
            {x.result ? "  (" + resultLabel(x) + ")" : ""}
          </option>
        ))}
      </select>
      {m && (
        <div className="votelist">
          <div className="voteteams">
            {flag(m.home)} {m.home} <span className="vs">vs</span> {m.away}{" "}
            {flag(m.away)}
          </div>
          {!players.length && <div className="hint">No players yet.</div>}
          {players.map((p) => {
            const cur = matchVotes[p.id] || "";
            return (
              <div key={p.id} className="playerrow">
                <span className="playername">
                  <span className={"avatar sm " + avatarClass(p.display_name)}>
                    {initials(p.display_name)}
                  </span>
                  {p.display_name}
                </span>
                <div className="minipicks">
                  {picksFor(m).map(([val, lbl]) => (
                    <button
                      key={val}
                      className={"minibtn" + (cur === val ? " sel" : "")}
                      onClick={() =>
                        onSetVote(p.id, m.id, cur === val ? null : val)
                      }
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
