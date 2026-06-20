const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const select = document.querySelector("#select");
const grid = document.querySelector("#characterGrid");
const heroName = document.querySelector("#heroName");
const heroPower = document.querySelector("#heroPower");
const scoreEl = document.querySelector("#score");
const preIntro = document.querySelector("#preIntro");
const intro = document.querySelector("#intro");
const enterIntroBtn = document.querySelector("#enterIntroBtn");
const startGameBtn = document.querySelector("#startGameBtn");
const announcement = document.querySelector("#announcement");
const music = document.querySelector("#music");

const keys = new Set();
const held = { left: false, right: false, jump: false, special: false };
const pointer = { active: false, x: 0, y: 0, worldX: 0, worldY: 0 };

const state = {
  dpr: 1,
  width: 0,
  height: 0,
  cameraX: 0,
  selected: null,
  hero: null,
  images: new Map(),
  blocks: [],
  targets: [],
  healingKits: [],
  shields: [],
  stars: [],
  hazards: [],
  phenomena: [],
  backgroundStars: [],
  particles: [],
  launched: false,
  aiming: false,
  chargeStartedAt: 0,
  chargePower: 0,
  score: 0,
  won: false,
  gameOver: false,
  cooldown: 0,
  message: "Click here to begin.",
  messageTimer: 0,
  last: performance.now()
};

const world = {
  width: 27500,
  groundY: 0,
  gravity: 1450,
  friction: 0.83,
  chargeTimeMs: 650,
  slingMinLaunch: 520,
  slingMaxLaunch: 5320,
  slingMaxVisibleRise: 0.88,
  launchAngleRadians: (30 * Math.PI) / 180,
  jumpAngleRadians: (50 * Math.PI) / 180,
  jumpBoostMultiplier: 0.675,
  slingX: 180,
  slingY: 0
};

function resize() {
  state.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  canvas.width = Math.floor(state.width * state.dpr);
  canvas.height = Math.floor(state.height * state.dpr);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  const isLandscapePhone = state.width > state.height && state.height <= 540;
  world.groundY = isLandscapePhone ? state.height - 72 : Math.max(420, state.height - 112);
  world.slingY = world.groundY - 132;
  if (state.hero && !state.launched) {
    state.hero.x = world.slingX;
    state.hero.y = world.slingY;
  }
  buildLevel();
}

async function boot() {
  const data = { characters: window.PRIMA_CHARACTERS || [] };
  await Promise.all(
    data.characters.map(async (character) => {
      const image = new Image();
      image.src = character.asset;
      await image.decode();
      state.images.set(character.id, image);
    })
  );
  makeCharacterGrid(data.characters);
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(tick);
}

function makeCharacterGrid(characters) {
  grid.innerHTML = "";
  for (const character of characters) {
    const button = document.createElement("button");
    button.className = "character-card";
    button.type = "button";
    button.innerHTML = `
      <img alt="" src="${character.asset}" />
      <span>
        <strong>${character.name}</strong>
        <span>${character.title}</span>
      </span>
    `;
    button.addEventListener("click", () => chooseCharacter(character));
    grid.append(button);
  }
}

function chooseCharacter(character) {
  state.selected = character;
  state.launched = false;
  state.aiming = false;
  state.chargeStartedAt = 0;
  state.chargePower = 0;
  state.score = 0;
  state.won = false;
  state.gameOver = false;
  state.cooldown = 0;
  state.cameraX = 0;
  state.particles = [];
  state.hero = {
    x: world.slingX,
    y: world.slingY,
    vx: 0,
    vy: 0,
    w: character.physics.width,
    h: character.physics.height,
    hp: 100,
    maxHp: 100,
    healingOverTime: 0,
    healingTimeLeft: 0,
    damageCooldown: 0,
    shieldTimer: 0,
    grounded: false,
    facing: 1,
    animTime: Math.random() * Math.PI * 2,
    landingBounce: 0,
    jumpStretch: 0,
    tapJumpCooldown: 0,
    specialFlash: 0
  };
  buildLevel(true);
  announce("Hold at the launch station, release to fire toward the space station.");
  updateHud();
  select.classList.add("is-hidden");
}

function buildLevel(force = false) {
  if (state.blocks.length && !force) return;
  state.blocks = [];
  state.targets = [];
  state.healingKits = [];
  state.shields = [];
  state.stars = [];
  state.hazards = [];
  state.phenomena = [];
  state.backgroundStars = [];

  for (let i = 0; i < 900; i += 1) {
    state.backgroundStars.push(backgroundStar(i));
  }

  for (let x = 820; x < world.width - 1000; x += 720) {
    state.stars.push(star(x, world.groundY - 150 - (x % 3) * 34));
  }

  for (let x = 2050; x < world.width - 1400; x += 3100) {
    state.targets.push(target(x, world.groundY - 138));
  }

  for (let x = 1250; x < world.width - 900; x += 1350) {
    const yOffset = 82 + ((x / 1350) % 4) * 34;
    state.healingKits.push(healingKit(x + 420, world.groundY - yOffset));
  }

  for (let x = 2850; x < world.width - 1600; x += 4300) {
    const yOffset = 126 + ((x / 4300) % 2) * 58;
    state.shields.push(shieldPickup(x + 260, world.groundY - yOffset));
  }

  for (let x = 3800; x < world.width - 1800; x += 2700) {
    state.phenomena.push(phenomenon(x, world.groundY - 310, -245, 155, 34, 10, "meteor"));
    state.phenomena.push(phenomenon(x + 1180, world.groundY - 460, -310, 190, 26, 10, "comet"));
  }
}

function block(x, y, w, h, hp, color) {
  return { x, y, w, h, hp, maxHp: hp, color, alive: true, shake: 0 };
}

function target(x, y) {
  return { x, y, r: 28, alive: true, wobble: 0 };
}

function healingKit(x, y) {
  return { x, y, w: 42, h: 34, alive: true, pulse: Math.random() * Math.PI * 2 };
}

function shieldPickup(x, y) {
  return { x, y, r: 24, alive: true, pulse: Math.random() * Math.PI * 2 };
}

function spaceRock(x, y, r, damage, kind) {
  return { x, y, r, damage, kind, spin: Math.random() * Math.PI * 2, cooldown: 0 };
}

function phenomenon(x, y, vx, vy, r, damage, kind) {
  return { x, y, originX: x, originY: y, vx, vy, r, damage, kind, spin: Math.random() * Math.PI * 2, cooldown: 0 };
}

function star(x, y) {
  return { x, y, r: 15, alive: true, spin: Math.random() * 6 };
}

function backgroundStar(i) {
  const x = (fract(Math.sin(i * 91.73) * 43758.5453) * world.width);
  const yBand = Math.max(120, world.groundY - 80);
  const y = 18 + fract(Math.sin(i * 47.19 + 3.4) * 12937.831) * yBand;
  const size = 0.8 + fract(Math.sin(i * 13.91 + 9.7) * 9371.42) * 2.2;
  const twinkle = 0.7 + fract(Math.sin(i * 31.13 + 1.2) * 7131.17) * 2.4;
  const phase = fract(Math.sin(i * 67.77) * 3133.7) * Math.PI * 2;
  const layer = 0.08 + fract(Math.sin(i * 19.83) * 2719.1) * 0.22;
  return { x, y, size, twinkle, phase, layer };
}

function fract(value) {
  return value - Math.floor(value);
}

function tick(now) {
  const dt = Math.min(0.033, (now - state.last) / 1000);
  state.last = now;
  update(dt);
  draw();
  requestAnimationFrame(tick);
}

function update(dt) {
  if (!state.hero) return;
  const hero = state.hero;
  const stats = state.selected.movement;
  state.cooldown = Math.max(0, state.cooldown - dt);
  state.messageTimer = Math.max(0, state.messageTimer - dt);
  hero.animTime += dt;
  hero.landingBounce = Math.max(0, hero.landingBounce - dt * 4.8);
  hero.jumpStretch = Math.max(0, hero.jumpStretch - dt * 5.4);
  hero.tapJumpCooldown = Math.max(0, hero.tapJumpCooldown - dt);
  hero.damageCooldown = Math.max(0, hero.damageCooldown - dt);
  hero.shieldTimer = Math.max(0, hero.shieldTimer - dt);
  updateHealingOverTime(hero, dt);
  hero.specialFlash = Math.max(0, hero.specialFlash - dt);
  if (state.aiming) state.chargePower = getChargeRatio();

  if (state.launched && !state.gameOver && !state.won) {
    const move = (keys.has("ArrowRight") || keys.has("KeyD") || held.right ? 1 : 0) -
      (keys.has("ArrowLeft") || keys.has("KeyA") || held.left ? 1 : 0);
    const control = hero.grounded ? 1 : stats.airControl;
    hero.vx += move * stats.speed * 5.3 * control * dt;
    hero.vx = clamp(hero.vx, -900, 1260);
    hero.facing = move ? Math.sign(move) : hero.facing;

    if ((keys.has("Space") || keys.has("ArrowUp") || keys.has("KeyW") || held.jump) && hero.grounded) {
      makeHeroJump();
    }

    if ((keys.has("KeyE") || held.special) && state.cooldown <= 0) {
      useSpecial();
    }

    hero.vy += world.gravity * dt;
    hero.x += hero.vx * dt;
    hero.y += hero.vy * dt;
    hero.vx *= move ? 0.992 : hero.grounded ? 0.94 : 0.985;
    if (!move && hero.grounded && Math.abs(hero.vx) < 4) hero.vx = 0;
    const wasGrounded = hero.grounded;
    resolveWorld(hero);
    if (!wasGrounded && hero.grounded) hero.landingBounce = 1;
    hitBlocks(hero);
    hitHealingFaces(hero);
    collectHealingKits(hero);
    collectShields(hero);
    collectStars(hero);
    hitHazards(hero, dt);
    updatePhenomena(dt);
    checkFinish(hero);
  }

  for (const p of state.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 480 * dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  state.cameraX += (clamp(hero.x - state.width * 0.38, 0, world.width - state.width) - state.cameraX) * 0.08;
  updateAnnouncement();
}

function resolveWorld(hero) {
  hero.grounded = false;
  if (hero.y + hero.h / 2 >= world.groundY) {
    hero.y = world.groundY - hero.h / 2;
    hero.vy = Math.min(0, hero.vy) * -0.12;
    hero.grounded = true;
  }
  if (hero.x - hero.w / 2 < 20) {
    hero.x = 20 + hero.w / 2;
    hero.vx *= -0.2;
  }
  if (hero.x + hero.w / 2 > world.width - 20) {
    hero.x = world.width - 20 - hero.w / 2;
    hero.vx *= -0.2;
  }
}

function hitBlocks(hero) {
  for (const b of state.blocks) {
    if (!b.alive || !rectsOverlap(hero.x - hero.w / 2, hero.y - hero.h / 2, hero.w, hero.h, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h)) {
      continue;
    }
    const impact = Math.hypot(hero.vx, hero.vy) * state.selected.physics.mass;
    if (impact > 170) {
      damageBlock(b, impact > 460 ? 2 : 1);
      burst(b.x, b.y, b.color, 8);
    }
    const dx = hero.x - b.x;
    const dy = hero.y - b.y;
    if (Math.abs(dx / b.w) > Math.abs(dy / b.h)) {
      hero.x += Math.sign(dx || 1) * 18;
      hero.vx *= -0.38;
    } else {
      hero.y += Math.sign(dy || -1) * 18;
      hero.vy *= -0.32;
      if (dy < 0) hero.grounded = true;
    }
  }
}

function hitHealingFaces(hero) {
  for (const t of state.targets) {
    if (!t.alive) continue;
    if (Math.hypot(hero.x - t.x, hero.y - t.y) < t.r + hero.w * 0.45) {
      t.alive = false;
      healHero(15, "Smiley face restored 15 HP.");
      state.score += 50;
      burst(t.x, t.y, "#62ff8f", 18);
      updateHud();
    }
  }
}

function collectHealingKits(hero) {
  for (const kit of state.healingKits) {
    if (!kit.alive) continue;
    kit.pulse += 0.08;
    if (rectsOverlap(
      hero.x - hero.w / 2,
      hero.y - hero.h / 2,
      hero.w,
      hero.h,
      kit.x - kit.w / 2,
      kit.y - kit.h / 2,
      kit.w,
      kit.h
    )) {
      kit.alive = false;
      startHealingOverTime(10, 5, "Medikit healing: 10 HP over 5 seconds.");
      state.score += 35;
      burst(kit.x, kit.y, "#62ff8f", 18);
      updateHud();
    }
  }
}

function collectShields(hero) {
  for (const shield of state.shields) {
    if (!shield.alive) continue;
    shield.pulse += 0.08;
    if (Math.hypot(hero.x - shield.x, hero.y - shield.y) < shield.r + hero.w * 0.45) {
      shield.alive = false;
      hero.shieldTimer = 4;
      hero.specialFlash = Math.max(hero.specialFlash, 0.45);
      announce("Shield active: damage blocked for 4 seconds.");
      burst(shield.x, shield.y, "#62ff8f", 22);
      updateHud();
    }
  }
}

function collectStars(hero) {
  for (const s of state.stars) {
    if (!s.alive) continue;
    s.spin += 0.08;
    if (Math.hypot(hero.x - s.x, hero.y - s.y) < s.r + hero.w * 0.44) {
      s.alive = false;
      state.score += 25;
      burst(s.x, s.y, "#ffd84f", 10);
      updateHud();
    }
  }
}

function damageBlock(b, amount) {
  b.hp -= amount;
  b.shake = 0.16;
  if (b.hp <= 0) {
    b.alive = false;
    state.score += 40;
    updateHud();
  }
}

function hitHazards(hero, dt) {
  for (const h of state.hazards) {
    h.spin += dt * 1.8;
    h.cooldown = Math.max(0, h.cooldown - dt);
    if (h.cooldown <= 0 && Math.hypot(hero.x - h.x, hero.y - h.y) < h.r + hero.w * 0.42) {
      damageHero(h.damage, `${h.kind === "asteroid" ? "Asteroid" : "Space rock"} hit: -${h.damage} HP.`);
      h.cooldown = 0.7;
      hero.vx *= -0.35;
      hero.vy = Math.min(hero.vy, -300);
    }
  }
}

function updatePhenomena(dt) {
  for (const p of state.phenomena) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.spin += dt * 5;
    p.cooldown = Math.max(0, p.cooldown - dt);
    if (p.y > world.groundY + 160 || p.x < p.originX - 1200) {
      p.x = p.originX + 1200;
      p.y = p.originY - Math.random() * 180;
    }
    if (p.cooldown <= 0 && Math.hypot(state.hero.x - p.x, state.hero.y - p.y) < p.r + state.hero.w * 0.38) {
      damageHero(p.damage, `${p.kind === "comet" ? "Comet" : "Meteor"} strike: -${p.damage} HP.`);
      p.cooldown = 0.6;
      burst(p.x, p.y, p.kind === "comet" ? "#9ee7ff" : "#ff9b4a", 14);
    }
  }
}

function damageHero(amount, message) {
  const hero = state.hero;
  if (!hero || hero.damageCooldown > 0 || state.gameOver || state.won) return;
  if (hero.shieldTimer > 0) {
    hero.damageCooldown = 0.25;
    hero.specialFlash = Math.max(hero.specialFlash, 0.25);
    announce("Shield blocked the damage.");
    burst(hero.x, hero.y, "#62ff8f", 12);
    return;
  }
  hero.hp = clamp(hero.hp - amount, 0, hero.maxHp);
  hero.damageCooldown = 0.55;
  hero.specialFlash = 0.35;
  announce(message);
  burst(hero.x, hero.y, "#ff4d5d", 16);
  updateHud();
  if (hero.hp <= 0) {
    state.gameOver = true;
    announce("Hero down. Reset to try again.");
  }
}

function healHero(amount, message) {
  const hero = state.hero;
  hero.hp = clamp(hero.hp + amount, 0, hero.maxHp);
  announce(message);
}

function startHealingOverTime(amount, seconds, message) {
  const hero = state.hero;
  hero.healingOverTime += amount;
  hero.healingTimeLeft = Math.max(hero.healingTimeLeft, seconds);
  announce(message);
}

function updateHealingOverTime(hero, dt) {
  if (hero.healingOverTime <= 0 || hero.healingTimeLeft <= 0 || hero.hp >= hero.maxHp) return;
  const tickHeal = Math.min(hero.healingOverTime, (10 / 5) * dt);
  hero.hp = clamp(hero.hp + tickHeal, 0, hero.maxHp);
  hero.healingOverTime -= tickHeal;
  hero.healingTimeLeft = Math.max(0, hero.healingTimeLeft - dt);
  updateHud();
}

function checkFinish(hero) {
  if (hero.x > world.width - 520) {
    state.won = true;
    hero.vx = 0;
    hero.vy = 0;
    announce("Docked at the space station. Mission complete.");
    updateHud();
  }
}

function useSpecial() {
  const hero = state.hero;
  if (!state.selected.special) return;
  state.cooldown = 1.6;
  hero.specialFlash = 0.45;
  const type = state.selected.special.type;
  if (type === "impact_burst") {
    for (const b of state.blocks) {
      if (b.alive && Math.hypot(hero.x - b.x, hero.y - b.y) < 170) damageBlock(b, 2);
    }
    hero.vx += hero.facing * 180;
    burst(hero.x + hero.facing * 44, hero.y, "#ffd84f", 24);
  } else if (type === "dash_flight") {
    hero.vx += hero.facing * 440;
    hero.vy -= 120;
    burst(hero.x, hero.y, "#ff7137", 18);
  } else if (type === "short_teleport") {
    burst(hero.x, hero.y, "#bb67ff", 12);
    hero.x = clamp(hero.x + hero.facing * 210, 40, world.width - 40);
    burst(hero.x, hero.y, "#bb67ff", 16);
  } else if (type === "momentum_boost") {
    hero.vx += hero.facing * 330;
    hero.vy = Math.min(hero.vy, -130);
    burst(hero.x, hero.y, "#66dfff", 18);
  } else {
    hero.vy -= 260;
    burst(hero.x, hero.y, "#ffc3ea", 18);
  }
}

function makeHeroJump(options = {}) {
  if (!state.hero || !state.selected) return;
  const { allowAir = false, airScale = 0.72 } = options;
  const wasGrounded = state.hero.grounded;
  const canJump = wasGrounded || (allowAir && state.hero.tapJumpCooldown <= 0);
  if (!canJump) return;

  const jumpPower = wasGrounded
    ? state.selected.movement.jump
    : state.selected.movement.jump * airScale;
  const boostedJumpPower = jumpPower * world.jumpBoostMultiplier;
  const forwardBoost = Math.cos(world.jumpAngleRadians) * boostedJumpPower;
  const upwardBoost = Math.sin(world.jumpAngleRadians) * boostedJumpPower;
  state.hero.vx = clamp(state.hero.vx + state.hero.facing * forwardBoost, -1320, 1380);
  state.hero.vy = -upwardBoost;
  state.hero.grounded = false;
  state.hero.jumpStretch = 1;
  state.hero.tapJumpCooldown = wasGrounded ? 0 : 0.16;
  state.hero.specialFlash = Math.max(state.hero.specialFlash, 0.16);
  burst(state.hero.x, state.hero.y + state.hero.h / 2, "#fff1a8", wasGrounded ? 8 : 12);
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 80 + Math.random() * 240;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      r: 2 + Math.random() * 4,
      color,
      life: 0.35 + Math.random() * 0.45
    });
  }
}

function updateHud() {
  if (!state.selected) return;
  const level = getLevelProgress(state.score);
  heroName.textContent = `${state.selected.name}, ${state.selected.title}`;
  const shieldText = state.hero.shieldTimer > 0 ? ` | Shield ${state.hero.shieldTimer.toFixed(1)}s` : "";
  heroPower.textContent = state.gameOver
    ? "Hero down"
    : state.won
      ? "Docked"
      : `Level ${level.level} | XP ${level.current}/${level.next} | HP ${Math.round(state.hero.hp)}${shieldText}`;
  scoreEl.textContent = state.score;
}

function getLevelProgress(score) {
  let totalXp = Math.floor(score / 3);
  let level = 1;
  let next = 100;
  while (totalXp >= next) {
    totalXp -= next;
    level += 1;
    next = Math.ceil(next * 1.25);
  }
  return { level, current: totalXp, next };
}

function announce(message) {
  state.message = message;
  state.messageTimer = 3.2;
  updateAnnouncement();
}

function updateAnnouncement() {
  if (!announcement) return;
  if (state.messageTimer <= 0 && state.selected && !state.won && !state.gameOver) {
    state.message = "Reach the far space station. Green kits heal, shields block damage, and cosmic hazards hurt.";
  }
  announcement.textContent = state.message;
}

function startMusic() {
  if (!music) return;
  music.volume = 0.45;
  music.play().catch(() => {
    announce("Tap start to enable music.");
  });
}

function draw() {
  ctx.clearRect(0, 0, state.width, state.height);
  drawSky();
  ctx.save();
  ctx.translate(-state.cameraX, 0);
  drawWorld();
  drawAim();
  drawHero();
  ctx.restore();
  if (state.won || state.gameOver) drawEndState();
}

function drawSky() {
  const time = performance.now() / 1000;
  const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
  gradient.addColorStop(0, "#090a24");
  gradient.addColorStop(0.55, "#171547");
  gradient.addColorStop(1, "#29123b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, state.width, state.height);

  const stars = state.backgroundStars.length ? state.backgroundStars : Array.from({ length: 160 }, (_, i) => backgroundStar(i));
  for (const starDot of stars) {
    const wrappedX = ((starDot.x - state.cameraX * starDot.layer) % (world.width + state.width) + world.width + state.width) % (world.width + state.width);
    const x = wrappedX - state.cameraX * 0.02;
    if (x < -12 || x > state.width + 12) continue;
    const pulse = 0.46 + Math.sin(time * starDot.twinkle + starDot.phase) * 0.34;
    ctx.globalAlpha = clamp(pulse, 0.14, 0.9);
    ctx.fillStyle = starDot.size > 2.2 ? "#fff1a8" : "#ffffff";
    ctx.beginPath();
    ctx.arc(x, starDot.y, starDot.size, 0, Math.PI * 2);
    ctx.fill();
    if (starDot.size > 1.8 && pulse > 0.58) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - starDot.size * 2.6, starDot.y);
      ctx.lineTo(x + starDot.size * 2.6, starDot.y);
      ctx.moveTo(x, starDot.y - starDot.size * 2.6);
      ctx.lineTo(x, starDot.y + starDot.size * 2.6);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawWorld() {
  drawPlatforms();
  drawSlingshot();
  drawFinishStation();
  for (const s of state.stars) if (s.alive) drawStar(s.x, s.y, s.r, s.spin);
  for (const kit of state.healingKits) if (kit.alive) drawHealingKit(kit);
  for (const shield of state.shields) if (shield.alive) drawShieldPickup(shield);
  for (const t of state.targets) if (t.alive) drawTarget(t);
  for (const p of state.phenomena) drawPhenomenon(p);
  for (const b of state.blocks) if (b.alive) drawBlock(b);
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPlatforms() {
  ctx.fillStyle = "#171b31";
  ctx.fillRect(-200, world.groundY, world.width + 400, 220);
  ctx.fillStyle = "rgba(120, 228, 255, 0.16)";
  ctx.fillRect(-200, world.groundY, world.width + 400, 4);
}

function drawCrystalField(x, y) {
  ctx.fillStyle = "rgba(151, 112, 255, 0.48)";
  for (let i = 0; i < 5; i += 1) {
    const cx = x + i * 38;
    const h = 28 + (i % 3) * 18;
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx + 16, y - h);
    ctx.lineTo(cx + 32, y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRamp(x, y, w, h) {
  ctx.fillStyle = "#2c4e70";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y - h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#78e4ff";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawSlingshot() {
  drawSpaceStation(world.slingX - 70, world.groundY - 116, 1, "launch");
  for (let i = 0; i < 4; i += 1) {
    drawShip(world.slingX - 180 - i * 64, world.groundY - 190 + (i % 2) * 44, i % 2 ? "#78e4ff" : "#ffc861");
  }
}

function drawFinishStation() {
  drawSpaceStation(world.width - 430, world.groundY - 142, 1.35, "finish");
}

function drawAim() {
  if (!state.hero || !state.aiming) return;
  const charge = getChargeRatio();
  const arrowLength = 76 + charge * 170;
  const endX = world.slingX + Math.cos(world.launchAngleRadians) * arrowLength;
  const endY = world.slingY - Math.sin(world.launchAngleRadians) * arrowLength;

  ctx.strokeStyle = "#ffc861";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(world.slingX, world.slingY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 216, 79, 0.18)";
  ctx.beginPath();
  ctx.arc(world.slingX, world.slingY, 56 + charge * 44, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 246, 215, 0.78)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(world.slingX, world.slingY, 54, -Math.PI / 2, -Math.PI / 2 + charge * Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#fff6d7";
  ctx.beginPath();
  ctx.moveTo(endX + 18, endY - 10);
  ctx.lineTo(endX + 18, endY + 10);
  ctx.lineTo(endX + 34, endY);
  ctx.closePath();
  ctx.fill();
}

function drawHero() {
  if (!state.hero || !state.selected) return;
  const hero = state.hero;
  const img = state.images.get(state.selected.id);
  const ratio = img.width / img.height;
  const drawH = hero.h * 1.22;
  const drawW = drawH * ratio;
  const speedLean = clamp(hero.vx / 1400, -0.18, 0.18);
  const flightLean = state.launched && !hero.grounded ? clamp(-hero.vy / 4200, -0.08, 0.08) : 0;
  const idleBob = hero.grounded ? Math.sin(hero.animTime * 5.2) * 3 : Math.sin(hero.animTime * 8) * 1.4;
  const airFlutter = state.launched && !hero.grounded ? Math.sin(hero.animTime * 18) * 0.018 : 0;
  const stretch = hero.jumpStretch;
  const squash = hero.landingBounce;
  const scaleX = 1 + squash * 0.1 - stretch * 0.045 + Math.abs(speedLean) * 0.08;
  const scaleY = 1 - squash * 0.085 + stretch * 0.13 + airFlutter;
  const shadowWidth = hero.w * 0.72 * (hero.grounded ? 1.15 + squash * 0.25 : 0.72);
  const shadowAlpha = hero.grounded ? 0.32 : 0.13;

  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
  ctx.beginPath();
  ctx.ellipse(hero.x, world.groundY + 8, shadowWidth, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(hero.x, hero.y + hero.h * 0.08 + idleBob);
  ctx.rotate((speedLean + flightLean) * hero.facing);
  if (hero.facing < 0) ctx.scale(-1, 1);
  ctx.scale(scaleX, scaleY);
  if (hero.shieldTimer > 0) {
    ctx.save();
    ctx.globalAlpha = 0.28 + Math.sin(hero.animTime * 10) * 0.08;
    ctx.strokeStyle = "#62ff8f";
    ctx.lineWidth = 5;
    ctx.shadowColor = "#62ff8f";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.ellipse(0, 2, drawW * 0.42, drawH * 0.47, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (hero.specialFlash > 0) {
    ctx.shadowColor = "#fff1a8";
    ctx.shadowBlur = 22 + hero.specialFlash * 22;
  }
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

  if (hero.specialFlash > 0) {
    ctx.globalAlpha = hero.specialFlash * 0.35;
    ctx.strokeStyle = "#fff1a8";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(hero.w, hero.h) * (0.48 + hero.specialFlash * 0.12), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  drawHealthBar(hero);
}

function drawHealthBar(hero) {
  const pct = clamp(hero.hp / hero.maxHp, 0, 1);
  const barW = 74;
  const barH = 9;
  const x = hero.x - barW / 2;
  const y = hero.y - hero.h * 1.15;
  const color = pct <= 0.33 ? "#ff4255" : pct <= 0.66 ? "#ffd84f" : "#52ff7a";
  ctx.save();
  ctx.fillStyle = "rgba(5, 7, 18, 0.8)";
  ctx.fillRect(x - 2, y - 2, barW + 4, barH + 4);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, barW * pct, barH);
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, barW, barH);
  ctx.restore();
}

function drawPhenomenon(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.spin);
  ctx.fillStyle = p.kind === "comet" ? "#a9f4ff" : "#ff8d45";
  ctx.shadowColor = p.kind === "comet" ? "#6be9ff" : "#ff7137";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(0, 0, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(p.r, 0);
  ctx.lineTo(p.r + 58, -20);
  ctx.stroke();
  ctx.restore();
}

function drawSpaceStation(x, y, scale, mode) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = mode === "finish" ? "#d9e8ff" : "#ced3df";
  ctx.strokeStyle = "#78e4ff";
  ctx.lineWidth = 3;
  ctx.fillRect(-70, -42, 140, 84);
  ctx.strokeRect(-70, -42, 140, 84);
  ctx.fillStyle = "#27314f";
  ctx.beginPath();
  ctx.arc(0, 0, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffc861";
  ctx.fillRect(-106, -14, 36, 28);
  ctx.fillRect(70, -14, 36, 28);
  ctx.restore();
}

function drawShip(x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(32, 0);
  ctx.lineTo(-22, -18);
  ctx.lineTo(-12, 0);
  ctx.lineTo(-22, 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff6d7";
  ctx.beginPath();
  ctx.arc(4, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBlock(b) {
  b.shake = Math.max(0, b.shake - 0.02);
  const offset = b.shake ? Math.sin(performance.now() * 0.07) * 3 : 0;
  ctx.save();
  ctx.translate(offset, 0);
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 3;
  ctx.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
  ctx.fillStyle = `rgba(12, 15, 31, ${0.15 + (1 - b.hp / b.maxHp) * 0.45})`;
  ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
  ctx.restore();
}

function drawTarget(t) {
  t.wobble += 0.04;
  ctx.save();
  ctx.translate(t.x, t.y + Math.sin(t.wobble) * 5);
  ctx.shadowColor = "#ff71d9";
  ctx.shadowBlur = 18 + Math.sin(t.wobble * 2) * 5;
  ctx.fillStyle = "#ff6f87";
  ctx.beginPath();
  ctx.arc(0, 0, t.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ff71d9";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#22122d";
  ctx.beginPath();
  ctx.arc(-9, -5, 5, 0, Math.PI * 2);
  ctx.arc(9, -5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff6d7";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 6, 10, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawHealingKit(kit) {
  kit.pulse += 0.035;
  const glow = 12 + Math.sin(kit.pulse) * 5;
  ctx.save();
  ctx.translate(kit.x, kit.y + Math.sin(kit.pulse * 1.4) * 4);
  ctx.shadowColor = "#62ff8f";
  ctx.shadowBlur = glow;
  ctx.fillStyle = "rgba(20, 80, 46, 0.96)";
  ctx.strokeStyle = "#62ff8f";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-kit.w / 2, -kit.h / 2, kit.w, kit.h, 6);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#b8ffd0";
  ctx.fillRect(-5, -13, 10, 26);
  ctx.fillRect(-14, -4, 28, 8);

  ctx.strokeStyle = "rgba(184, 255, 208, 0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-kit.w / 2 + 5, -kit.h / 2 + 5, kit.w - 10, kit.h - 10);
  ctx.restore();
}

function drawShieldPickup(shield) {
  shield.pulse += 0.035;
  const bob = Math.sin(shield.pulse * 1.5) * 5;
  const glow = 16 + Math.sin(shield.pulse) * 6;
  ctx.save();
  ctx.translate(shield.x, shield.y + bob);
  ctx.shadowColor = "#62ff8f";
  ctx.shadowBlur = glow;
  ctx.strokeStyle = "#62ff8f";
  ctx.fillStyle = "rgba(20, 92, 52, 0.82)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, -shield.r);
  ctx.quadraticCurveTo(shield.r * 0.88, -shield.r * 0.68, shield.r * 0.72, 4);
  ctx.quadraticCurveTo(shield.r * 0.42, shield.r * 0.82, 0, shield.r);
  ctx.quadraticCurveTo(-shield.r * 0.42, shield.r * 0.82, -shield.r * 0.72, 4);
  ctx.quadraticCurveTo(-shield.r * 0.88, -shield.r * 0.68, 0, -shield.r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(184, 255, 208, 0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -shield.r * 0.58);
  ctx.lineTo(0, shield.r * 0.55);
  ctx.moveTo(-shield.r * 0.38, -shield.r * 0.05);
  ctx.lineTo(shield.r * 0.38, -shield.r * 0.05);
  ctx.stroke();
  ctx.restore();
}

function drawStar(x, y, r, spin) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.fillStyle = "#ffd84f";
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawEndState() {
  ctx.fillStyle = "rgba(5, 7, 18, 0.58)";
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.fillStyle = "#fff6d7";
  ctx.textAlign = "center";
  ctx.font = "900 48px system-ui";
  ctx.fillText(state.won ? "Docking Complete" : "Hero Down", state.width / 2, state.height / 2 - 16);
  ctx.font = "700 18px system-ui";
  ctx.fillText(state.won ? "You reached the space station" : "Reset to try again", state.width / 2, state.height / 2 + 26);
  ctx.textAlign = "left";
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function screenToWorld(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = event.clientX - rect.left;
  pointer.y = event.clientY - rect.top;
  pointer.worldX = pointer.x + state.cameraX;
  pointer.worldY = pointer.y;
}

canvas.addEventListener("pointerdown", (event) => {
  if (!state.hero) return;
  screenToWorld(event);
  if (state.launched && isPointerOnHero()) {
    makeHeroJump({ allowAir: true });
    return;
  }
  if (state.launched) return;
  pointer.active = true;
  state.aiming = true;
  state.chargeStartedAt = performance.now();
  state.chargePower = 0;
  state.hero.x = world.slingX;
  state.hero.y = world.slingY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointer.active || !state.hero) return;
  screenToWorld(event);
});

canvas.addEventListener("pointerup", releaseLaunch);
canvas.addEventListener("pointercancel", releaseLaunch);

function releaseLaunch() {
  if (!pointer.active || !state.hero) return;
  pointer.active = false;
  state.aiming = false;
  const charge = getChargeRatio();
  const launch = state.selected.movement.launchPower;
  const requestedSpeed = world.slingMinLaunch + charge * (world.slingMaxLaunch - world.slingMinLaunch);
  const visibleVerticalLimit = Math.max(620, state.height * world.slingMaxVisibleRise);
  const visibleSpeedLimit = visibleVerticalLimit / (Math.sin(world.launchAngleRadians) * launch);
  const speed = Math.min(requestedSpeed, visibleSpeedLimit);
  state.hero.vx = Math.cos(world.launchAngleRadians) * speed * launch;
  state.hero.vy = -Math.sin(world.launchAngleRadians) * speed * launch;
  state.launched = true;
  state.chargePower = 0;
  burst(world.slingX, world.slingY, "#ffc861", 10 + Math.round(charge * 16));
}

function getChargeRatio() {
  if (!state.chargeStartedAt) return 0;
  return clamp((performance.now() - state.chargeStartedAt) / world.chargeTimeMs, 0, 1);
}

function isPointerOnHero() {
  const hero = state.hero;
  const tapPadding = 34;
  return rectsOverlap(
    pointer.worldX,
    pointer.worldY,
    1,
    1,
    hero.x - hero.w / 2 - tapPadding,
    hero.y - hero.h / 2 - tapPadding,
    hero.w + tapPadding * 2,
    hero.h + tapPadding * 2
  );
}

window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Escape") select.classList.remove("is-hidden");
});

window.addEventListener("keyup", (event) => keys.delete(event.code));

function bindHold(id, prop) {
  const button = document.querySelector(id);
  const on = (event) => {
    event.preventDefault();
    held[prop] = true;
  };
  const off = (event) => {
    event.preventDefault();
    held[prop] = false;
  };
  button.addEventListener("pointerdown", on);
  button.addEventListener("pointerup", off);
  button.addEventListener("pointercancel", off);
  button.addEventListener("pointerleave", off);
}

bindHold("#leftBtn", "left");
bindHold("#rightBtn", "right");
bindHold("#jumpBtn", "jump");

document.querySelector("#backBtn").addEventListener("click", () => {
  state.launched = false;
  state.aiming = false;
  state.won = false;
  state.gameOver = false;
  state.cameraX = 0;
  state.particles = [];
  held.left = false;
  held.right = false;
  held.jump = false;
  held.special = false;
  select.classList.remove("is-hidden");
  announce("Choose your hero.");
});

enterIntroBtn.addEventListener("click", () => {
  preIntro.classList.add("is-hidden");
  intro.classList.remove("is-hidden");
  startMusic();
  announce("Welcome to Prima Ordia.");
});

startGameBtn.addEventListener("click", () => {
  intro.classList.add("is-hidden");
  select.classList.remove("is-hidden");
  startMusic();
  announce("Choose your hero.");
});

boot().catch((error) => {
  console.error(error);
  heroName.textContent = "Could not load prototype";
  heroPower.textContent = "Check the local server";
});
