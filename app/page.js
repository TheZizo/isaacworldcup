"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const PICKS = [
  ["home", "Home"],
  ["draw", "Draw"],
  ["away", "Away"],
];

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
    await Promise.all([loadMatches(), loadPreds(prof)]);
    setLoading(false);
    triggerSync();
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
    let { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();
    if (!data) {
      const name =
        session.user.user_metadata?.full_name ||
        (session.user.email || "Player").split("@")[0];
      const ins = await supabase
        .from("profiles")
        .insert({ id: uid, display_name: name })
        .select("*")
        .maybeSingle();
      data = ins.data || null;
    }
    setProfile(data || null);
    return data || null;
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
  if (loading) return <div className="center">Loading…</div>;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🏆 World Cup Predictions</div>
        <div className="user">
          <span>{profile?.display_name}</span>
          <button className="link" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={tab === "matches" ? "active" : ""}
          onClick={() => setTab("matches")}
        >
          Matches
        </button>
        <button
          className={tab === "leaderboard" ? "active" : ""}
          onClick={() => {
            setTab("leaderboard");
            loadBoard();
          }}
        >
          Leaderboard
        </button>
        {profile?.is_admin && (
          <button
            className={tab === "admin" ? "active" : ""}
            onClick={() => {
              setTab("admin");
              loadPlayers();
            }}
          >
            Admin
          </button>
        )}
      </nav>

      {msg && <div className="toast">{msg}</div>}

      {tab === "matches" && (
        <Matches matches={matches} preds={preds} now={now} onPick={pick} />
      )}
      {tab === "leaderboard" && (
        <Leaderboard board={board} meId={profile?.id} />
      )}
      {tab === "admin" && profile?.is_admin && (
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
        1 point per correct pick in the group stage, then +1 each round (Round
        of 32 = 2, Round of 16 = 3, QF = 4, SF = 5, 3rd place = 6, Final = 7).
        <br />
        Your pick locks automatically at kick-off.
      </footer>
    </div>
  );
}

function Landing({ onSignIn }) {
  return (
    <div className="landing">
      <div className="hero">
        <div className="logo">🏆</div>
        <h1>World Cup 2026 Predictions</h1>
        <p>
          Predict every match. Score points for each correct call - and they
          grow with every knockout round. Most points by the final wins.
        </p>
        <button className="google" onClick={onSignIn}>
          <span className="g">G</span> Sign in with Google
        </button>
      </div>
    </div>
  );
}

function Matches({ matches, preds, now, onPick }) {
  if (!matches.length) return <div className="center">No matches yet.</div>;
  const groups = [];
  let last = null;
  matches.forEach((m) => {
    const d = fmtDate(m.kickoff);
    if (d !== last) {
      groups.push({ date: d, items: [] });
      last = d;
    }
    groups[groups.length - 1].items.push(m);
  });
  return (
    <div className="list">
      {groups.map((g) => (
        <div key={g.date} className="daygroup">
          <div className="dayhead">{g.date}</div>
          {g.items.map((m) => {
            const locked = new Date(m.kickoff).getTime() <= now;
            const mine = preds[m.id];
            return (
              <div key={m.id} className={"match" + (locked ? " locked" : "")}>
                <div className="matchtop">
                  <span className={"stage s" + m.points}>
                    {m.stage}
                    {m.points > 1 ? (
                      <span className="pts"> · {m.points} pts</span>
                    ) : null}
                  </span>
                  <span className="time">
                    {fmtTime(m.kickoff)}
                    {locked ? " · locked" : ""}
                  </span>
                </div>
                <div className="teams">
                  {m.home} <span className="vs">vs</span> {m.away}
                </div>
                <div className="picks">
                  {PICKS.map(([val, lbl]) => {
                    const sel = mine === val;
                    const correct = m.result && m.result === val && sel;
                    return (
                      <button
                        key={val}
                        disabled={locked}
                        className={
                          "pickbtn" +
                          (sel ? " sel" : "") +
                          (correct ? " correct" : "")
                        }
                        onClick={() => onPick(m.id, val)}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
                {m.result ? (
                  <div className="status">
                    Result: <strong>{labelFor(m.result)}</strong>
                    {mine ? (
                      mine === m.result ? (
                        <span className="ok"> · you got it ✓</span>
                      ) : (
                        <span className="no"> · you missed</span>
                      )
                    ) : (
                      <span className="muted"> · no pick</span>
                    )}
                  </div>
                ) : locked && !mine ? (
                  <div className="status muted">No pick — locked.</div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Leaderboard({ board, meId }) {
  if (!board.length)
    return (
      <div className="center">No scores yet. Check back after kick-off.</div>
    );
  return (
    <div className="board">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Pts</th>
            <th>Correct</th>
          </tr>
        </thead>
        <tbody>
          {board.map((r, i) => (
            <tr key={r.user_id} className={r.user_id === meId ? "me" : ""}>
              <td className={i === 0 ? "rank1" : ""}>{i + 1}</td>
              <td>{r.display_name}</td>
              <td>{r.points}</td>
              <td>{r.correct}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  if (!matches.length) return <div className="center">No matches.</div>;
  return (
    <div className="list">
      {matches.map((m) => (
        <div key={m.id} className="match">
          <div className="matchtop">
            <span className="stage">#{m.match_no}</span>
            <span className="time">
              {fmtDate(m.kickoff)} {fmtTime(m.kickoff)}
            </span>
          </div>
          <div className="teams">
            {m.home} <span className="vs">vs</span> {m.away}
          </div>
          <div className="picks">
            {PICKS.map(([val, lbl]) => (
              <button
                key={val}
                className={"pickbtn" + (m.result === val ? " sel" : "")}
                onClick={() => onSetResult(m.id, m.result === val ? null : val)}
              >
                {lbl}
              </button>
            ))}
          </div>
          <div className="status muted">
            {m.result
              ? "Result set: " + labelFor(m.result) + " (tap again to clear)"
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
      <p className="muted">
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
            {x.result ? "  (" + labelFor(x.result) + ")" : ""}
          </option>
        ))}
      </select>
      {m && (
        <div className="votelist">
          <div className="voteteams">
            {m.home} <span className="vs">vs</span> {m.away}
          </div>
          {!players.length && (
            <div className="status muted">No players yet.</div>
          )}
          {players.map((p) => {
            const cur = matchVotes[p.id] || "";
            return (
              <div key={p.id} className="playerrow">
                <span className="playername">{p.display_name}</span>
                <div className="minipicks">
                  {PICKS.map(([val, lbl]) => (
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
