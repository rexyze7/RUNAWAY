// ===== SETUP =====
const canvas = document.getElementById("gameCanvas"),
  ctx = canvas.getContext("2d"),
  menu = document.getElementById("menu"),
  buttons = document.querySelectorAll("#menu button"),
  statusEl = document.getElementById("status"),
  keys = new Set(),
  spriteSheet = new Image(),
  demonImg = new Image(),
  fireballFrames = [];

let gameStarted = false,
  currentDifficulty = "hard",
  dir = "down",
  frameIndex = 0,
  frameTimer = 0,
  demonFrame = 0,
  demonTimer = 0,
  maze = [],
  tileSize = 24,
  mazeOffsetX = 0,
  mazeOffsetY = 0,
  gameOver = false,
  win = false,
  last = 0;

// ===== SPRITE SHEET =====
spriteSheet.src = "char/basic_character_spritesheet.png";

const FRAME_WIDTH = 48,
  FRAME_HEIGHT = 48,
  FRAMES_PER_ROW = 4,
  FRAME_DURATION = 0.15,
  DEMON_FRAME_W = 83,
  DEMON_FRAME_H = 71,
  DEMON_FRAMES = 4,
  DEMON_FRAME_DURATION = 0.12,
  FIREBALL_FRAME_COUNT = 5,
  FIREBALL_FRAME_DURATION = 0.08,
  FIREBALL_SRC_W = 32,
  FIREBALL_SRC_H = 18,
  WALL = 1,
  PATH = 0,
  MAZE_ROWS = 30,
  MAZE_COLS = 30,
  DIR_ROW = { up: 1, down: 0, left: 2, right: 3 },
  DIFFICULTY = {
    easy: { fireballSpeed: 240, shootInterval: 1.35, volleyCount: 1 },
    hard: { fireballSpeed: 320, shootInterval: 1.15, volleyCount: 1 },
    impossible: { fireballSpeed: 320, shootInterval: 1.15, volleyCount: 20 },
  };

// ===== DEMON SPRITE =====
demonImg.src = "char/FLYING.png";

// ===== FIREBALL SPRITES =====
for (let i = 1; i <= 5; i++) {
  const img = new Image();
  img.src = `fireball/fb${i}.png`;
  fireballFrames.push(img);
}

// ===== GAME STATE =====
const player = { x: 0, y: 0, speed: 170, radius: 9, spawnX: 0, spawnY: 0 },
  finish = { row: 0, col: 0 },
  demon = {
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
  },
  fireballs = [];

// ===== HELPERS =====
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const shuffle = a => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const createGrid = (r, c, fill = WALL) =>
  Array.from({ length: r }, () => Array(c).fill(fill));
const cellCenter = (row, col) => ({
  x: mazeOffsetX + col * tileSize + tileSize / 2,
  y: mazeOffsetY + row * tileSize + tileSize / 2,
});
const worldToCell = (x, y) => ({
  col: Math.floor((x - mazeOffsetX) / tileSize),
  row: Math.floor((y - mazeOffsetY) / tileSize),
});
const inBounds = (row, col) =>
  row >= 0 && row < MAZE_ROWS && col >= 0 && col < MAZE_COLS;
const isWallAt = (x, y) => {
  const { row, col } = worldToCell(x, y);
  return !inBounds(row, col) || maze[row][col] === WALL;
};
const spriteDrawSize = () => {
  const dh = tileSize * 1.7,
    scale = dh / FRAME_HEIGHT;
  return { dw: FRAME_WIDTH * scale, dh };
};

function showDifficultyMenu() {
  gameStarted = gameOver = win = false;
  fireballs.length = 0;
  if (menu) menu.style.display = "flex";
  updateStatus();
}

buttons.forEach(btn =>
  btn.addEventListener("click", () => {
    currentDifficulty = btn.dataset.diff;
    menu.style.display = "none";
    gameStarted = true;
    restartGame();
  })
);

// ===== INPUT =====
addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if ("wasd".includes(k)) {
    keys.add(k);
    e.preventDefault();
  }
  if (k === "r") showDifficultyMenu();
});

addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));

// ===== CANVAS SIZE =====
addEventListener("resize", resizeCanvas);

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1,
    viewW = window.innerWidth,
    viewH = window.innerHeight,
    topPadding = 110,
    bottomPadding = 70,
    sidePadding = 140,
    usableW = Math.max(400, viewW - sidePadding * 2),
    usableH = Math.max(400, viewH - topPadding - bottomPadding),
    mazePixelW = (tileSize = Math.max(
      16,
      Math.floor(Math.min(usableW / MAZE_COLS, usableH / MAZE_ROWS))
    )) * MAZE_COLS,
    mazePixelH = tileSize * MAZE_ROWS;

  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  canvas.style.width = `${viewW}px`;
  canvas.style.height = `${viewH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  mazeOffsetX = Math.floor((viewW - mazePixelW) / 2);
  mazeOffsetY = Math.floor((viewH - mazePixelH) / 2) + 20;
  updateDemonPosition();
}

function collidesWithMaze(x, y, radius) {
  return [
    [x, y],
    [x - radius, y],
    [x + radius, y],
    [x, y - radius],
    [x, y + radius],
    [x - radius * 0.7, y - radius * 0.7],
    [x + radius * 0.7, y - radius * 0.7],
    [x - radius * 0.7, y + radius * 0.7],
    [x + radius * 0.7, y + radius * 0.7],
  ].some(([px, py]) => isWallAt(px, py));
}

function circleRectCollision(cx, cy, radius, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw)),
    ny = Math.max(ry, Math.min(cy, ry + rh)),
    dx = cx - nx,
    dy = cy - ny;
  return dx * dx + dy * dy <= radius * radius;
}

function updateStatus() {
  if (!statusEl) return;
  const label = cap(currentDifficulty);
  statusEl.textContent = !gameStarted
    ? "Choose a difficulty to start."
    : win
    ? `Difficulty: ${label} | You escaped. Press R to choose difficulty again.`
    : gameOver
    ? `Difficulty: ${label} | Burned by fire. Press R to choose difficulty again.`
    : `Difficulty: ${label} | Reach the green finish. Press R to change difficulty.`;
}

// ===== MAZE GENERATION =====
function generateMaze(rows = MAZE_ROWS, cols = MAZE_COLS) {
  const grid = createGrid(rows, cols, WALL),
    inside = (r, c) => r > 0 && r < rows - 1 && c > 0 && c < cols - 1;

  function carve(r, c) {
    grid[r][c] = PATH;
    for (const [dr, dc] of shuffle([
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
    ])) {
      const nr = r + dr,
        nc = c + dc;
      if (inside(nr, nc) && grid[nr][nc] === WALL) {
        grid[r + dr / 2][c + dc / 2] = PATH;
        carve(nr, nc);
      }
    }
  }

  let startRow = Math.floor(Math.random() * Math.floor(rows / 2)) * 2 + 1,
    endRow = Math.floor(Math.random() * Math.floor(rows / 2)) * 2 + 1;

  if (startRow >= rows) startRow = rows - 2;
  if (endRow >= rows) endRow = rows - 2;

  carve(startRow, 1);
  grid[startRow][0] = grid[startRow][1] = PATH;
  grid[endRow][cols - 1] = grid[endRow][cols - 2] = PATH;

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (grid[r][c] === WALL && Math.random() < 0.24) {
        const openNeighbors =
          (grid[r - 1][c] === PATH) +
          (grid[r + 1][c] === PATH) +
          (grid[r][c - 1] === PATH) +
          (grid[r][c + 1] === PATH);
        if (openNeighbors >= 2) grid[r][c] = PATH;
      }
    }
  }

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (grid[r][c] === PATH && Math.random() < 0.16) {
        for (const [dr, dc] of shuffle([
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ])) {
          const nr = r + dr,
            nc = c + dc;
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
function updatePlayerAnimation(dt, moving) {
  if (!moving) return (frameIndex = frameTimer = 0);
  if ((frameTimer += dt) >= FRAME_DURATION) {
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
  if ((demonTimer += dt) >= DEMON_FRAME_DURATION) {
    demonTimer = 0;
    demonFrame = (demonFrame + 1) % DEMON_FRAMES;
  }

  demon.y += demon.moveDir * demon.speed * dt;
  if (demon.y <= demon.minY) demon.y = demon.minY, demon.moveDir = 1;
  if (demon.y >= demon.maxY) demon.y = demon.maxY, demon.moveDir = -1;

  const settings = DIFFICULTY[currentDifficulty];
  demon.shootTimer += dt;

  if (!gameOver && !win && demon.shootTimer >= settings.shootInterval) {
    demon.shootTimer = 0;
    if (settings.volleyCount === 1) return spawnFireball();
    for (let i = 0; i < settings.volleyCount; i++) {
      spawnFireball(-0.9 + (1.8 * i) / (settings.volleyCount - 1));
    }
  }
}

function spawnFireball(angleOffset = 0) {
  const spawnX = demon.x - demon.width * 0.18,
    spawnY = demon.y,
    dx = player.x - spawnX,
    dy = player.y + (Math.random() * 60 - 30) - spawnY,
    angle = Math.atan2(dy, dx) + angleOffset,
    speed = DIFFICULTY[currentDifficulty].fireballSpeed;

  fireballs.push({
    x: spawnX,
    y: spawnY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: Math.max(14, tileSize * 0.38),
    life: 0,
    maxLife: 8,
    animTimer: 0,
    frameIndex: 0,
    drawW: tileSize * 1.8,
    drawH: tileSize * 1,
  });
}

// ===== RESTART =====
function restartGame() {
  gameOver = win = false;
  fireballs.length = 0;

  const data = generateMaze(),
    spawn = cellCenter(data.start.row, data.start.col);

  maze = data.grid;
  finish.row = data.end.row;
  finish.col = data.end.col;
  player.x = player.spawnX = spawn.x;
  player.y = player.spawnY = spawn.y;

  demon.moveDir = Math.random() < 0.5 ? 1 : -1;
  demon.shootTimer = 0;

  updateStatus();
}

// ===== UPDATE =====
function updatePlayer(dt) {
  if (gameOver || win) return;

  let dx = 0,
    dy = 0;
  if (keys.has("a")) dx--, (dir = "left");
  if (keys.has("d")) dx++, (dir = "right");
  if (keys.has("w")) dy--, (dir = "up");
  if (keys.has("s")) dy++, (dir = "down");

  if (dx && dy) {
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
  }

  updatePlayerAnimation(dt, dx || dy);

  const step = player.speed * dt,
    nextX = player.x + dx * step,
    nextY = player.y + dy * step;

  if (!collidesWithMaze(nextX, player.y, player.radius)) player.x = nextX;
  if (!collidesWithMaze(player.x, nextY, player.radius)) player.y = nextY;

  const c = cellCenter(finish.row, finish.col);
  if (Math.hypot(player.x - c.x, player.y - c.y) < tileSize * 0.35) {
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

    if ((f.animTimer += dt) >= FIREBALL_FRAME_DURATION) {
      f.animTimer = 0;
      f.frameIndex = (f.frameIndex + 1) % FIREBALL_FRAME_COUNT;
    }

    // NO WALL COLLISION — fireballs pass through everything

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
      fireballs.splice(i, 1);
      continue;
    }

    if (
      f.life > f.maxLife ||
      f.x < -300 ||
      f.y < -300 ||
      f.x > innerWidth + 300 ||
      f.y > innerHeight + 300
    ) {
      fireballs.splice(i, 1);
    }
  }
}

// ===== DRAW =====
function drawMaze() {
  const mazeW = tileSize * MAZE_COLS,
    mazeH = tileSize * MAZE_ROWS;

  ctx.fillStyle = "#111";
  ctx.fillRect(mazeOffsetX - 8, mazeOffsetY - 8, mazeW + 16, mazeH + 16);

  for (let row = 0; row < MAZE_ROWS; row++) {
    for (let col = 0; col < MAZE_COLS; col++) {
      const x = mazeOffsetX + col * tileSize,
        y = mazeOffsetY + row * tileSize;

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

  const fx = mazeOffsetX + finish.col * tileSize,
    fy = mazeOffsetY + finish.row * tileSize;
  ctx.fillStyle = "#2ecc71";
  ctx.fillRect(fx + 4, fy + 4, tileSize - 8, tileSize - 8);
}

function drawPlayer() {
  const { dw, dh } = spriteDrawSize(),
    x = player.x - dw / 2,
    y = player.y - dh / 2;

  if (!spriteSheet.complete || !spriteSheet.naturalWidth) {
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    return ctx.fill();
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    spriteSheet,
    frameIndex * FRAME_WIDTH,
    DIR_ROW[dir] * FRAME_HEIGHT,
    FRAME_WIDTH,
    FRAME_HEIGHT,
    x,
    y,
    dw,
    dh
  );
}

function drawDemon() {
  const x = demon.x - demon.width / 2,
    y = demon.y - demon.height / 2;

  if (!demonImg.complete || !demonImg.naturalWidth) {
    ctx.fillStyle = "purple";
    return ctx.fillRect(x, y, demon.width, demon.height);
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    demonImg,
    demonFrame * DEMON_FRAME_W,
    0,
    DEMON_FRAME_W,
    DEMON_FRAME_H,
    x,
    y,
    demon.width,
    demon.height
  );
}

function drawFireballs() {
  ctx.imageSmoothingEnabled = false;

  for (const f of fireballs) {
    const img = fireballFrames[f.frameIndex];
    if (img.complete && img.naturalWidth) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(Math.atan2(f.vy, f.vx));
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
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.fillStyle = "white";
  ctx.font = "bold 42px Arial";
  ctx.textAlign = "center";
  ctx.fillText(win ? "YOU ESCAPED" : "YOU DIED", innerWidth / 2, 90);
  ctx.font = "22px Arial";
  ctx.fillText("Press R to choose difficulty", innerWidth / 2, 125);
}

// ===== LOOP =====
function loop(t) {
  const dt = (t - last) / 1000 || 0;
  last = t;

  ctx.clearRect(0, 0, innerWidth, innerHeight);
  if (!gameStarted) return requestAnimationFrame(loop);

  updateDemon(dt);
  updatePlayer(dt);
  updateFireballs(dt);

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
  showDifficultyMenu();
  requestAnimationFrame(loop);
}

startGame();
