import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import './ctf.css';

const bots = [{ alias: 'Packet Fox', skill: 0.82 }, { alias: 'Byte Bandit', skill: 0.64 }, { alias: 'Sudo Sprite', skill: 0.46 }];
const difficulties = [
  { name: 'Easy', detail: 'One clue, direct answer', points: '100 pts · 1 min' },
  { name: 'Medium', detail: 'Interpret several details', points: '200 pts · 2 min' },
  { name: 'High', detail: 'Combine evidence and limits', points: '300 pts · 3 min' },
];
const challengeTimes = { Easy: 60, Medium: 120, High: 180 };
const Difficulty = ({ level }) => <span className={`difficulty ${level.toLowerCase()}`}>{level}</span>;

export default function CTFPage() {
  const [params, setParams] = useSearchParams();
  const [inviteCode] = useState(() => (params.get('room') || '').toUpperCase());
  const [phase, setPhase] = useState('briefing');
  const [mode, setMode] = useState(inviteCode ? 'join' : 'choose');
  const [difficulty, setDifficulty] = useState('Easy');
  const [alias, setAlias] = useState('Player');
  const [roomCode, setRoomCode] = useState(inviteCode);
  const [room, setRoom] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [roundNumber, setRoundNumber] = useState(0);
  const [challenges, setChallenges] = useState([]);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [solved, setSolved] = useState([]);
  const [botScores, setBotScores] = useState([]);
  const [flag, setFlag] = useState('');
  const [hintVisible, setHintVisible] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (phase !== 'playing' || mode !== 'room' || !room?.playerId) return undefined;
    const refresh = async () => {
      try {
        const data = await request(`/api/rooms/${room.code}?playerId=${encodeURIComponent(room.playerId)}`, undefined, 'GET');
        setRoom(data); setChallenges(data.challenges);
      } catch (cause) { setError(cause.message); }
    };
    refresh();
    const timer = window.setInterval(refresh, 1800);
    return () => window.clearInterval(timer);
  }, [phase, mode, room?.code, room?.playerId]);

  useEffect(() => {
    if (phase !== 'playing' || mode !== 'bots' || !challenges.length) return undefined;
    const timer = window.setInterval(() => setBotScores((current) => current.map((bot) => {
      const available = challenges.filter((challenge) => !bot.solved.includes(challenge.id));
      if (!available.length) return bot;
      const challenge = available[Math.floor(Math.random() * available.length)];
      const rate = challenge.difficulty === 'Easy' ? 0.42 : challenge.difficulty === 'Medium' ? 0.27 : 0.14;
      return Math.random() > rate * bot.skill ? bot : { ...bot, solved: [...bot.solved, challenge.id], score: bot.score + challenge.points };
    })), 5500);
    return () => window.clearInterval(timer);
  }, [phase, mode, challenges]);

  const active = challenges[challengeIndex];
  const timeLimit = challengeTimes[difficulty] || challengeTimes.Easy;
  const leaderboard = useMemo(() => {
    const myAlias = mode === 'room' ? room?.players.find((player) => player.id === room?.playerId)?.alias || alias : alias;
    const myScore = mode === 'room' ? room?.players.find((player) => player.id === room?.playerId)?.score || 0 : challenges.filter((item) => solved.includes(item.id)).reduce((sum, item) => sum + item.points, 0);
    const rows = mode === 'room' ? (room?.players || []).map((player) => ({ alias: player.alias, score: player.score, isMe: player.id === room?.playerId })) : mode === 'bots' ? [{ alias: myAlias, score: myScore, isMe: true }, ...botScores] : [{ alias: myAlias, score: myScore, isMe: true }];
    return rows.sort((a, b) => b.score - a.score);
  }, [alias, botScores, challenges, mode, room, solved]);
  const myScore = leaderboard.find((player) => player.isMe)?.score || 0;
  const myPlacement = leaderboard.findIndex((player) => player.isMe) + 1;

  useEffect(() => {
    if (phase !== 'playing' || !active) return undefined;
    const endAt = Date.now() + timeLimit * 1000;
    setTimeLeft(timeLimit);
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        window.clearInterval(timer);
        setChallengeIndex((index) => index + 1);
        setFlag(''); setHintVisible(false); setFeedback('');
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase, challengeIndex, active?.id, timeLimit]);

  async function request(path, payload, method = 'POST') {
    const options = { method, headers: { 'content-type': 'application/json' } };
    if (payload !== undefined) options.body = JSON.stringify(payload);
    const response = await fetch(path, options);
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'Request failed.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function beginGame(data, nextMode) {
    setDifficulty(data.difficulty);
    setRoundNumber(data.roundNumber);
    setMode(nextMode); setPhase('playing'); setChallenges(data.challenges); setChallengeIndex(0); setTimeLeft(challengeTimes[data.difficulty] || challengeTimes.Easy);
    setRoom(nextMode === 'room' ? data : null); setSessionId(data.sessionId || ''); setSolved([]); setFlag(''); setFeedback(''); setError(''); setHintVisible(false);
    setBotScores(nextMode === 'bots' ? bots.map((bot) => ({ ...bot, solved: [], score: 0 })) : []);
  }

  function prepareGame(nextMode) { setMode(nextMode); setPhase('setup'); setError(''); }

  async function startLocal(nextMode) {
    setBusy(true); setError('');
    try { beginGame(await request('/api/ctf/start', { difficulty, alias }), nextMode); }
    catch (cause) { setError(cause.status === 404 ? 'The CTF server is out of date. Stop the running dev server and restart it with `npm run dev`.' : cause.message || 'Start the local CTF server with `npm run dev`.'); }
    finally { setBusy(false); }
  }

  async function createRoom() {
    setBusy(true); setError('');
    try { const data = await request('/api/rooms', { alias, difficulty }); setRoomCode(data.code); setParams({ room: data.code }); beginGame(data, 'room'); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function joinRoom(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const code = roomCode.trim().toUpperCase(); const data = await request(`/api/rooms/${encodeURIComponent(code)}/join`, { alias }); setRoomCode(code); setParams({ room: code }); beginGame(data, 'room'); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function copyInvite() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/ctf?room=${room.code}`); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    catch { setError(`Copy failed. Share room code ${room.code} with players on the same network.`); }
  }

  async function submitFlag(event) {
    event.preventDefault();
    if (!active || !flag.trim() || timeLeft <= 0) return;
    setBusy(true); setFeedback(''); setError('');
    try {
      const path = mode === 'room' ? `/api/rooms/${room.code}/submit` : `/api/ctf/sessions/${sessionId}/submit`;
      const data = await request(path, { ...(mode === 'room' ? { playerId: room.playerId } : {}), challengeId: active.id, flag: flag.trim() });
      if (!data.correct) { setFeedback('Not quite. Check the supplied clues and try again.'); return; }
      setSolved((current) => [...new Set([...current, active.id])]);
      if (mode === 'room') setRoom(data.room);
      setChallengeIndex((index) => index + 1); setFlag(''); setHintVisible(false);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  function backToBriefing() { setPhase('briefing'); setMode(inviteCode ? 'join' : 'choose'); setRoom(null); setSessionId(''); setChallenges([]); setParams(inviteCode ? { room: inviteCode } : {}); setError(''); setFeedback(''); }

  return <>
    <Link to="/" className="back-link">← Dashboard</Link>
    <header className="ctf-hero"><div><div className="eyebrow">TEAM PLAYGROUND</div><h1>Capture the Flag</h1><p>Learn the format, choose a difficulty, and play solo, race bots, or join a room.</p></div><div className="ctf-mark" aria-hidden="true">⚑</div></header>
    {error && <div className="ctf-notice">{error}</div>}

    {phase === 'briefing' && <>
      <section className="ctf-briefing">
        <div className="ctf-instructions"><div className="eyebrow">BEFORE YOU START</div><h2>How to play</h2><ol><li>Read the simulated evidence and answer the challenge question.</li><li>Easy and Medium use a plain answer. High uses <code>FLAG&#123;...&#125;</code> when requested. Answers are case-insensitive.</li><li>Copy values exactly as shown, including dots, hyphens, or slashes.</li><li>Use hints whenever you need them; they do not reduce your score.</li><li>Each game mixes five randomized challenges into a uniquely numbered round. No real systems are contacted.</li></ol></div>
        <div className="ctf-examples"><div className="eyebrow">WORKED EXAMPLES</div><h2>Answer format by difficulty</h2><div className="ctf-example"><div><b><Difficulty level="Easy"/> Scope clue</b><span>Allowed: <code>web-42.training.invalid</code></span></div><strong>web-42.training.invalid</strong><small>Enter the hostname as shown. No flag wrapper.</small></div><div className="ctf-example"><div><b><Difficulty level="Medium"/> HTTP clue</b><span><code>GET /help-7 HTTP/1.1</code></span></div><strong>/help-7</strong><small>Enter the requested path exactly. No flag wrapper.</small></div><div className="ctf-example"><div><b><Difficulty level="High"/> Evidence clue</b><span>Finding status: needs validation</span></div><strong>FLAG&#123;needs_validation&#125;</strong><small>High challenges use the flag wrapper when prompted.</small></div></div>
      </section>
      {mode !== 'join' && <>
        <section className="ctf-mode-picker"><div className="eyebrow">CHOOSE HOW TO PLAY</div><div className="ctf-start-grid"><button className="ctf-mode-card" onClick={() => prepareGame('solo')} disabled={busy}><span className="ctf-mode-icon">01</span><b>Solo practice</b><small>Play at your own pace.</small><span className="ctf-mode-cta">Start solo →</span></button><button className="ctf-mode-card" onClick={() => prepareGame('bots')} disabled={busy}><span className="ctf-mode-icon">02</span><b>Race the bots</b><small>Compete against scripted opponents.</small><span className="ctf-mode-cta">Start vs bots →</span></button><div className="ctf-mode-card room-mode"><span className="ctf-mode-icon">03</span><b>Create a room</b><small>Host on the same trusted local network.</small><div className="room-create-row"><label className="room-alias-label">Host name / alias<input value={alias} onChange={(event) => setAlias(event.target.value)} maxLength={20} placeholder="Choose an alias" /></label><button type="button" className="button primary small room-host-button" onClick={() => prepareGame('host')} disabled={busy}>Set up room</button></div><small className="room-help">Your invite code is generated automatically.</small></div></div></section>
      </>}
      {mode === 'join' && <form className="room-join-panel" onSubmit={joinRoom}><div><div className="eyebrow">JOIN CLASSROOM ROOM</div><h2>Ready to join?</h2><p>The host chooses the difficulty and generates the random challenge set.</p></div><label>Room code<input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} maxLength={6} placeholder="6-character code"/></label><label>Display alias<input value={alias} onChange={(event) => setAlias(event.target.value)} maxLength={20} placeholder="Choose an alias"/></label><button className="button primary" disabled={busy || roomCode.length < 6}>Join room</button></form>}
    </>}

    {phase === 'setup' && <>
      <div className="ctf-session-bar"><div><div className="eyebrow">{mode === 'host' ? 'ROOM SETUP' : mode === 'bots' ? 'BOT MATCH SETUP' : 'SOLO SETUP'}</div><b>Choose a difficulty</b></div><button className="button quiet small" onClick={backToBriefing}>← Back</button></div>
      <section className="difficulty-picker"><div className="eyebrow">FIVE RANDOM CHALLENGES · {mode === 'host' ? 'SHARED WITH ROOM PLAYERS' : mode === 'bots' ? 'SCRIPTED OPPONENTS' : 'INDIVIDUAL SCORE'}</div><div className="difficulty-options">{difficulties.map((item) => <button key={item.name} className={`difficulty-option${difficulty === item.name ? ' selected' : ''}`} onClick={() => setDifficulty(item.name)}><Difficulty level={item.name}/><b>{item.detail}</b><small>{item.points}</small></button>)}</div><div className="ctf-start-actions"><p>Each challenge has a difficulty-based timer. Hints are available during play.</p><button className="button primary" onClick={() => mode === 'host' ? createRoom() : startLocal(mode)} disabled={busy}>{mode === 'host' ? 'Create room' : mode === 'bots' ? 'Start vs bots' : 'Start solo game'} <span>→</span></button></div></section>
    </>}

    {phase === 'playing' && <>
      <div className="ctf-session-bar"><div><div className="eyebrow">ROUND {String(roundNumber).padStart(4, '0')} · {mode === 'solo' ? 'SOLO PRACTICE' : mode === 'bots' ? 'SCRIPTED BOT MATCH' : `CLASSROOM ROOM · ${room?.code || roomCode}`} · {difficulty.toUpperCase()}</div><b>{mode === 'room' ? 'Players in room' : mode === 'bots' ? 'Live leaderboard' : 'Your score'}</b></div><div className="ctf-session-actions">{mode === 'room' && room && <button className="button outline small" onClick={copyInvite}>{copied ? 'Copied ✓' : 'Copy invite link'}</button>}<button className="button quiet small" onClick={backToBriefing}>End match</button></div></div>
      {mode === 'room' && room && <div className="room-roster">{room.players.map((player) => <span key={player.id} className={player.id === room.playerId ? 'self' : ''}>{player.alias}{player.id === room.playerId ? ' · you' : ''}</span>)}</div>}
      <div className="ctf-game-layout"><main className="ctf-stage">{active ? <><section className="ctf-challenge-panel"><div className="ctf-challenge-progress"><span>CHALLENGE {String(challengeIndex + 1).padStart(2, '0')} / {String(challenges.length).padStart(2, '0')}</span><span className={`ctf-timer${timeLeft <= 10 ? ' urgent' : ''}`} aria-live="polite">{String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}</span></div><div className="ctf-timer-track"><span className={`difficulty-fill ${difficulty.toLowerCase()}`} style={{ width: `${Math.max(0, (timeLeft / timeLimit) * 100)}%` }}/></div><div className="ctf-challenge-heading"><div><div className="eyebrow">{active.category.toUpperCase()} · {active.difficulty.toUpperCase()}</div><h2>{active.title}</h2></div><span className="ctf-points">{active.points} PTS</span></div><p className="ctf-prompt">{active.prompt}</p><div className="ctf-output"><div>SIMULATED EVIDENCE <span>RANDOMIZED DATA</span></div><pre>{active.output}</pre></div>{hintVisible && <div className="hint-box"><b>HINT</b> {active.hint}</div>}<div className="ctf-safety-note">Fictional scenario · No commands run and no targets are contacted.</div></section><section className="ctf-answer-panel"><div className="eyebrow">YOUR ANSWER</div>{feedback && <div className={`answer-feedback${feedback.startsWith('Not quite') ? ' retry' : ' good'}`}>{feedback}</div>}<form className="ctf-submit" onSubmit={submitFlag}><label htmlFor="ctf-flag">{active.difficulty === 'High' ? 'Submit flag' : 'Submit answer'}</label><div><input id="ctf-flag" value={flag} onChange={(event) => setFlag(event.target.value)} placeholder={active.difficulty === 'High' ? 'FLAG{...}' : 'Enter your answer'} autoComplete="off"/><button className="button primary" disabled={busy || !flag.trim() || (mode === 'room' && !room)}>Submit <span>→</span></button></div></form><button className="button quiet small" onClick={() => setHintVisible(!hintVisible)}>{hintVisible ? 'Hide hint' : 'Show hint'}</button></section></> : <section className="ctf-challenge-panel ctf-complete"><div className="eyebrow">MATCH COMPLETE</div><h2>Round complete</h2><p>Your final score is {myScore} points. Check the rankings while other players finish.</p><button className="button quiet small" onClick={backToBriefing}>End match</button></section>}</main>
        <aside className="ctf-scoreboard"><div className="ctf-player-score"><div className="eyebrow">YOUR SCORE</div><strong>{myScore}<small>PTS</small></strong><span>{myPlacement ? `PLACEMENT ${myPlacement} / ${leaderboard.length}` : 'WAITING FOR PLAYERS'}</span></div><div className="ctf-list-heading">SCOREBOARD <span>{leaderboard.length}</span></div><div className="ctf-rankings">{leaderboard.map((player, index) => <div className={`score-row${player.isMe ? ' self' : ''}`} key={`${player.alias}-${index}`}><b>{String(index + 1).padStart(2, '0')}</b><span>{player.alias}{player.isMe && <small>YOU</small>}</span><strong>{player.score}</strong></div>)}</div>{mode === 'bots' && <p className="bot-note">Bots are scripted opponents. Their solve chance varies by difficulty.</p>}</aside>
      </div>
    </>}
  </>;
}
