const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3001;
const W = 1000, FLOOR = 510;
const CHARACTERS = {
  inferno: { name: 'CINDER', color: '#ff593d', speed: 4.4, power: 13, projectile: '#ff713b' },
  frost:   { name: 'FROST',   color: '#5de4ff', speed: 4.0, power: 11, projectile: '#8cf4ff' },
  volt:    { name: 'VOLT',    color: '#d7ff45', speed: 5.0, power: 10, projectile: '#eaff65' },
  shadow:  { name: 'SHADOW',  color: '#b68aff', speed: 4.6, power: 15, projectile: '#c6a0ff' }
};
const rooms = new Map();

function freshPlayer(id, slot) {
  return { id, slot, x: slot === 0 ? 230 : 770, y: FLOOR, vx: 0, vy: 0, hp: 100,
    facing: slot === 0 ? 1 : -1, character: slot === 0 ? 'inferno' : 'frost',
    input: {}, attackCd: 0, kickCd: 0, uppercutCd: 0, specialCd: 0, power2Cd: 0, ultimateCd: 0, hitFlash: 0, blocking: false, action: 'idle' };
}
function getRoom(code) {
  if (!rooms.has(code)) rooms.set(code, { code, players: [], projectiles: [], started: false, winner: null, lastTick: Date.now() });
  return rooms.get(code);
}
function publicState(room) {
  return { players: room.players.map(p => ({ id:p.id, slot:p.slot, x:p.x, y:p.y, hp:p.hp, facing:p.facing,
    character:p.character, action:p.action, blocking:p.blocking, hitFlash:p.hitFlash })),
    projectiles: room.projectiles.map(p => ({ x:p.x, y:p.y, vx:p.vx, color:p.color, owner:p.owner, radius:p.radius, kind:p.kind })),
    started: room.started, winner: room.winner };
}
function startRoom(room) {
  if (room.players.length === 2 && room.players.every(p => p.ready)) {
    room.started = true; room.winner = null; room.projectiles = [];
    room.players.forEach((p, i) => { p.x = i === 0 ? 230 : 770; p.y = FLOOR; p.vy = 0; p.hp = 100; p.attackCd = 0; p.kickCd = 0; p.uppercutCd = 0; p.specialCd = 0; p.power2Cd = 0; p.ultimateCd = 0; p.action = 'idle'; });
    io.to(room.code).emit('match-start');
  }
}
function tick(room) {
  if (!room.started || room.winner) return;
  for (const p of room.players) {
    const enemy = room.players.find(q => q.id !== p.id);
    if (!enemy) continue;
    p.facing = enemy.x >= p.x ? 1 : -1;
    p.vx = 0;
    if (p.input.left) p.vx = -CHARACTERS[p.character].speed;
    if (p.input.right) p.vx = CHARACTERS[p.character].speed;
    p.blocking = !!p.input.block && p.y >= FLOOR - 2;
    if (p.blocking) p.vx *= 0.35;
    p.x = Math.max(55, Math.min(W - 55, p.x + p.vx));
    if (p.input.jump && p.y >= FLOOR) { p.vy = -14; p.action = 'jump'; }
    p.vy += 0.72; p.y += p.vy;
    if (p.y > FLOOR) { p.y = FLOOR; p.vy = 0; }

    for (const cd of ['attackCd','kickCd','uppercutCd','specialCd','power2Cd','ultimateCd','hitFlash']) if (p[cd] > 0) p[cd]--;

    const melee = (field, cd, damage, range, action, lift=0) => {
      if (!p.input[field] || p[cd] > 0) return;
      p[cd] = field === 'attack' ? 22 : field === 'kick' ? 34 : 48;
      p.action = action;
      if (Math.abs(enemy.x - p.x) < range && Math.abs(enemy.y - p.y) < 105) {
        const reduced = enemy.blocking ? Math.max(1, Math.ceil(damage * 0.18)) : damage;
        enemy.hp = Math.max(0, enemy.hp - reduced);
        if (!enemy.blocking && lift) enemy.vy = -lift;
        enemy.hitFlash = 9;
      }
    };
    melee('attack','attackCd',7,112,'attack');
    melee('kick','kickCd',10,142,'kick');
    melee('uppercut','uppercutCd',13,105,'uppercut',8);

    const shoot = (field, cd, cooldown, spec) => {
      if (!p.input[field] || p[cd] > 0) return;
      p[cd] = cooldown; p.action = 'special';
      room.projectiles.push({ x:p.x + p.facing * 48, y:p.y - (spec.height || 76), vx:p.facing * spec.speed, color:spec.color, owner:p.id, radius:spec.radius, damage:spec.damage, kind:spec.kind, life:spec.life || 130 });
    };
    const c = CHARACTERS[p.character];
    shoot('special','specialCd',78,{kind:'orb',speed:10,radius:13,damage:c.power,color:c.projectile});
    shoot('power2','power2Cd',150,{kind:'heavy',speed:7,radius:22,damage:19,color:c.color, height:86,life:150});
    shoot('ultimate','ultimateCd',300,{kind:'ultimate',speed:13,radius:29,damage:27,color:'#ffffff',height:76,life:150});

    if (!p.input.attack && !p.input.kick && !p.input.uppercut && !p.input.special && !p.input.power2 && !p.input.ultimate && p.y === FLOOR)
      p.action = p.blocking ? 'block' : (p.vx ? 'run' : 'idle');
  }
  for (const shot of room.projectiles) {
    shot.x += shot.vx; shot.life--;
    const target = room.players.find(p => p.id !== shot.owner);
    if (target && Math.abs(shot.x - target.x) < 42 + shot.radius * 0.35 && Math.abs(shot.y - (target.y - 75)) < 72 + shot.radius * 0.25) {
      const damage = target.blocking ? Math.max(1, Math.ceil(shot.damage * 0.18)) : shot.damage;
      target.hp = Math.max(0, target.hp - damage);
      if (!target.blocking && shot.kind === 'ultimate') target.vy = -5;
      target.hitFlash = 12; shot.dead = true;
    }
    if (shot.x < -50 || shot.x > W + 50 || shot.life <= 0) shot.dead = true;
  }
  room.projectiles = room.projectiles.filter(s => !s.dead);
  const defeated = room.players.find(p => p.hp <= 0);
  if (defeated) { room.winner = room.players.find(p => p.id !== defeated.id)?.id || null; room.started = false; }
}

io.on('connection', socket => {
  let room = null;
  socket.on('join-room', ({ code, nickname }) => {
    code = String(code || 'ARENA').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12) || 'ARENA';
    const candidate = getRoom(code);
    if (candidate.players.length >= 2) { socket.emit('join-error', 'Essa sala já está cheia. Use outro código.'); return; }
    if (candidate.players.some(p => p.id === socket.id)) return;
    room = candidate; socket.join(code);
    const player = freshPlayer(socket.id, room.players.length);
    player.nickname = String(nickname || `Lutador ${player.slot + 1}`).slice(0, 16);
    room.players.push(player);
    socket.emit('joined', { slot: player.slot, code, players: room.players.map(p => ({ slot:p.slot, nickname:p.nickname, character:p.character, ready:p.ready || false })) });
    io.to(code).emit('lobby-update', room.players.map(p => ({ slot:p.slot, nickname:p.nickname, character:p.character, ready:p.ready || false })));
  });
  socket.on('choose-character', key => {
    if (!room || !CHARACTERS[key]) return;
    const p = room.players.find(p => p.id === socket.id); if (!p || room.started) return;
    p.character = key; p.ready = true;
    io.to(room.code).emit('lobby-update', room.players.map(p => ({ slot:p.slot, nickname:p.nickname, character:p.character, ready:p.ready || false })));
    startRoom(room);
  });
  socket.on('input', data => {
    if (!room || !room.started) return;
    const p = room.players.find(p => p.id === socket.id); if (p) p.input = data || {};
  });
  socket.on('restart', () => {
    if (!room || room.players.length !== 2) return;
    room.players.forEach(p => { p.ready = false; p.hp = 100; }); room.winner = null; room.started = false; room.projectiles = [];
    io.to(room.code).emit('back-to-lobby');
  });
  socket.on('disconnect', () => {
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    room.started = false; room.projectiles = []; room.winner = null;
    io.to(room.code).emit('opponent-left');
    io.to(room.code).emit('lobby-update', room.players.map(p => ({ slot:p.slot, nickname:p.nickname, character:p.character, ready:false })));
    if (!room.players.length) rooms.delete(room.code);
  });
});
setInterval(() => { for (const room of rooms.values()) { tick(room); if (room.players.length) io.to(room.code).emit('state', publicState(room)); } }, 1000 / 30);
server.listen(PORT, '0.0.0.0', () => console.log(`\n⚔ ARENA rodando em http://localhost:${PORT}\n`));
