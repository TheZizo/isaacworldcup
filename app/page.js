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
  const [players, setPlayers] = useState([]);
  const [roster, setRoster] = useState([]);
  const [preds, setPreds] = useState({});
  const [board, setBoard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [msg, setMsg] = useState("");

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

  async function bootstrap() {
    setLoading(true);
    const prof = await loadProfile();
    if (prof) {
      await Promise.all([loadMatches(), loadPreds(prof), loadPlayers()]);
    } else {
      await loadRoster();
    }
    setLoading(false);
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
  async function loadMatches() {
    const { data } = await supabase
      .from("matches")
      .select("*")
      .order("kickoff");
    setMatches(data || []);
  }
  async function loadPlayers() {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name")
      .order("display_name");
    setPlayers(data || []);
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

  async function claimName(id) {
    const { error } = await supabase.rpc("claim_profile", { p_id: id });
    if (error) {
      alert(
        error.message || "Couldn't claim that name — it may already be taken.",
      );
      await loadRoster();
      return;
    }
    await bootstrap();
  }
  async function createName(name) {
    const clean = name.trim();
    if (!clean) return;
    const { error } = await supabase
      .from("profiles")
      .insert({ auth_id: session.user.id, display_name: clean });
    if (error) {
      alert("Couldn't create your profile: " + error.message);
      return;
    }
    await bootstrap();
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
      setMsg("Couldn't save — this match may have kicked off already.");
      setTimeout(() => setMsg(""), 3500);
    }
  }

  async function setResult(matchId, value) {
    await supabase
      .from("matches")
      .update({ result: value || null })
      .eq("id", matchId);
    await loadMatches();
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
  if (!profile)
    return (
      <Claim
        roster={roster}
        onClaim={claimName}
        onCreate={createName}
        onSignOut={signOut}
      />
    );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🏆 World Cup Predictions</div>
        <div className="user">
          <span>{profile.display_name}</span>
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
        {profile.is_admin && (
          <button
            className={tab === "admin" ? "active" : ""}
            onClick={() => setTab("admin")}
          >
            Admin
          </button>
        )}
      </nav>

      {msg && <div className="toast">{msg}</div>}

      {tab === "matches" && (
        <Matches matches={matches} preds={preds} now={now} onPick={pick} />
      )}
      {tab === "leaderboard" && <Leaderboard board={board} meId={profile.id} />}
      {tab === "admin" && profile.is_admin && (
        <Admin
          matches={matches}
          players={players}
          onSetResult={setResult}
          onReloadPlayers={loadPlayers}
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
          Predict every match. Score points for each correct call — and they
          grow with every knockout round. Most points by the final wins.
        </p>
        <button className="google" onClick={onSignIn}>
          <span className="g">G</span> Sign in with Google
        </button>
      </div>
    </div>
  );
}

function Claim({ roster, onClaim, onCreate, onSignOut }) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  async function claim(id) {
    setBusy(true);
    await onClaim(id);
    setBusy(false);
  }
  async function create() {
    setBusy(true);
    await onCreate(newName);
    setBusy(false);
  }
  return (
    <div className="landing">
      <div className="hero claim">
        <div className="logo">👋</div>
        <h1>Which player are you?</h1>
        <p>Tap your name so your votes and points are linked to you.</p>
        <div className="claimlist">
          {roster.length === 0 && (
            <div className="muted">No unclaimed names left.</div>
          )}
          {roster.map((r) => (
            <button
              key={r.id}
              className="claimbtn"
              disabled={busy}
              onClick={() => claim(r.id)}
            >
              {r.display_name}
            </button>
          ))}
        </div>
        <div className="claimnew">
          <div className="muted">Not on the list?</div>
          <div className="addrow">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Type your name…"
            />
            <button onClick={create} disabled={busy || !newName.trim()}>
              Add me
            </button>
          </div>
        </div>
        <button className="link signout" onClick={onSignOut}>
          Sign out
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
                    {m.stage}{" "}
                    <span className="pts">
                      · {m.points} pt{m.points > 1 ? "s" : ""}
                    </span>
                  </span>
                  <span className="time">{fmtTime(m.kickoff)}</span>
                </div>
                <div className="teams">
                  {m.home} <span className="vs">v</span> {m.away}
                </div>
                <div className="picks">
                  {PICKS.map(([val, label]) => {
                    const sel = mine === val;
                    const correct = locked && m.result && m.result === val;
                    return (
                      <button
                        key={val}
                        className={
                          "pickbtn" +
                          (sel ? " sel" : "") +
                          (correct ? " correct" : "")
                        }
                        disabled={locked}
                        onClick={() => onPick(m.id, val)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {locked && (
                  <div className="status">
                    {m.result ? (
                      <>
                        Result: <b>{labelFor(m.result)}</b>
                        {mine ? (
                          mine === m.result ? (
                            <span className="ok"> ✓ +{m.points}</span>
                          ) : (
                            <span className="no"> ✗ +0</span>
                          )
                        ) : (
                          <span className="muted"> · no pick</span>
                        )}
                      </>
                    ) : (
                      <span className="muted">
                        Locked — waiting for result
                        {mine ? ` · you picked ${labelFor(mine)}` : ""}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Leaderboard({ board, meId }) {
  const sorted = [...board].sort(
    (a, b) => b.points - a.points || b.correct - a.correct,
  );
  if (!sorted.length) return <div className="center">No scores yet.</div>;
  return (
    <div className="board">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Pts</th>
            <th>✓</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.user_id} className={r.user_id === meId ? "me" : ""}>
              <td className={i === 0 ? "rank1" : ""}>{i + 1}</td>
              <td>{r.display_name}</td>
              <td>
                <b>{r.points}</b>
              </td>
              <td>{r.correct}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Admin({ matches, players, onSetResult, onReloadPlayers }) {
  const [mode, setMode] = useState("results");
  return (
    <div className="list">
      <div className="subtabs">
        <button
          className={mode === "results" ? "active" : ""}
          onClick={() => setMode("results")}
        >
          Results
        </button>
        <button
          className={mode === "votes" ? "active" : ""}
          onClick={() => setMode("votes")}
        >
          Enter votes
        </button>
      </div>
      {mode === "results" ? (
        <AdminResults matches={matches} onSetResult={onSetResult} />
      ) : (
        <AdminVotes
          matches={matches}
          players={players}
          onReloadPlayers={onReloadPlayers}
        />
      )}
    </div>
  );
}

function AdminResults({ matches, onSetResult }) {
  return (
    <div>
      <div className="hint">
        Setting a result instantly updates everyone&apos;s points and the
        leaderboard.
      </div>
      {matches.map((m) => (
        <div key={m.id} className="match">
          <div className="matchtop">
            <span className={"stage s" + m.points}>{m.stage}</span>
            <span className="time">
              {fmtDate(m.kickoff)} · {fmtTime(m.kickoff)}
            </span>
          </div>
          <div className="teams">
            {m.home} <span className="vs">v</span> {m.away}
          </div>
          <div className="picks">
            {[
              ["home", "Home"],
              ["draw", "Draw"],
              ["away", "Away"],
              ["", "Clear"],
            ].map(([val, label]) => (
              <button
                key={label}
                className={"pickbtn" + (val && m.result === val ? " sel" : "")}
                onClick={() => onSetResult(m.id, val)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminVotes({ matches, players, onReloadPlayers }) {
  const [matchId, setMatchId] = useState(matches[0] ? matches[0].id : null);
  const [picks, setPicks] = useState({});
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (matchId != null) loadPicks(matchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  async function loadPicks(id) {
    setLoading(true);
    const { data } = await supabase
      .from("predictions")
      .select("user_id, pick")
      .eq("match_id", id);
    const map = {};
    (data || []).forEach((p) => {
      map[p.user_id] = p.pick;
    });
    setPicks(map);
    setLoading(false);
  }
  async function setVote(playerId, value) {
    const prev = picks[playerId];
    setPicks((p) => ({ ...p, [playerId]: value || undefined }));
    if (!value) {
      await supabase
        .from("predictions")
        .delete()
        .eq("user_id", playerId)
        .eq("match_id", matchId);
    } else {
      const { error } = await supabase
        .from("predictions")
        .upsert(
          { user_id: playerId, match_id: matchId, pick: value },
          { onConflict: "user_id,match_id" },
        );
      if (error) {
        setPicks((p) => ({ ...p, [playerId]: prev }));
        alert("Save failed: " + error.message);
      }
    }
  }
  async function addPlayer() {
    if (!newName.trim()) return;
    const { error } = await supabase
      .from("profiles")
      .insert({ display_name: newName.trim() });
    if (error) {
      alert("Couldn't add player: " + error.message);
      return;
    }
    setNewName("");
    onReloadPlayers();
  }

  const m = matches.find((x) => x.id === matchId);
  return (
    <div>
      <select
        className="select"
        value={matchId == null ? "" : matchId}
        onChange={(e) => setMatchId(Number(e.target.value))}
      >
        {matches.map((x) => (
          <option key={x.id} value={x.id}>
            #{x.id} · {x.home} v {x.away}
          </option>
        ))}
      </select>
      {m && (
        <div className="hint">
          Tap each player&apos;s vote for{" "}
          <b>
            {m.home} v {m.away}
          </b>
          . H = {m.home} win, D = draw, A = {m.away} win.
        </div>
      )}
      {loading ? (
        <div className="center">Loading…</div>
      ) : (
        players.map((pl) => (
          <div key={pl.id} className="voter">
            <span className="vname">{pl.display_name}</span>
            <div className="picks">
              {[
                ["home", "H"],
                ["draw", "D"],
                ["away", "A"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  className={"pickbtn" + (picks[pl.id] === v ? " sel" : "")}
                  onClick={() => setVote(pl.id, v)}
                >
                  {l}
                </button>
              ))}
              <button
                className="pickbtn clear"
                onClick={() => setVote(pl.id, "")}
              >
                ✕
              </button>
            </div>
          </div>
        ))
      )}
      <div className="addrow">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a player who isn't listed…"
        />
        <button onClick={addPlayer}>Add</button>
      </div>
    </div>
  );
}
