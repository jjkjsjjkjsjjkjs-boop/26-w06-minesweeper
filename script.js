    (() => {
      "use strict";

      const SAVE_KEY = "retro-minesweeper-save-v1";
      const SCORES_KEY = "retro-minesweeper-scores-v1";
      const PRESETS = {
        beginner: { label: "초급", width: 9, height: 9, mines: 10 },
        intermediate: { label: "중급", width: 16, height: 16, mines: 40 },
        expert: { label: "고급", width: 30, height: 16, mines: 99 }
      };
      const boardElement = document.getElementById("board");
      const counterElement = document.getElementById("mine-counter");
      const timerElement = document.getElementById("timer");
      const faceElement = document.getElementById("reset-button");
      const statusElement = document.getElementById("status");
      const scoresElement = document.getElementById("scores");
      const levelButtons = [...document.querySelectorAll("[data-level]")];
      let game;
      let timerInterval = null;
      let scores = loadScores();

      function newGame(config, level) {
        stopTimer();
        game = {
          width: config.width,
          height: config.height,
          mines: config.mines,
          level,
          cells: Array(config.width * config.height).fill(null).map(() => ({
            mine: false, adjacent: 0, open: false, flagged: false
          })),
          firstClickPending: true,
          status: "playing",
          elapsed: 0,
          startedAt: null,
          hitIndex: null
        };
        updateLevelButtons();
        render();
        saveGame();
      }

      function loadGame() {
        try {
          const raw = localStorage.getItem(SAVE_KEY);
          if (!raw) return false;
          const saved = JSON.parse(raw);
          if (!isValidSave(saved)) {
            console.warn("저장된 게임 데이터가 올바르지 않아 새 게임을 시작합니다.");
            return false;
          }
          game = saved;
          if (game.status === "playing" && !game.firstClickPending && game.startedAt !== null) {
            game.elapsed = Math.min(999, game.elapsed + Math.floor((Date.now() - game.startedAt) / 1000));
            game.startedAt = Date.now();
            startTimer();
          }
          updateLevelButtons();
          render();
          return true;
        } catch (error) {
          console.error("저장된 게임을 불러오지 못했습니다.", error);
          return false;
        }
      }

      function isValidSave(value) {
        if (!value || typeof value !== "object" ||
            !Number.isInteger(value.width) || value.width < 5 || value.width > 30 ||
            !Number.isInteger(value.height) || value.height < 5 || value.height > 24 ||
            !Number.isInteger(value.mines) || value.mines < 1 ||
            value.mines >= value.width * value.height ||
            !Array.isArray(value.cells) || value.cells.length !== value.width * value.height ||
            !["playing", "won", "lost"].includes(value.status) ||
            typeof value.firstClickPending !== "boolean" ||
            !Number.isFinite(value.elapsed) || value.elapsed < 0 ||
            !(value.startedAt === null || Number.isFinite(value.startedAt))) return false;
        if (value.level !== "custom" && !Object.hasOwn(PRESETS, value.level)) return false;
        const mines = value.cells.filter(cell => cell && cell.mine === true).length;
        if (mines !== (value.firstClickPending ? 0 : value.mines)) return false;
        return value.cells.every(cell => cell && typeof cell.mine === "boolean" &&
          Number.isInteger(cell.adjacent) && cell.adjacent >= 0 && cell.adjacent <= 8 &&
          typeof cell.open === "boolean" && typeof cell.flagged === "boolean");
      }

      function saveGame() {
        if (!game) return;
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify(game));
        } catch (error) {
          console.error("게임 진행 상황을 저장하지 못했습니다.", error);
          statusElement.textContent = "저장 공간을 사용할 수 없습니다. 게임은 계속할 수 있습니다.";
        }
      }

      function loadScores() {
        try {
          const saved = JSON.parse(localStorage.getItem(SCORES_KEY) || "[]");
          if (!Array.isArray(saved)) return [];
          return saved.filter(item => item &&
            ["beginner", "intermediate", "expert"].includes(item.level) &&
            Number.isInteger(item.seconds) && item.seconds >= 0 &&
            typeof item.date === "string").slice(0, 15);
        } catch (error) {
          console.error("최고 기록을 불러오지 못했습니다.", error);
          return [];
        }
      }

      function saveScores() {
        try {
          localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
        } catch (error) {
          console.error("최고 기록을 저장하지 못했습니다.", error);
          statusElement.textContent = "기록을 저장하지 못했지만 게임에서 승리했습니다.";
        }
        renderScores();
      }

      function updateLevelButtons() {
        for (const button of levelButtons) {
          const selected = button.dataset.level === game.level;
          button.classList.toggle("active", selected);
          button.setAttribute("aria-pressed", String(selected));
        }
      }

      function deployMines(safeIndex) {
        const candidates = game.cells.map((_, index) => index).filter(index => index !== safeIndex);
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        for (const index of candidates.slice(0, game.mines)) game.cells[index].mine = true;
        for (let index = 0; index < game.cells.length; index++) {
          if (!game.cells[index].mine) {
            game.cells[index].adjacent = neighbors(index).filter(next => game.cells[next].mine).length;
          }
        }
        game.firstClickPending = false;
        game.startedAt = Date.now();
        startTimer();
      }

      function neighbors(index) {
        const x = index % game.width;
        const y = Math.floor(index / game.width);
        const found = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < game.width && ny >= 0 && ny < game.height) {
              found.push(ny * game.width + nx);
            }
          }
        }
        return found;
      }

      function openCell(index) {
        if (game.status !== "playing") return;
        const cell = game.cells[index];
        if (!cell || cell.open || cell.flagged) return;
        if (game.firstClickPending) deployMines(index);
        if (cell.mine) {
          game.status = "lost";
          game.hitIndex = index;
          game.startedAt = null;
          stopTimer();
          faceElement.textContent = "😵";
          statusElement.textContent = "지뢰를 밟았습니다. 새 게임으로 다시 도전하세요.";
        } else {
          floodOpen(index);
          checkWin();
        }
        render();
        saveGame();
      }

      function floodOpen(start) {
        const queue = [start];
        const visited = new Set();
        for (let cursor = 0; cursor < queue.length; cursor++) {
          const index = queue[cursor];
          if (visited.has(index)) continue;
          visited.add(index);
          const cell = game.cells[index];
          if (!cell || cell.open || cell.flagged || cell.mine) continue;
          cell.open = true;
          if (cell.adjacent === 0) {
            for (const next of neighbors(index)) {
              if (!visited.has(next) && !game.cells[next].open) queue.push(next);
            }
          }
        }
      }

      function toggleFlag(index) {
        const cell = game.cells[index];
        if (game.status !== "playing" || cell.open) return;
        cell.flagged = !cell.flagged;
        render();
        saveGame();
      }

      function checkWin() {
        const safeCellsOpen = game.cells.every(cell => cell.mine || cell.open);
        if (!safeCellsOpen) return;
        game.status = "won";
        game.startedAt = null;
        for (const cell of game.cells) if (cell.mine) cell.flagged = true;
        stopTimer();
        faceElement.textContent = "😎";
        statusElement.textContent = "축하합니다! 모든 안전한 칸을 열었습니다.";
        if (game.level !== "custom") {
          scores.push({
            level: game.level,
            seconds: Math.min(999, game.elapsed),
            date: new Date().toISOString().slice(0, 10)
          });
          scores.sort((a, b) => a.seconds - b.seconds);
          scores = scores.slice(0, 15);
          saveScores();
        }
      }

      function startTimer() {
        stopTimer();
        timerInterval = setInterval(() => {
          if (game.status !== "playing" || game.startedAt === null) return;
          game.elapsed = Math.min(999, Math.floor((Date.now() - game.startedAt) / 1000) + game.elapsed);
          game.startedAt = Date.now();
          renderTimer();
          if (game.elapsed >= 999) {
            game.elapsed = 999;
            game.startedAt = null;
            stopTimer();
          }
          saveGame();
        }, 1000);
      }

      function stopTimer() {
        if (timerInterval !== null) clearInterval(timerInterval);
        timerInterval = null;
      }

      function renderTimer() {
        timerElement.textContent = String(Math.min(999, game.elapsed)).padStart(3, "0");
      }

      function render() {
        const flags = game.cells.filter(cell => cell.flagged).length;
        const remaining = game.mines - flags;
        counterElement.textContent = remaining < 0
          ? `-${String(Math.abs(remaining)).padStart(2, "0")}`
          : String(remaining).padStart(3, "0");
        counterElement.setAttribute("aria-label", `남은 지뢰 수 ${remaining}`);
        renderTimer();
        faceElement.textContent = game.status === "won" ? "😎" : game.status === "lost" ? "😵" : "🙂";
        boardElement.style.setProperty("--columns", game.width);
        boardElement.setAttribute("aria-rowcount", String(game.height));
        boardElement.setAttribute("aria-colcount", String(game.width));
        boardElement.replaceChildren();
        game.cells.forEach((cell, index) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "cell";
          button.dataset.index = String(index);
          button.setAttribute("role", "gridcell");
          const row = Math.floor(index / game.width) + 1;
          const column = index % game.width + 1;
          button.setAttribute("aria-label", `행 ${row}, 열 ${column}: ${describeCell(cell, index)}`);
          if (cell.open || game.status === "lost" && cell.mine) {
            button.classList.add("open");
            if (cell.mine) {
              button.textContent = "💣";
              if (index === game.hitIndex) button.classList.add("mine-hit");
            } else if (cell.adjacent > 0) {
              button.textContent = String(cell.adjacent);
              button.classList.add(`n${cell.adjacent}`);
            }
          } else if (cell.flagged) {
            button.textContent = "🚩";
            if (game.status === "won") button.classList.add("open");
            if (game.status === "lost" && !cell.mine) {
              button.textContent = "❌";
              button.classList.add("wrong-flag");
            }
          }
          if (game.status !== "playing") button.disabled = true;
          boardElement.append(button);
        });
      }

      function describeCell(cell, index) {
        if (cell.flagged) return "깃발";
        if (cell.open && cell.mine || game.status === "lost" && cell.mine) return "지뢰";
        if (cell.open) return cell.adjacent ? `주변 지뢰 ${cell.adjacent}개` : "빈 칸";
        if (game.status === "lost" && cell.mine) return "지뢰";
        return "닫힌 칸";
      }

      function renderScores() {
        scoresElement.replaceChildren();
        for (const level of Object.keys(PRESETS)) {
          const best = scores.filter(score => score.level === level)
            .sort((a, b) => a.seconds - b.seconds)[0];
          if (!best) continue;
          const item = document.createElement("li");
          item.textContent = `${PRESETS[level].label} · ${best.seconds}초 · ${best.date}`;
          scoresElement.append(item);
        }
      }

      boardElement.addEventListener("click", event => {
        const button = event.target.closest(".cell");
        if (button) openCell(Number(button.dataset.index));
      });

      boardElement.addEventListener("contextmenu", event => {
        const button = event.target.closest(".cell");
        if (!button) return;
        event.preventDefault();
        toggleFlag(Number(button.dataset.index));
      });

      boardElement.addEventListener("pointerdown", event => {
        if (event.button === 0 && game.status === "playing") faceElement.textContent = "😮";
      });
      boardElement.addEventListener("pointerup", () => {
        if (game.status === "playing") faceElement.textContent = "🙂";
      });
      boardElement.addEventListener("pointerleave", () => {
        if (game.status === "playing") faceElement.textContent = "🙂";
      });
      faceElement.addEventListener("click", () => newGame(game, game.level));

      for (const button of levelButtons) {
        button.addEventListener("click", () => {
          const level = button.dataset.level;
          newGame(PRESETS[level], level);
        });
      }

      document.getElementById("custom-form").addEventListener("submit", event => {
        event.preventDefault();
        const width = Number(document.getElementById("custom-width").value);
        const height = Number(document.getElementById("custom-height").value);
        const mines = Number(document.getElementById("custom-mines").value);
        const mineInput = document.getElementById("custom-mines");
        mineInput.max = String(width * height - 1);
        if (!Number.isInteger(width) || width < 5 || width > 30 ||
            !Number.isInteger(height) || height < 5 || height > 24 ||
            !Number.isInteger(mines) || mines < 1 || mines >= width * height) {
          mineInput.setCustomValidity("지뢰 수는 1개 이상, 전체 칸 수보다 적어야 합니다.");
          mineInput.reportValidity();
          mineInput.setCustomValidity("");
          return;
        }
        newGame({ width, height, mines }, "custom");
      });

      renderScores();
      if (!loadGame()) newGame(PRESETS.beginner, "beginner");
    })();
