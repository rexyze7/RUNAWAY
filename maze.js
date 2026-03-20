const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// ===== SPRITE SHEET =====
const spriteSheet = new Image();
spriteSheet.src = "char/basic_character_spritesheet.png";

const FRAME_WIDTH = 48;
const FRAME_HEIGHT = 48;
const FRAMES_PER_ROW = 4;

const DIR_ROW = {
  up: 1,
  down: 0,
  left: 2,
  right: 3,
};

let dir = "down";
let frameIndex = 0;
let frameTimer = 0;
const FRAME_DURATION = 0.15;

// ===== DEMON SPRITE =====
const demonImg = new Image();
demonImg.src = "char/FLYING.png";

const DEMON_FRAME_W = 83;
const DEMON_FRAME_H = 71;
const DEMON_FRAMES = 4;

let demonFrame = 0;
let demonTimer = 0;
const DEMON_FRAME_DURATION = 0.12;

// ===== FIREBALL SPRITES =====
const fireballFrames = [];
for (let i = 1; i <= 5; i++) {
  const img = new Image();
  img.src = `fireball/fb${i}.png`;
  fireballFrames.push(img);
}

const FIREBALL_FRAME_COUNT = 5;
const FIREBALL_FRAME_DURATION = 0.08;
const FIREBALL_SRC_W = 32;
const FIREBALL_SRC_H = 18;

// ===== GAME STATE =====
const statusEl = document.getElementById("status");
const keys = new Set();

const WALL = 1;
const PATH = 0;

const MAZE_ROWS = 30;
const MAZE_COLS = 30;

let maze = [];
let tileSize = 24;
let mazeOffsetX = 0;
let mazeOffsetY = 0;

let gameOver = false;
let win = false;

// ===== PLAYER =====
const player = {
  x: 0,
  y: 0,
  speed: 170,
  radius: 9,
  spawnX: 0,
  spawnY: 0,
};

// ===== FINISH =====
const finish = {
  row: 0,
  col: 0,
};

// ===== DEMON =====
const demon = {
  x: 0,
  y: 0,
  width: 130,
  height: 115,
  moveDir: 1,
  speed: 160,
  minY: 0,
  maxY: 0,
  shootTimer: 0,
  shootInterval: 1.15,
};

// ===== FIREBALLS =====
const fireballs = [];

// ===== INPUT =====
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();

  if ("wasd".includes(k)) {
    keys.add(k);
    e.preventDefault();
  }

  if (k === "r" && (gameOver || win)) {
    restartGame();
  }
});

addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
});

// ===== CANVAS SIZE =====
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  const topPadding = 110;
  const bottomPadding = 70;
  const sidePadding = 140;

  const usableW = Math.max(400, viewW - sidePadding * 2);
  const usableH = Math.max(400, viewH - topPadding - bottomPadding);

  tileSize = Math.floor(Math.min(usableW / MAZE_COLS, usableH / MAZE_ROWS));
  tileSize = Math.max(16, tileSize);

  const mazePixelW = tileSize * MAZE_COLS;
  const mazePixelH = tileSize * MAZE_ROWS;

  mazeOffsetX = Math.floor((viewW - mazePixelW) / 2);
  mazeOffsetY = Math.floor((viewH - mazePixelH) / 2) + 20;

  updateDemonPosition();
}
addEventListener("resize", resizeCanvas);

// ===== HELPERS =====
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function createGrid(rows, cols, fill = WALL) {
  return Array.from({ length: rows }, () => Array(cols).fill(fill));
}

function cellCenter(row, col) {
  return {
    x: mazeOffsetX + col * tileSize + tileSize / 2,
    y: mazeOffsetY + row * tileSize + tileSize / 2,
  };
}

function worldToCell(x, y) {
  return {
    col: Math.floor((x - mazeOffsetX) / tileSize),
    row: Math.floor((y - mazeOffsetY) / tileSize),
  };
}

function inBounds(row, col) {
  return row >= 0 && row < MAZE_ROWS && col >= 0 && col < MAZE_COLS;
}

function isWallAt(x, y) {
  const { row, col } = worldToCell(x, y);
  if (!inBounds(row, col)) return true;
  return maze[row][col] === WALL;
}

function collidesWithMaze(x, y, radius) {
  const points = [
    [x, y],
    [x - radius, y],
    [x + radius, y],
    [x, y - radius],
    [x, y + radius],
    [x - radius * 0.7, y - radius * 0.7],
    [x + radius * 0.7, y - radius * 0.7],
    [x - radius * 0.7, y + radius * 0.7],
    [x + radius * 0.7, y + radius * 0.7],
  ];

  for (const [px, py] of points) {
    if (isWallAt(px, py)) return true;
  }

  return false;
}

function circleRectCollision(cx, cy, radius, rx, ry, rw, rh) {
  const nearestX = Math.max(rx, Math.min(cx, rx + rw));
  const nearestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

function updateStatus() {
  if (!statusEl) return;

  if (win) {
    statusEl.textContent = "You escaped. Press R to play again.";
  } else if (gameOver) {
    statusEl.textContent = "Burned by fire. Press R to restart.";
  } else {
    statusEl.textContent = "Reach the green finish. Dodge the fire.";
  }
}

// ===== MAZE GENERATION =====
function generateMaze(rows = MAZE_ROWS, cols = MAZE_COLS) {
  const grid = createGrid(rows, cols, WALL);

  function inside(r, c) {
    return r > 0 && r < rows - 1 && c > 0 && c < cols - 1;
  }

  function carve(r, c) {
    grid[r][c] = PATH;

    const dirs = shuffle([
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
    ]);

    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;

      if (inside(nr, nc) && grid[nr][nc] === WALL) {
        grid[r + dr / 2][c + dc / 2] = PATH;
        carve(nr, nc);
      }
    }
  }

  let startRow = Math.floor(Math.random() * Math.floor(rows / 2)) * 2 + 1;
  let endRow = Math.floor(Math.random() * Math.floor(rows / 2)) * 2 + 1;

  if (startRow >= rows) startRow = rows - 2;
  if (endRow >= rows) endRow = rows - 2;

  carve(startRow, 1);

  grid[startRow][0] = PATH;
  grid[startRow][1] = PATH;
  grid[endRow][cols - 1] = PATH;
  grid[endRow][cols - 2] = PATH;

  const extraOpenChance = 0.24;

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (grid[r][c] === WALL && Math.random() < extraOpenChance) {
        const openNeighbors =
          (grid[r - 1][c] === PATH ? 1 : 0) +
          (grid[r + 1][c] === PATH ? 1 : 0) +
          (grid[r][c - 1] === PATH ? 1 : 0) +
          (grid[r][c + 1] === PATH ? 1 : 0);

        if (openNeighbors >= 2) {
          grid[r][c] = PATH;
        }
      }
    }
  }

  const widenChance = 0.16;

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (grid[r][c] === PATH && Math.random() < widenChance) {
        const dirs = shuffle([
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]);

        for (const [dr, dc] of dirs) {
          const nr = r + dr;
          const nc = c + dc;

          if (inside(nr, nc)) {
            grid[nr][nc] = PATH;
            break;
          }
        }
      }
    }
  }

  return {
    grid,
    start: { row: startRow, col: 0 },
    end: { row: endRow, col: cols - 1 },
  };
}

// ===== PLAYER ANIMATION =====
function spriteDrawSize() {
  const dh = tileSize * 1.7;
  const scale = dh / FRAME_HEIGHT;

  return {
    dw: FRAME_WIDTH * scale,
    dh,
  };
}

function updatePlayerAnimation(dt, moving) {
  if (!moving) {
    frameIndex = 0;
    frameTimer = 0;
    return;
  }

  frameTimer += dt;
  if (frameTimer >= FRAME_DURATION) {
    frameTimer = 0;
    frameIndex = (frameIndex + 1) % FRAMES_PER_ROW;
  }
}

// ===== DEMON =====
function updateDemonPosition() {
  demon.x = mazeOffsetX + tileSize * MAZE_COLS + 78;
  demon.minY = mazeOffsetY + demon.height / 2;
  demon.maxY = mazeOffsetY + tileSize * MAZE_ROWS - demon.height / 2;
  demon.y = (demon.minY + demon.maxY) / 2;
}

function updateDemon(dt) {
  demonTimer += dt;
  if (demonTimer >= DEMON_FRAME_DURATION) {
    demonTimer = 0;
    demonFrame = (demonFrame + 1) % DEMON_FRAMES;
  }

  demon.y += demon.moveDir * demon.speed * dt;

  if (demon.y <= demon.minY) {
    demon.y = demon.minY;
    demon.moveDir = 1;
  }

  if (demon.y >= demon.maxY) {
    demon.y = demon.maxY;
    demon.moveDir = -1;
  }

  demon.shootTimer += dt;

  if (!gameOver && !win && demon.shootTimer >= demon.shootInterval) {
    demon.shootTimer = 0;
    spawnFireball();
  }
}

function spawnFireball() {
  const mouthX = demon.x - demon.width * 0.18;
  const mouthY = demon.y;

  const targetY = player.y + (Math.random() * 80 - 40);
  const distX = Math.max(120, mouthX - player.x);
  const vx = -(280 + Math.random() * 70);
  const vy = ((targetY - mouthY) / distX) * Math.abs(vx);

  fireballs.push({
    x: mouthX,
    y: mouthY,
    vx,
    vy,
    radius: Math.max(10, tileSize * 0.3),
    life: 0,
    maxLife: 7,
    animTimer: 0,
    frameIndex: Math.floor(Math.random() * FIREBALL_FRAME_COUNT),
    drawW: tileSize * 1.2,
    drawH: tileSize * 0.72,
  });
}

// ===== RESTART =====
function restartGame() {
  gameOver = false;
  win = false;
  fireballs.length = 0;

  const data = generateMaze();
  maze = data.grid;

  finish.row = data.end.row;
  finish.col = data.end.col;

  const spawn = cellCenter(data.start.row, data.start.col);
  player.x = spawn.x;
  player.y = spawn.y;
  player.spawnX = spawn.x;
  player.spawnY = spawn.y;

  demon.moveDir = Math.random() < 0.5 ? 1 : -1;
  demon.shootTimer = 0;

  updateStatus();
}

// ===== UPDATE =====
function updatePlayer(dt) {
  if (gameOver || win) return;

  let dx = 0;
  let dy = 0;

  if (keys.has("a")) {
    dx -= 1;
    dir = "left";
  }
  if (keys.has("d")) {
    dx += 1;
    dir = "right";
  }
  if (keys.has("w")) {
    dy -= 1;
    dir = "up";
  }
  if (keys.has("s")) {
    dy += 1;
    dir = "down";
  }

  if (dx !== 0 && dy !== 0) {
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
  }

  const moving = dx !== 0 || dy !== 0;
  updatePlayerAnimation(dt, moving);

  const step = player.speed * dt;

  const nextX = player.x + dx * step;
  const nextY = player.y + dy * step;

  if (!collidesWithMaze(nextX, player.y, player.radius)) {
    player.x = nextX;
  }

  if (!collidesWithMaze(player.x, nextY, player.radius)) {
    player.y = nextY;
  }

  const finishCenter = cellCenter(finish.row, finish.col);
  if (
    Math.hypot(player.x - finishCenter.x, player.y - finishCenter.y) <
    tileSize * 0.35
  ) {
    win = true;
    updateStatus();
  }
}

function updateFireballs(dt) {
  if (gameOver || win) return;

  for (let i = fireballs.length - 1; i >= 0; i--) {
    const f = fireballs[i];

    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.life += dt;

    f.animTimer += dt;
    if (f.animTimer >= FIREBALL_FRAME_DURATION) {
      f.animTimer = 0;
      f.frameIndex = (f.frameIndex + 1) % FIREBALL_FRAME_COUNT;
    }

    if (collidesWithMaze(f.x, f.y, f.radius * 0.65)) {
      fireballs.splice(i, 1);
      continue;
    }

    if (
      circleRectCollision(
        f.x,
        f.y,
        f.radius,
        player.x - player.radius,
        player.y - player.radius,
        player.radius * 2,
        player.radius * 2
      )
    ) {
      gameOver = true;
      updateStatus();
      continue;
    }

    if (
      f.life > f.maxLife ||
      f.x < -100 ||
      f.y < -100 ||
      f.x > window.innerWidth + 100 ||
      f.y > window.innerHeight + 100
    ) {
      fireballs.splice(i, 1);
    }
  }
}

// ===== DRAW =====
function drawMaze() {
  const mazeW = tileSize * MAZE_COLS;
  const mazeH = tileSize * MAZE_ROWS;

  ctx.fillStyle = "#111";
  ctx.fillRect(mazeOffsetX - 8, mazeOffsetY - 8, mazeW + 16, mazeH + 16);

  for (let row = 0; row < MAZE_ROWS; row++) {
    for (let col = 0; col < MAZE_COLS; col++) {
      const x = mazeOffsetX + col * tileSize;
      const y = mazeOffsetY + row * tileSize;

      if (maze[row][col] === WALL) {
        ctx.fillStyle = "#efefef";
        ctx.fillRect(x, y, tileSize, tileSize);

        ctx.strokeStyle = "#d0d0d0";
        ctx.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1);
      } else {
        ctx.fillStyle = "#181818";
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
  }

  const fx = mazeOffsetX + finish.col * tileSize;
  const fy = mazeOffsetY + finish.row * tileSize;
  ctx.fillStyle = "#2ecc71";
  ctx.fillRect(fx + 4, fy + 4, tileSize - 8, tileSize - 8);
}

function drawPlayer() {
  const { dw, dh } = spriteDrawSize();
  const x = player.x - dw / 2;
  const y = player.y - dh / 2;

  if (!spriteSheet.complete || !spriteSheet.naturalWidth) {
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const sx = frameIndex * FRAME_WIDTH;
  const sy = DIR_ROW[dir] * FRAME_HEIGHT;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    spriteSheet,
    sx,
    sy,
    FRAME_WIDTH,
    FRAME_HEIGHT,
    x,
    y,
    dw,
    dh
  );
}

function drawDemon() {
  const drawX = demon.x - demon.width / 2;
  const drawY = demon.y - demon.height / 2;

  if (!demonImg.complete || !demonImg.naturalWidth) {
    ctx.fillStyle = "purple";
    ctx.fillRect(drawX, drawY, demon.width, demon.height);
    return;
  }

  const sx = demonFrame * DEMON_FRAME_W;
  const sy = 0;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    demonImg,
    sx,
    sy,
    DEMON_FRAME_W,
    DEMON_FRAME_H,
    drawX,
    drawY,
    demon.width,
    demon.height
  );
}

function drawFireballs() {
  ctx.imageSmoothingEnabled = false;

  for (const f of fireballs) {
    const img = fireballFrames[f.frameIndex];

    if (img.complete && img.naturalWidth) {
      const angle = Math.atan2(f.vy, f.vx);

      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(angle);
      ctx.drawImage(
        img,
        0,
        0,
        FIREBALL_SRC_W,
        FIREBALL_SRC_H,
        -f.drawW / 2,
        -f.drawH / 2,
        f.drawW,
        f.drawH
      );
      ctx.restore();
    } else {
      ctx.fillStyle = "orange";
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawOverlay() {
  if (!gameOver && !win) return;

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  ctx.fillStyle = "white";
  ctx.font = "bold 42px Arial";
  ctx.textAlign = "center";

  if (win) {
    ctx.fillText("YOU ESCAPED", window.innerWidth / 2, 90);
  } else {
    ctx.fillText("YOU DIED", window.innerWidth / 2, 90);
  }

  ctx.font = "22px Arial";
  ctx.fillText("Press R to restart", window.innerWidth / 2, 125);
}

// ===== LOOP =====
let last = 0;

function loop(t) {
  const dt = (t - last) / 1000 || 0;
  last = t;

  updateDemon(dt);
  updatePlayer(dt);
  updateFireballs(dt);

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  drawMaze();
  drawDemon();
  drawFireballs();
  drawPlayer();
  drawOverlay();

  requestAnimationFrame(loop);
}

// ===== START =====
function startGame() {
  resizeCanvas();
  restartGame();
  requestAnimationFrame(loop);
}

startGame();
