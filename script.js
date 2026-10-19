const DIFFICULTIES = {
  beginner: { name: "초급", rows: 9, columns: 9, mines: 10 },
  intermediate: { name: "중급", rows: 16, columns: 16, mines: 40 },
  advanced: { name: "고급", rows: 16, columns: 30, mines: 99 },
};

const boardElement = document.querySelector("#board");
const mineCountElement = document.querySelector("#mine-count");
const timerElement = document.querySelector("#timer");
const bestTimeElement = document.querySelector("#best-time");
const messageElement = document.querySelector("#game-message");
const restartButton = document.querySelector("#restart-button");
const difficultySelect = document.querySelector("#difficulty-select");
const gameNoteElement = document.querySelector(".game-note");
const confettiCanvas = document.querySelector("#confetti");
const confettiContext = confettiCanvas.getContext("2d");

let difficulty = DIFFICULTIES[difficultySelect.value];
let difficultyKey = difficultySelect.value;
let cells = [];
let flaggedCount = 0;
let revealedCount = 0;
let elapsedSeconds = 0;
let timerId = null;
let animationFrameId = null;
let gameState = "ready";

function getNeighbors(index) {
  const row = Math.floor(index / difficulty.columns);
  const column = index % difficulty.columns;
  const neighbors = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) {
        continue;
      }

      const neighborRow = row + rowOffset;
      const neighborColumn = column + columnOffset;
      if (
        neighborRow >= 0 &&
        neighborRow < difficulty.rows &&
        neighborColumn >= 0 &&
        neighborColumn < difficulty.columns
      ) {
        neighbors.push(neighborRow * difficulty.columns + neighborColumn);
      }
    }
  }

  return neighbors;
}

function placeMines(firstIndex) {
  const availableIndices = cells
    .map((_, index) => index)
    .filter((index) => index !== firstIndex);

  for (let index = availableIndices.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [availableIndices[index], availableIndices[randomIndex]] = [
      availableIndices[randomIndex],
      availableIndices[index],
    ];
  }

  for (const index of availableIndices.slice(0, difficulty.mines)) {
    cells[index].isMine = true;
  }

  for (const cell of cells) {
    if (!cell.isMine) {
      cell.neighborMines = getNeighbors(cell.index).filter(
        (neighborIndex) => cells[neighborIndex].isMine,
      ).length;
    }
  }
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function updateTimer() {
  timerElement.textContent = formatTime(elapsedSeconds);
}

function startTimer() {
  if (timerId !== null) {
    return;
  }

  timerId = window.setInterval(() => {
    elapsedSeconds += 1;
    updateTimer();
  }, 1000);
}

function stopTimer() {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function updateMineCount() {
  mineCountElement.textContent = difficulty.mines - flaggedCount;
}

function renderCell(cell) {
  const element = cell.element;
  element.classList.toggle("is-open", cell.isRevealed);
  element.classList.toggle("is-flagged", cell.isFlagged);
  element.classList.toggle("is-mine", cell.isRevealed && cell.isMine);
  element.classList.toggle("is-wrong", cell.isRevealed && cell.isWrong);
  element.classList.remove(
    "number-1",
    "number-2",
    "number-3",
    "number-4",
    "number-5",
    "number-6",
    "number-7",
    "number-8",
  );

  if (cell.isFlagged && !cell.isRevealed) {
    element.textContent = "⚑";
    element.setAttribute("aria-label", `${cell.index + 1}번 칸, 깃발 표시됨`);
  } else if (cell.isRevealed && cell.isMine) {
    element.textContent = "✹";
    element.setAttribute("aria-label", `${cell.index + 1}번 칸, 지뢰`);
  } else if (cell.isRevealed && cell.isWrong) {
    element.textContent = "×";
    element.setAttribute("aria-label", `${cell.index + 1}번 칸, 잘못 표시한 깃발`);
  } else if (cell.isRevealed && cell.neighborMines > 0) {
    element.textContent = cell.neighborMines;
    element.classList.add(`number-${cell.neighborMines}`);
    element.setAttribute(
      "aria-label",
      `${cell.index + 1}번 칸, 주변 지뢰 ${cell.neighborMines}개`,
    );
  } else if (cell.isRevealed) {
    element.textContent = "";
    element.setAttribute("aria-label", `${cell.index + 1}번 칸, 비어 있음`);
  } else {
    element.textContent = "";
    element.setAttribute("aria-label", `${cell.index + 1}번 칸, 닫힘`);
  }

  element.disabled = gameState === "won" || gameState === "lost";
}

function setMessage(text, result) {
  messageElement.textContent = text;
  messageElement.classList.toggle("is-result", result === "won");
  messageElement.classList.toggle("is-loss", result === "lost");
}

function loadBestTime() {
  try {
    const storedTime = localStorage.getItem(`minesweeper-best-${difficultyKey}`);
    if (storedTime === null) {
      return { time: null, failed: false };
    }

    const time = Number(storedTime);
    return {
      time: Number.isInteger(time) && time >= 0 ? time : null,
      failed: false,
    };
  } catch (error) {
    console.error("최고 기록을 불러오지 못했습니다.", error);
    return { time: null, failed: true };
  }
}

function updateBestTime() {
  const best = loadBestTime();
  if (best.time !== null && elapsedSeconds >= best.time) {
    return { isRecord: false, storageFailed: best.failed };
  }

  bestTimeElement.textContent = formatTime(elapsedSeconds);
  try {
    localStorage.setItem(`minesweeper-best-${difficultyKey}`, elapsedSeconds.toString());
    return { isRecord: true, storageFailed: best.failed };
  } catch (error) {
    console.error("최고 기록을 저장하지 못했습니다.", error);
    return { isRecord: true, storageFailed: true };
  }
}

function resizeConfettiCanvas() {
  const pixelRatio = window.devicePixelRatio || 1;
  confettiCanvas.width = Math.floor(window.innerWidth * pixelRatio);
  confettiCanvas.height = Math.floor(window.innerHeight * pixelRatio);
  confettiContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function celebrateRecord() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  if (animationFrameId !== null) {
    window.cancelAnimationFrame(animationFrameId);
  }

  resizeConfettiCanvas();
  const colors = ["#70905e", "#f2b84b", "#e77c63", "#718fc2", "#bd83b8"];
  const particles = Array.from({ length: 120 }, () => ({
    x: Math.random() * window.innerWidth,
    y: -Math.random() * window.innerHeight * 0.6,
    size: 4 + Math.random() * 6,
    speedX: (Math.random() - 0.5) * 3,
    speedY: 2 + Math.random() * 4,
    rotation: Math.random() * Math.PI,
    rotationSpeed: (Math.random() - 0.5) * 0.16,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const startTime = performance.now();

  function animateConfetti(now) {
    const elapsed = now - startTime;
    confettiContext.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (const particle of particles) {
      particle.x += particle.speedX;
      particle.y += particle.speedY;
      particle.speedY += 0.035;
      particle.rotation += particle.rotationSpeed;

      confettiContext.save();
      confettiContext.translate(particle.x, particle.y);
      confettiContext.rotate(particle.rotation);
      confettiContext.fillStyle = particle.color;
      confettiContext.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.65);
      confettiContext.restore();
    }

    if (elapsed < 3200) {
      animationFrameId = window.requestAnimationFrame(animateConfetti);
    } else {
      confettiContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
      animationFrameId = null;
    }
  }

  animationFrameId = window.requestAnimationFrame(animateConfetti);
}

function finishGame(result) {
  gameState = result;
  stopTimer();

  if (result === "lost") {
    for (const cell of cells) {
      if (cell.isMine) {
        cell.isRevealed = true;
      } else if (cell.isFlagged) {
        cell.isRevealed = true;
        cell.isWrong = true;
      }
      renderCell(cell);
    }
    setMessage("지뢰를 밟았어요. 다시 도전해보세요!", "lost");
    return;
  }

  const record = updateBestTime();
  if (record.isRecord) {
    celebrateRecord();
    setMessage(
      record.storageFailed
        ? `새 최고 기록 ${formatTime(elapsedSeconds)}! 기록 저장에 실패했습니다.`
        : `새 최고 기록 ${formatTime(elapsedSeconds)}!`,
      "won",
    );
  } else {
    setMessage(
      record.storageFailed
        ? "승리! 최고 기록을 불러오지 못했습니다."
        : "모든 안전한 칸을 열었어요. 승리!",
      "won",
    );
  }

  for (const cell of cells) {
    cell.element.disabled = true;
  }
}

function revealCell(index) {
  const cell = cells[index];
  if (cell.isRevealed || cell.isFlagged || gameState === "won" || gameState === "lost") {
    return;
  }

  if (gameState === "ready") {
    placeMines(index);
    gameState = "playing";
    setMessage("지뢰를 피해 안전한 칸을 열어보세요.");
    startTimer();
  }

  cell.isRevealed = true;
  revealedCount += 1;
  renderCell(cell);

  if (cell.isMine) {
    finishGame("lost");
    return;
  }

  if (cell.neighborMines === 0) {
    for (const neighborIndex of getNeighbors(index)) {
      revealCell(neighborIndex);
    }
  }

  if (revealedCount === difficulty.rows * difficulty.columns - difficulty.mines) {
    finishGame("won");
  }
}

function chordCell(index) {
  const cell = cells[index];
  if (
    !cell.isRevealed ||
    cell.neighborMines === 0 ||
    gameState === "won" ||
    gameState === "lost"
  ) {
    return;
  }

  const neighbors = getNeighbors(index);
  const neighborFlags = neighbors.filter((neighborIndex) => cells[neighborIndex].isFlagged).length;
  if (neighborFlags !== cell.neighborMines) {
    return;
  }

  for (const neighborIndex of neighbors) {
    const neighbor = cells[neighborIndex];
    if (!neighbor.isRevealed && !neighbor.isFlagged) {
      revealCell(neighborIndex);
      if (gameState === "lost") {
        return;
      }
    }
  }
}

function toggleFlag(index) {
  const cell = cells[index];
  if (cell.isRevealed || gameState === "won" || gameState === "lost") {
    return;
  }

  cell.isFlagged = !cell.isFlagged;
  flaggedCount += cell.isFlagged ? 1 : -1;
  updateMineCount();
  renderCell(cell);
}

function startNewGame() {
  stopTimer();
  flaggedCount = 0;
  revealedCount = 0;
  elapsedSeconds = 0;
  gameState = "ready";
  cells = [];
  boardElement.replaceChildren();
  boardElement.style.setProperty("--columns", difficulty.columns);
  boardElement.style.setProperty("--rows", difficulty.rows);
  boardElement.setAttribute(
    "aria-label",
    `${difficulty.rows}행 ${difficulty.columns}열 지뢰찾기 보드`,
  );
  gameNoteElement.textContent =
    `${difficulty.columns} × ${difficulty.rows} 보드 · 지뢰 ${difficulty.mines}개`;
  updateTimer();
  updateMineCount();

  const best = loadBestTime();
  bestTimeElement.textContent = best.time === null ? "--:--" : formatTime(best.time);
  setMessage(
    best.failed
      ? "최고 기록을 불러오지 못했습니다. 게임은 계속할 수 있습니다."
      : "칸을 열어 게임을 시작하세요.",
  );

  for (let index = 0; index < difficulty.rows * difficulty.columns; index += 1) {
    const element = document.createElement("button");
    element.className = "cell";
    element.type = "button";
    element.setAttribute("aria-label", `${index + 1}번 칸, 닫힘`);

    const cell = {
      index,
      element,
      isMine: false,
      isRevealed: false,
      isFlagged: false,
      isWrong: false,
      neighborMines: 0,
    };

    element.addEventListener("click", () => revealCell(index));
    element.addEventListener("pointerdown", (event) => {
      if (event.button === 2) {
        event.preventDefault();
        if (event.buttons === 3) {
          chordCell(index);
        } else {
          toggleFlag(index);
        }
      } else if (event.button === 0 && event.buttons === 3) {
        event.preventDefault();
        chordCell(index);
      }
    });
    element.addEventListener("contextmenu", (event) => event.preventDefault());

    cells.push(cell);
    boardElement.append(element);
  }
}

difficultySelect.addEventListener("change", () => {
  difficultyKey = difficultySelect.value;
  difficulty = DIFFICULTIES[difficultyKey];
  startNewGame();
});
restartButton.addEventListener("click", startNewGame);
window.addEventListener("resize", resizeConfettiCanvas);
startNewGame();
