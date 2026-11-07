import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { networkInterfaces } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { generateChallenges, publicChallenges } from './server/ctfGenerator.mjs';

const rooms = new Map();
const sessions = new Map();
const roundCounterPath = resolve('.ctf-round-counter');
const savedRoundCounter = existsSync(roundCounterPath) ? Number(readFileSync(roundCounterPath, 'utf8')) : 0;
if (!Number.isSafeInteger(savedRoundCounter) || savedRoundCounter < 0) throw new Error('Invalid CTF round counter.');
let roundCounter = savedRoundCounter;
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm' };
const args = process.argv.slice(2);
const argValue = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const apiOnly = args.includes('--api-only');
const host = argValue('--host', '127.0.0.1');
const port = Number(argValue('--port', apiOnly ? '4174' : '4173'));

function reply(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

function safeAlias(value) {
  return String(value || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 20) || 'Player';
}

function newCode() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do { code = Array.from(randomBytes(6), (byte) => alphabet[byte % alphabet.length]).join(''); } while (rooms.has(code));
  return code;
}

function makeSession(difficulty, alias) {
  const player = { id: randomUUID(), alias: safeAlias(alias), solved: [] };
  roundCounter += 1;
  writeFileSync(roundCounterPath, String(roundCounter));
  const session = { id: randomUUID(), roundNumber: roundCounter, difficulty, challenges: generateChallenges(difficulty, roundCounter), players: [player], expiresAt: Date.now() + 4 * 60 * 60 * 1000 };
  sessions.set(session.id, session);
  return { session, player };
}

function publicPlayers(players, challenges) {
  return players.map(({ id, alias, solved }) => ({ id, alias, solved, score: solved.reduce((total, challengeId) => total + (challenges.find((challenge) => challenge.id === challengeId)?.points || 0), 0) }));
}

function publicSession(session, playerId) {
  return { sessionId: session.id, roundNumber: session.roundNumber, difficulty: session.difficulty, challenges: publicChallenges(session.challenges), players: publicPlayers(session.players, session.challenges), playerId };
}

function publicRoom(room, playerId) {
  return {
    code: room.code,
    roundNumber: room.session.roundNumber,
    difficulty: room.session.difficulty,
    challenges: publicChallenges(room.session.challenges),
    players: publicPlayers(room.session.players, room.session.challenges),
    playerId,
    isHost: playerId === room.hostId,
    expiresAt: room.expiresAt,
  };
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 4096) throw new Error('Request too large');
  }
  return body ? JSON.parse(body) : {};
}

async function handleApi(request, response, url) {
  if (request.method === 'POST' && url.pathname === '/api/ctf/start') {
    const { difficulty, alias } = await readBody(request);
    if (!['Easy', 'Medium', 'High'].includes(difficulty)) return reply(response, 400, { error: 'Choose Easy, Medium, or High difficulty.' });
    const { session, player } = makeSession(difficulty, alias);
    return reply(response, 201, publicSession(session, player.id));
  }
  const soloSubmit = url.pathname.match(/^\/api\/ctf\/sessions\/([a-f0-9-]+)\/submit$/);
  if (request.method === 'POST' && soloSubmit) {
    const session = sessions.get(soloSubmit[1]);
    if (!session || session.expiresAt < Date.now()) return reply(response, 404, { error: 'Game not found or expired.' });
    const { challengeId, flag } = await readBody(request);
    const challenge = session.challenges.find((item) => item.id === challengeId);
    const player = session.players[0];
    if (!challenge) return reply(response, 404, { error: 'Challenge not found.' });
    const correct = String(flag || '').trim().toLowerCase() === challenge.answer.toLowerCase();
    if (correct && !player.solved.includes(challenge.id)) player.solved.push(challenge.id);
    return reply(response, 200, { correct, explanation: correct ? challenge.explanation : undefined, game: publicSession(session, player.id) });
  }

  if (request.method === 'POST' && url.pathname === '/api/rooms') {
    if (rooms.size >= 50) return reply(response, 429, { error: 'Room limit reached. Try again later.' });
    const { alias, difficulty } = await readBody(request);
    if (!['Easy', 'Medium', 'High'].includes(difficulty)) return reply(response, 400, { error: 'Choose Easy, Medium, or High difficulty.' });
    const code = newCode();
    const { session, player } = makeSession(difficulty, alias);
    const room = { code, hostId: player.id, session, expiresAt: session.expiresAt };
    rooms.set(code, room);
    return reply(response, 201, publicRoom(room, player.id));
  }

  const roomPath = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)(?:\/(join|submit))?$/);
  if (roomPath) {
    const [, code, action] = roomPath;
    const room = rooms.get(code);
    if (!room || room.expiresAt < Date.now()) { rooms.delete(code); return reply(response, 404, { error: 'Room not found or expired.' }); }
    if (request.method === 'POST' && action === 'join') {
      if (room.session.players.length >= 40) return reply(response, 429, { error: 'This room is full.' });
      const { alias } = await readBody(request);
      const player = { id: randomUUID(), alias: safeAlias(alias), solved: [] };
      room.session.players.push(player);
      room.expiresAt = Date.now() + 4 * 60 * 60 * 1000;
      return reply(response, 201, publicRoom(room, player.id));
    }
    if (request.method === 'GET' && !action) {
      const playerId = url.searchParams.get('playerId');
      if (!room.session.players.some((player) => player.id === playerId)) return reply(response, 403, { error: 'Player is not in this room.' });
      return reply(response, 200, publicRoom(room, playerId));
    }
    if (request.method === 'POST' && action === 'submit') {
      const { playerId, challengeId, flag } = await readBody(request);
      const player = room.session.players.find((item) => item.id === playerId);
      const challenge = room.session.challenges.find((item) => item.id === challengeId);
      if (!player) return reply(response, 403, { error: 'Player is not in this room.' });
      if (!challenge) return reply(response, 404, { error: 'Challenge not found.' });
      const correct = String(flag || '').trim().toLowerCase() === challenge.answer.toLowerCase();
      if (correct && !player.solved.includes(challenge.id)) player.solved.push(challenge.id);
      return reply(response, 200, { correct, alreadySolved: player.solved.includes(challenge.id) && correct, explanation: correct ? challenge.explanation : undefined, room: publicRoom(room, player.id) });
    }
  }
  return reply(response, 404, { error: 'Not found.' });
}

async function handle(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    try { return await handleApi(request, response, url); }
    catch { return reply(response, 400, { error: 'Invalid request.' }); }
  }
  if (apiOnly) return reply(response, 404, { error: 'Not found.' });
  const root = resolve('dist');
  if (!existsSync(join(root, 'index.html'))) return reply(response, 503, { error: 'Build the app first with npm run build.' });
  const decodedPath = decodeURIComponent(url.pathname);
  const requested = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  let file = resolve(root, requested);
  if (file !== root && !file.startsWith(`${root}${sep}`)) return reply(response, 403, { error: 'Forbidden.' });
  if (!existsSync(file)) file = join(root, 'index.html');
  response.writeHead(200, { 'content-type': mimeTypes[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  response.end(readFileSync(file));
}

setInterval(() => { for (const [code, room] of rooms) if (room.expiresAt < Date.now()) { rooms.delete(code); sessions.delete(room.session.id); } for (const [id, session] of sessions) if (session.expiresAt < Date.now()) sessions.delete(id); }, 60_000).unref();
createServer((request, response) => { handle(request, response).catch(() => reply(response, 500, { error: 'Server error.' })); }).listen(port, host, () => {
  console.log(`CTF classroom server: http://${host}:${port}`);
  if (!apiOnly && host === '0.0.0.0') {
    for (const addresses of Object.values(networkInterfaces())) for (const address of addresses || []) if (address.family === 'IPv4' && !address.internal) console.log(`Classroom address: http://${address.address}:${port}`);
  }
});
