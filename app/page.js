"use client"
import { useEffect, useState } from "react"
import { supabase } from "../lib/supabaseClient"

const PICKS = [
  ["home", "Home"],
  ["draw", "Draw"],
  ["away", "Away"],
]

function labelFor(v) {
  return v === "home" ? "Home" : v === "draw" ? "Draw" : v === "away" ? "Away" : ""
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export default function Home() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState("matches")
  const [matches, setMatches] = useState([])
  const [preds, setPreds] = useState({})
  const [board, setBoard] = useState([])
  const [loading, setLoading] = useState(true)
  const [nameInput, setNameInput] = useState("")
  const [savingName, setSavingName] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [msg, setMsg] = useState("")

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => {
      sub.subscription.unsubscribe()
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      setLoading(false)
      return
    }
    ;(async () => {
      setLoading(true)
      await loadProfile()
      await loadMatches()
      await loadPreds()
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  async function loadProfile() {
    const uid = session.user.id
    let { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle()
    if (!data) {
      const fallback =
        session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "Player"
      await supabase.from("profiles").insert({ id: uid, display_name: fallback })
      ;({ data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle())
    }
    setProfile(data)
    setNameInput(data?.display_name || "")
  }
  async function loadMatches() {
    const { data } = await supabase.from("matches").select("*").order("kickoff")
    setMatches(data || [])
  }
  async function loadPreds() {
    const { data } = await supabase.from("predictions").select("*").eq("user_id", session.user.id)
    const map = {}
    ;(data || []).forEach((p) => {
      map[p.match_id] = p.pick
    })
    setPreds(map)
  }
  async function loadBoard() {
    const { data, error } = await supabase.rpc("get_leaderboard")
    if (!error) setBoard(data || [])
  }

  async function saveName() {
    if (!nameInput.trim()) return
    setSavingName(true)
    await supabase.from("profiles").update({ display_name: nameInput.trim() }).eq("id", session.user.id)
    await loadProfile()
    setSavingName(false)
  }

  async function pick(matchId, value) {
    const prev = preds[matchId]
    setPreds((p) => ({ ...p, [matchId]: value }))
    const { error } = await supabase
      .from("predictions")
      .upsert({ user_id: session.user.id, match_id: matchId, pick: value }, { onConflict: "user_id,match_id" })
    if (error) {
      setPreds((p) => ({ ...p, [matchId]: prev }))
      setMsg("Couldn't save — this match may have kicked off already.")
      setTimeout(() => setMsg(""), 3500)
    }
  }

  async function setResult(matchId, value) {
    await supabase.from("matches").update({ result: value || null }).eq("id", matchId)
    await loadMatches()
  }

  function signIn() {
    supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })
  }
  function signOut() {
    supabase.auth.signOut()
  }

  if (!session) return <Landing onSignIn={signIn} />
  if (loading) return <div className="center">Loading…</div>

  const needName =
    !profile || !profile.display_name || profile.display_name === session.user.email

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🏆 World Cup Predictions</div>
        <div className="user">
          <span>{profile?.display_name}</span>
          <button className="link" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {needName && (
        <div className="card namecard">
          <h3>Choose your display name</h3>
          <p>This is how you&apos;ll show up on the leaderboard.</p>
          <div className="row">
            <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Your name" />
            <button onClick={saveName} disabled={savingName}>Save</button>
          </div>
        </div>
      )}

      <nav className="tabs">
        <button className={tab === "matches" ? "active" : ""} onClick={() => setTab("matches")}>Matches</button>
        <button className={tab === "leaderboard" ? "active" : ""} onClick={() => { setTab("leaderboard"); loadBoard() }}>Leaderboard</button>
        {profile?.is_admin && (
          <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>Admin</button>
        )}
      </nav>

      {msg && <div className="toast">{msg}</div>}

      {tab === "matches" && <Matches matches={matches} preds={preds} now={now} onPick={pick} />}
      {tab === "leaderboard" && <Leaderboard board={board} meId={session.user.id} />}
      {tab === "admin" && profile?.is_admin && <Admin matches={matches} onSetResult={setResult} />}

      <footer className="foot">
        1 point per correct pick in the group stage, then +1 each round
        (Round of 32 = 2, Round of 16 = 3, QF = 4, SF = 5, 3rd place = 6, Final = 7).
        <br />Your pick locks automatically at kick-off.
      </footer>
    </div>
  )
}

function Landing({ onSignIn }) {
  return (
    <div className="landing">
      <div className="hero">
        <div className="logo">🏆</div>
        <h1>World Cup 2026 Predictions</h1>
        <p>
          Predict every match. Score points for each correct call — and they grow with every
          knockout round. Most points by the final wins.
        </p>
        <button className="google" onClick={onSignIn}>
          <span className="g">G</span> Sign in with Google
        </button>
      </div>
    </div>
  )
}

function Matches({ matches, preds, now, onPick }) {
  if (!matches.length) return <div className="center">No matches yet.</div>
  const groups = []
  let last = null
  matches.forEach((m) => {
    const d = fmtDate(m.kickoff)
    if (d !== last) {
      groups.push({ date: d, items: [] })
      last = d
    }
    groups[groups.length - 1].items.push(m)
  })
  return (
    <div className="list">
      {groups.map((g) => (
        <div key={g.date} className="daygroup">
          <div className="dayhead">{g.date}</div>
          {g.items.map((m) => {
            const locked = new Date(m.kickoff).getTime() <= now
            const mine = preds[m.id]
            return (
              <div key={m.id} className={"match" + (locked ? " locked" : "")}>
                <div className="matchtop">
                  <span className={"stage s" + m.points}>{m.stage} <span className="pts">· {m.points} pt{m.points > 1 ? "s" : ""}</span></span>
                  <span className="time">{fmtTime(m.kickoff)}</span>
                </div>
                <div className="teams">{m.home} <span className="vs">v</span> {m.away}</div>
                <div className="picks">
                  {PICKS.map(([val, label]) => {
                    const sel = mine === val
                    const correct = locked && m.result && m.result === val
                    return (
                      <button
                        key={val}
                        className={"pickbtn" + (sel ? " sel" : "") + (correct ? " correct" : "")}
                        disabled={locked}
                        onClick={() => onPick(m.id, val)}
                      >
                        {label}
                      </button>
                    )
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
                          <span className="muted"> · you didn&apos;t pick</span>
                        )}
                      </>
                    ) : (
                      <span className="muted">Locked — waiting for result{mine ? ` · you picked ${labelFor(mine)}` : ""}</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function Leaderboard({ board, meId }) {
  const sorted = [...board].sort((a, b) => b.points - a.points || b.correct - a.correct)
  if (!sorted.length) return <div className="center">No scores yet.</div>
  return (
    <div className="board">
      <table>
        <thead>
          <tr><th>#</th><th>Player</th><th>Pts</th><th>✓</th></tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.user_id} className={r.user_id === meId ? "me" : ""}>
              <td className={i === 0 ? "rank1" : ""}>{i + 1}</td>
              <td>{r.display_name}</td>
              <td><b>{r.points}</b></td>
              <td>{r.correct}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Admin({ matches, onSetResult }) {
  return (
    <div className="list">
      <div className="card"><b>Admin · enter results</b><p className="muted">Setting a result instantly updates everyone&apos;s points and the leaderboard.</p></div>
      {matches.map((m) => (
        <div key={m.id} className="match">
          <div className="matchtop">
            <span className={"stage s" + m.points}>{m.stage}</span>
            <span className="time">{fmtDate(m.kickoff)} · {fmtTime(m.kickoff)}</span>
          </div>
          <div className="teams">{m.home} <span className="vs">v</span> {m.away}</div>
          <div className="picks">
            {[["home", "Home"], ["draw", "Draw"], ["away", "Away"], ["", "Clear"]].map(([val, label]) => (
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
  )
}
