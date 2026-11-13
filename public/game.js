const socket = io();
const $ = id => document.getElementById(id);
const screens = ['connect-screen','lobby-screen','game-screen'];
function show(id){ screens.forEach(s => $(s).classList.toggle('hidden', s !== id)); }
const characterNames = { inferno:'CINDER', frost:'FROST', volt:'VOLT', shadow:'SHADOW' };
let mySlot = null, roomCode = 'ARENA', chosen = 'inferno', latest = null, lobbyPlayers = [], keys = {}, countdownTimer = null;

$('join-btn').addEventListener('click', () => {
  $('connect-error').textContent = '';
  socket.emit('join-room', { code:$('room-code').value || 'ARENA', nickname:$('nickname').value || 'Lutador' });
});
socket.on('connect', () => {});
socket.on('join-error', msg => $('connect-error').textContent = msg);
socket.on('joined', data => { mySlot = data.slot; roomCode = data.code; $('lobby-room').textContent = roomCode; show('lobby-screen'); });

document.querySelectorAll('.fighter-card').forEach(card => card.addEventListener('click', () => {
  chosen = card.dataset.character;
  document.querySelectorAll('.fighter-card').forEach(c => c.classList.toggle('selected', c === card));
  socket.emit('choose-character', chosen);
  $('ready-info').textContent = 'Personagem selecionado. Aguardando o adversário...';
}));
function updateLobby(players){
  lobbyPlayers = players || [];
  const p1 = lobbyPlayers.find(p => p.slot === 0), p2 = lobbyPlayers.find(p => p.slot === 1);
  $('player-one-status').textContent = p1 ? `${p1.nickname} — ${p1.ready ? 'PRONTO' : 'escolhendo'}` : 'Aguardando...';
  $('player-two-status').textContent = p2 ? `${p2.nickname} — ${p2.ready ? 'PRONTO' : 'escolhendo'}` : 'Aguardando adversário...';
  $('ready-info').textContent = lobbyPlayers.length < 2 ? 'Compartilhe o código da sala com seu adversário.' : (lobbyPlayers.every(p => p.ready) ? 'Preparando combate...' : 'Os dois jogadores devem escolher um personagem.');
}
socket.on('lobby-update', updateLobby);
socket.on('match-start', () => {
  show('game-screen'); $('winner-overlay').classList.add('hidden'); $('countdown').classList.remove('hidden'); $('countdown').textContent = '3';
  let n = 3; clearInterval(countdownTimer); countdownTimer = setInterval(() => { n--; $('countdown').textContent = n > 0 ? n : 'FIGHT!'; if(n < 0){clearInterval(countdownTimer);$('countdown').classList.add('hidden');} }, 650);
});
socket.on('state', state => { latest = state; if(state.started || state.winner) show('game-screen'); updateHud(state); if(state.winner){const winner = state.players.find(p=>p.id===state.winner); $('winner-text').textContent = `${characterNames[winner?.character] || 'JOGADOR'} VENCEU!`; $('winner-overlay').classList.remove('hidden');} });
socket.on('opponent-left', () => { $('winner-text').textContent = 'ADVERSÁRIO DESCONECTOU'; $('winner-overlay').classList.remove('hidden'); });
socket.on('back-to-lobby', () => { $('winner-overlay').classList.add('hidden'); show('lobby-screen'); updateLobby(lobbyPlayers.map(p=>({...p,ready:false}))); });
$('rematch-btn').addEventListener('click', () => socket.emit('restart'));

const keyMap = {
  KeyA:'left', KeyD:'right', KeyW:'jump', KeyJ:'attack', KeyU:'kick', KeyI:'uppercut', KeyK:'special', KeyO:'power2', KeyP:'ultimate', KeyL:'block',
  ArrowLeft:'left2', ArrowRight:'right2', ArrowUp:'jump2', Digit1:'attack2', Digit4:'kick2', Digit5:'uppercut2', Digit2:'special2', Digit6:'power22', Digit7:'ultimate2', Digit3:'block2'
};
window.addEventListener('keydown', e => { if(keyMap[e.code]){e.preventDefault();keys[keyMap[e.code]]=true;} });
window.addEventListener('keyup', e => { if(keyMap[e.code]){e.preventDefault();keys[keyMap[e.code]]=false;} });
function updateCommandPanels(){
  $('commands-one').classList.toggle('local-player', mySlot === 0);
  $('commands-two').classList.toggle('local-player', mySlot === 1);
  $('commands-one').classList.toggle('remote-player', mySlot !== 0);
  $('commands-two').classList.toggle('remote-player', mySlot !== 1);
}
updateCommandPanels();
setInterval(() => {
  if(mySlot === null) return;
  const s = mySlot === 0 ? '' : '2';
  socket.emit('input', {
    left:!!keys['left'+s], right:!!keys['right'+s], jump:!!keys['jump'+s],
    attack:!!keys['attack'+s], kick:!!keys['kick'+s], uppercut:!!keys['uppercut'+s],
    special:!!keys['special'+s], power2:!!keys['power2'+s], ultimate:!!keys['ultimate'+s], block:!!keys['block'+s]
  });
}, 1000/30);
function updateHud(s){
  const a=s.players.find(p=>p.slot===0), b=s.players.find(p=>p.slot===1); if(!a||!b)return;
  $('health-one').style.width = `${a.hp}%`; $('health-two').style.width = `${b.hp}%`;
  $('name-one').textContent=characterNames[a.character]; $('name-two').textContent=characterNames[b.character];
}

// Renderização do cenário e dos lutadores no canvas
const canvas=$('game'), ctx=canvas.getContext('2d');
let frame=0;
const colors={inferno:'#ff593d',frost:'#5de4ff',volt:'#d7ff45',shadow:'#b68aff'};
function polygon(points, fill){ctx.fillStyle=fill;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fill();}
function drawBackground(){
  const g=ctx.createLinearGradient(0,0,0,560);g.addColorStop(0,'#10182b');g.addColorStop(.55,'#22253a');g.addColorStop(1,'#090d18');ctx.fillStyle=g;ctx.fillRect(0,0,1000,560);
  // lua/reator luminoso
  ctx.save();ctx.shadowBlur=45;ctx.shadowColor='#6c9bff';ctx.fillStyle='#8ca9d9';ctx.beginPath();ctx.arc(500,145,58,0,Math.PI*2);ctx.fill();ctx.restore();
  for(let i=0;i<12;i++){let x=i*95-20;ctx.fillStyle=i%2?'#151c30':'#1a2034';ctx.fillRect(x,190,58,260);ctx.fillStyle='#39415b';ctx.fillRect(x+8,210,4,190);ctx.fillRect(x+45,210,3,190);}
  // arcos de energia animados
  ctx.strokeStyle='#65dfff24';ctx.lineWidth=2;for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(500,440,120+i*45+Math.sin(frame*.025+i)*5,Math.PI,Math.PI*2);ctx.stroke();}
  ctx.fillStyle='#0a0d17';ctx.fillRect(0,450,1000,110);ctx.strokeStyle='#61e8ff66';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,451);ctx.lineTo(1000,451);ctx.stroke();
  for(let i=0;i<24;i++){let x=(i*53+frame*.35)%1000;ctx.fillStyle='#83dfff55';ctx.fillRect(x,455+(i%3)*15,2,2);}
  ctx.fillStyle='#11182a';ctx.fillRect(0,520,1000,40);ctx.strokeStyle='#37435b';ctx.beginPath();ctx.moveTo(0,520);ctx.lineTo(1000,520);ctx.stroke();
}
function drawFighter(p){
  const c=colors[p.character]||'#fff', x=p.x, y=p.y, face=p.facing;
  const bob=p.action==='idle'?Math.sin(frame*.08)*2:0;
  const palettes={
    inferno:{dark:'#351b22',mid:'#8f2f2b',light:'#ff7548',metal:'#f3b66d',skin:'#d99a78'},
    frost:{dark:'#142c42',mid:'#246b91',light:'#8beaff',metal:'#d5f7ff',skin:'#b8d7e8'},
    volt:{dark:'#283018',mid:'#687b24',light:'#dfff55',metal:'#efff9c',skin:'#d4b18b'},
    shadow:{dark:'#201735',mid:'#59417e',light:'#c5a0ff',metal:'#e5d6ff',skin:'#b99bb2'}
  };
  const a=palettes[p.character]||palettes.inferno;
  ctx.save();ctx.translate(x,y+bob);ctx.scale(face,1);
  // sombra e círculo de presença
  ctx.fillStyle='#0009';ctx.beginPath();ctx.ellipse(0,3,39,9,0,0,Math.PI*2);ctx.fill();
  if(['special','ultimate','power2'].includes(p.action)||p.blocking){ctx.save();ctx.globalAlpha=.17;ctx.strokeStyle=c;ctx.lineWidth=5;ctx.shadowBlur=28;ctx.shadowColor=c;ctx.beginPath();ctx.arc(0,-76,48+Math.sin(frame*.16)*5,0,Math.PI*2);ctx.stroke();ctx.restore();}
  // pernas com calça tática e joelheiras
  ctx.lineCap='round';ctx.lineJoin='round';
  ctx.strokeStyle=a.dark;ctx.lineWidth=17;ctx.beginPath();ctx.moveTo(-10,-49);ctx.lineTo(-16,-17);ctx.lineTo(-20,-7);ctx.moveTo(10,-49);ctx.lineTo(16,-17);ctx.lineTo(20,-7);ctx.stroke();
  ctx.strokeStyle=a.mid;ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(-14,-36);ctx.lineTo(-17,-17);ctx.moveTo(14,-36);ctx.lineTo(17,-17);ctx.stroke();
  ctx.fillStyle=a.metal;ctx.fillRect(-23,-23,13,7);ctx.fillRect(10,-23,13,7);
  // botas
  ctx.fillStyle='#101522';ctx.beginPath();ctx.roundRect(-30,-12,22,12,4);ctx.roundRect(8,-12,22,12,4);ctx.fill();
  ctx.fillStyle=a.light;ctx.fillRect(-28,-5,17,3);ctx.fillRect(11,-5,17,3);
  // tronco: jaqueta/armadura em camadas
  polygon([[-22,-108],[19,-108],[27,-58],[0,-43],[-27,-58]],a.dark);
  polygon([[-17,-104],[0,-98],[17,-104],[19,-61],[0,-50],[-19,-61]],a.mid);
  polygon([[-5,-99],[5,-99],[9,-57],[0,-53],[-9,-57]],a.dark);
  // placas do peito e costuras
  polygon([[-17,-94],[-3,-89],[-7,-73],[-19,-78]],a.light);
  polygon([[17,-94],[3,-89],[7,-73],[19,-78]],a.light);
  ctx.strokeStyle=a.metal;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-15,-67);ctx.lineTo(0,-61);ctx.lineTo(15,-67);ctx.stroke();
  // cinto e fivela
  ctx.fillStyle='#0b101b';ctx.fillRect(-23,-59,46,8);ctx.fillStyle=a.metal;ctx.fillRect(-5,-61,10,11);ctx.fillStyle=a.light;ctx.fillRect(-2,-58,4,5);
  // ombreiras
  ctx.fillStyle=a.metal;ctx.beginPath();ctx.moveTo(-23,-104);ctx.lineTo(-34,-96);ctx.lineTo(-27,-82);ctx.lineTo(-17,-91);ctx.fill();
  ctx.beginPath();ctx.moveTo(23,-104);ctx.lineTo(34,-96);ctx.lineTo(27,-82);ctx.lineTo(17,-91);ctx.fill();
  // braços articulados e manoplas
  const striking=['attack','kick','uppercut'].includes(p.action);
  ctx.strokeStyle=a.dark;ctx.lineWidth=14;ctx.beginPath();ctx.moveTo(-19,-94);ctx.lineTo(-31,-72);ctx.lineTo(-24,-57);ctx.stroke();
  ctx.strokeStyle=a.mid;ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(18,-94);ctx.lineTo(striking?43:29,p.action==='uppercut'?-111:p.action==='kick'?-54:-75);ctx.stroke();
  ctx.fillStyle='#111827';ctx.beginPath();ctx.roundRect(-31,-63,15,13,4);ctx.roundRect(striking?36:22,-82,17,15,4);ctx.fill();
  ctx.fillStyle=a.light;ctx.fillRect(-29,-60,11,3);ctx.fillRect(striking?39:25,-78,11,3);
  // pescoço, cabeça e máscara
  ctx.fillStyle=a.skin;ctx.fillRect(-7,-119,14,12);
  ctx.fillStyle=a.skin;ctx.beginPath();ctx.ellipse(0,-130,16,19,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=a.dark;ctx.beginPath();ctx.moveTo(-17,-132);ctx.lineTo(-13,-148);ctx.lineTo(0,-153);ctx.lineTo(15,-146);ctx.lineTo(18,-130);ctx.lineTo(9,-137);ctx.lineTo(-8,-137);ctx.closePath();ctx.fill();
  // visor luminoso
  ctx.fillStyle='#080d18';ctx.beginPath();ctx.roundRect(-15,-135,30,9,4);ctx.fill();
  ctx.shadowBlur=10;ctx.shadowColor=a.light;ctx.fillStyle=a.light;ctx.fillRect(-10,-132,7,3);ctx.fillRect(4,-132,7,3);ctx.shadowBlur=0;
  // detalhes de identidade: lenço/capuz e faixa nas costas
  if(p.character==='shadow') {polygon([[-15,-110],[-30,-91],[-25,-48],[-10,-63]],a.mid);}
  if(p.character==='volt') {ctx.strokeStyle=a.light;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-2,-102);ctx.lineTo(8,-87);ctx.lineTo(-1,-76);ctx.stroke();}
  if(p.character==='frost') {ctx.fillStyle=a.light;ctx.beginPath();ctx.moveTo(-19,-112);ctx.lineTo(-34,-126);ctx.lineTo(-24,-105);ctx.fill();}
  if(p.character==='inferno') {ctx.fillStyle=a.light;ctx.beginPath();ctx.moveTo(-13,-145);ctx.lineTo(-22,-158);ctx.lineTo(-4,-149);ctx.moveTo(8,-147);ctx.lineTo(22,-158);ctx.lineTo(14,-139);ctx.fill();}
  // escudo em arco à frente do corpo
  if(p.blocking){ctx.save();ctx.strokeStyle='#a8f7ff';ctx.fillStyle='#61e8ff24';ctx.shadowBlur=28;ctx.shadowColor='#61e8ff';ctx.lineWidth=5;ctx.beginPath();ctx.arc(13,-79,51,-1.32,1.32);ctx.stroke();ctx.beginPath();ctx.arc(13,-79,45,-1.32,1.32);ctx.fill();ctx.restore();}
  if(p.hitFlash>0){ctx.globalAlpha=.48;ctx.fillStyle='white';ctx.fillRect(-34,-158,68,158);}
  ctx.restore();
  ctx.save();ctx.fillStyle='#ffffffcc';ctx.font='bold 11px Orbitron';ctx.textAlign='center';ctx.shadowBlur=5;ctx.shadowColor='#000';ctx.fillText(characterNames[p.character],x,y+25);ctx.restore();
}
function draw(){requestAnimationFrame(draw);frame++;drawBackground();if(latest){latest.projectiles.forEach(s=>{ctx.save();ctx.translate(s.x,s.y);ctx.rotate(frame*.08*(s.vx>0?1:-1));ctx.shadowBlur=s.kind==='ultimate'?42:27;ctx.shadowColor=s.color;ctx.fillStyle=s.color;ctx.beginPath();if(s.kind==='heavy'){ctx.moveTo(0,-s.radius);ctx.lineTo(s.radius,0);ctx.lineTo(0,s.radius);ctx.lineTo(-s.radius,0);}else{ctx.arc(0,0,s.radius,0,Math.PI*2);}ctx.closePath();ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=s.kind==='ultimate'?4:2;ctx.beginPath();ctx.arc(0,0,s.radius+6,0,Math.PI*2);ctx.stroke();if(s.kind==='ultimate'){ctx.globalAlpha=.35;ctx.fillStyle=s.color;ctx.fillRect(-s.radius*2,-3,s.radius*4,6);}ctx.restore();});latest.players.forEach(drawFighter);}else{ctx.fillStyle='#ffffff55';ctx.font='16px Orbitron';ctx.textAlign='center';ctx.fillText('AGUARDANDO CONEXÃO...',500,290);}}
draw();
