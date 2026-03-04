import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useActor } from "./hooks/useActor";

// ─── Constants ────────────────────────────────────────────────────────────────

const CELL_SIZE = 20;
const GRID_COLS = 24;
const GRID_ROWS = 24;
const CANVAS_W = CELL_SIZE * GRID_COLS;
const CANVAS_H = CELL_SIZE * GRID_ROWS;
const MOVE_INTERVAL = 150; // ms per step

// Canvas literal colors (cannot use CSS vars)
const C = {
  bg: "#0a0d0b",
  grid: "#111a13",
  snakeHead: "#a8ff78",
  snakeBody: "#5bcc52",
  snakeGlow: "rgba(130, 255, 100, 0.55)",
  food: "#ff4a4a",
  foodGlow: "rgba(255, 74, 74, 0.65)",
  foodInner: "#ff8888",
  headEye: "#0a0d0b",
  score: "#a8ff78",
  overlay: "rgba(8, 11, 9, 0.88)",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Dir = "UP" | "DOWN" | "LEFT" | "RIGHT";
type GameStatus = "start" | "playing" | "paused" | "over";

interface Pos {
  x: number;
  y: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomCell(snake: Pos[]): Pos {
  const occupied = new Set(snake.map((p) => `${p.x},${p.y}`));
  let pos: Pos;
  do {
    pos = {
      x: Math.floor(Math.random() * GRID_COLS),
      y: Math.floor(Math.random() * GRID_ROWS),
    };
  } while (occupied.has(`${pos.x},${pos.y}`));
  return pos;
}

function dirOpposite(a: Dir, b: Dir): boolean {
  return (
    (a === "UP" && b === "DOWN") ||
    (a === "DOWN" && b === "UP") ||
    (a === "LEFT" && b === "RIGHT") ||
    (a === "RIGHT" && b === "LEFT")
  );
}

function initSnake(): Pos[] {
  const headX = Math.floor(GRID_COLS / 2);
  const headY = Math.floor(GRID_ROWS / 2);
  return [
    { x: headX, y: headY },
    { x: headX - 1, y: headY },
    { x: headX - 2, y: headY },
  ];
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= GRID_COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL_SIZE, 0);
    ctx.lineTo(x * CELL_SIZE, CANVAS_H);
    ctx.stroke();
  }
  for (let y = 0; y <= GRID_ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL_SIZE);
    ctx.lineTo(CANVAS_W, y * CELL_SIZE);
    ctx.stroke();
  }
}

function drawFood(ctx: CanvasRenderingContext2D, food: Pos, tick: number) {
  const cx = food.x * CELL_SIZE + CELL_SIZE / 2;
  const cy = food.y * CELL_SIZE + CELL_SIZE / 2;
  const pulse = Math.sin(tick * 0.08) * 1.5;
  const r = CELL_SIZE / 2 - 3 + pulse;

  ctx.save();
  ctx.shadowColor = C.foodGlow;
  ctx.shadowBlur = 14 + pulse * 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = C.food;
  ctx.fill();

  // Inner bright spot
  ctx.beginPath();
  ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = C.foodInner;
  ctx.fill();
  ctx.restore();
}

function drawSnake(ctx: CanvasRenderingContext2D, snake: Pos[]) {
  if (snake.length === 0) return;
  const pad = 2;

  // Body
  ctx.save();
  ctx.shadowColor = C.snakeGlow;
  ctx.shadowBlur = 10;
  for (let i = snake.length - 1; i > 0; i--) {
    const p = snake[i];
    const alpha = Math.max(0.3, 1 - (i / snake.length) * 0.7);
    ctx.fillStyle =
      i % 2 === 0
        ? `rgba(91, 204, 82, ${alpha})`
        : `rgba(78, 180, 70, ${alpha})`;
    ctx.beginPath();
    const r = (CELL_SIZE - pad * 2) / 2;
    const cx = p.x * CELL_SIZE + CELL_SIZE / 2;
    const cy = p.y * CELL_SIZE + CELL_SIZE / 2;
    ctx.roundRect(cx - r, cy - r, r * 2, r * 2, 4);
    ctx.fill();
  }
  ctx.restore();

  // Head
  const head = snake[0];
  const hx = head.x * CELL_SIZE + pad;
  const hy = head.y * CELL_SIZE + pad;
  const hw = CELL_SIZE - pad * 2;

  ctx.save();
  ctx.shadowColor = C.snakeGlow;
  ctx.shadowBlur = 18;
  ctx.fillStyle = C.snakeHead;
  ctx.beginPath();
  ctx.roundRect(hx, hy, hw, hw, 5);
  ctx.fill();
  ctx.restore();

  // Eyes on head
  ctx.fillStyle = C.headEye;
  const eyeR = 2;
  const eyeOffX = hw * 0.28;
  const eyeOffY = hw * 0.28;
  const hcx = head.x * CELL_SIZE + CELL_SIZE / 2;
  const hcy = head.y * CELL_SIZE + CELL_SIZE / 2;
  ctx.beginPath();
  ctx.arc(hcx - eyeOffX, hcy - eyeOffY, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(hcx + eyeOffX, hcy - eyeOffY, eyeR, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const { actor, isFetching: actorFetching } = useActor();
  const queryClient = useQueryClient();

  // ── Backend queries ──
  const { data: highScore = BigInt(0), isLoading: hsLoading } =
    useQuery<bigint>({
      queryKey: ["highScore"],
      queryFn: () => actor!.getHighScore(),
      enabled: !!actor && !actorFetching,
    });

  const { mutate: submitScore } = useMutation({
    mutationFn: (score: bigint) => actor!.submitScore(score),
    onSuccess: (newHs) => {
      queryClient.setQueryData(["highScore"], newHs);
      setHighScoreDisplay(Number(newHs));
    },
  });

  // ── UI state ──
  const [gameStatus, setGameStatus] = useState<GameStatus>("start");
  const [score, setScore] = useState(0);
  const [highScoreDisplay, setHighScoreDisplay] = useState(0);

  // sync hs display when backend loads
  useEffect(() => {
    setHighScoreDisplay(Number(highScore));
  }, [highScore]);

  // ── Refs for rAF loop ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snakeRef = useRef<Pos[]>(initSnake());
  const dirRef = useRef<Dir>("RIGHT");
  const pendingDirRef = useRef<Dir | null>(null);
  const foodRef = useRef<Pos>(randomCell(snakeRef.current));
  const scoreRef = useRef(0);
  const tickRef = useRef(0);
  const lastMoveRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const gameStatusRef = useRef<GameStatus>("start");

  // Keep gameStatusRef in sync
  useEffect(() => {
    gameStatusRef.current = gameStatus;
  }, [gameStatus]);

  // ── Reset game state ──
  const resetGame = useCallback(() => {
    const snake = initSnake();
    snakeRef.current = snake;
    dirRef.current = "RIGHT";
    pendingDirRef.current = null;
    foodRef.current = randomCell(snake);
    scoreRef.current = 0;
    tickRef.current = 0;
    lastMoveRef.current = 0;
    setScore(0);
  }, []);

  // ── Game loop ──
  const gameLoop = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      rafRef.current = requestAnimationFrame(gameLoop);
      tickRef.current++;

      const status = gameStatusRef.current;

      // Only advance snake when playing and enough time has passed
      if (
        status === "playing" &&
        timestamp - lastMoveRef.current >= MOVE_INTERVAL
      ) {
        lastMoveRef.current = timestamp;

        // Apply pending direction
        if (
          pendingDirRef.current &&
          !dirOpposite(dirRef.current, pendingDirRef.current)
        ) {
          dirRef.current = pendingDirRef.current;
        }
        pendingDirRef.current = null;

        // Move snake
        const head = snakeRef.current[0];
        let nx = head.x;
        let ny = head.y;
        if (dirRef.current === "UP") ny--;
        if (dirRef.current === "DOWN") ny++;
        if (dirRef.current === "LEFT") nx--;
        if (dirRef.current === "RIGHT") nx++;

        // Wall collision
        if (nx < 0 || nx >= GRID_COLS || ny < 0 || ny >= GRID_ROWS) {
          setGameStatus("over");
          gameStatusRef.current = "over";
          submitScore(BigInt(scoreRef.current));
          return;
        }

        // Self collision
        const selfHit = snakeRef.current.some((p) => p.x === nx && p.y === ny);
        if (selfHit) {
          setGameStatus("over");
          gameStatusRef.current = "over";
          submitScore(BigInt(scoreRef.current));
          return;
        }

        const newHead: Pos = { x: nx, y: ny };
        const ateFood = nx === foodRef.current.x && ny === foodRef.current.y;

        if (ateFood) {
          snakeRef.current = [newHead, ...snakeRef.current];
          scoreRef.current++;
          setScore(scoreRef.current);
          foodRef.current = randomCell(snakeRef.current);
        } else {
          snakeRef.current = [newHead, ...snakeRef.current.slice(0, -1)];
        }
      }

      // ── Render ──
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx);

      if (status !== "start") {
        drawFood(ctx, foodRef.current, tickRef.current);
        drawSnake(ctx, snakeRef.current);
      }

      // Pause overlay
      if (status === "paused") {
        ctx.fillStyle = C.overlay;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.save();
        ctx.fillStyle = "#a8ff78";
        ctx.shadowColor = "rgba(130, 255, 100, 0.8)";
        ctx.shadowBlur = 20;
        ctx.font = "bold 28px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("PAUSED", CANVAS_W / 2, CANVAS_H / 2);
        ctx.restore();
      }
    },
    [submitScore],
  );

  // Start / restart
  const startGame = useCallback(() => {
    resetGame();
    setGameStatus("playing");
    gameStatusRef.current = "playing";
  }, [resetGame]);

  // Pause / resume
  const togglePause = useCallback(() => {
    setGameStatus((prev) => {
      const next = prev === "playing" ? "paused" : "playing";
      gameStatusRef.current = next;
      return next;
    });
  }, []);

  // Direction control
  const changeDir = useCallback((d: Dir) => {
    pendingDirRef.current = d;
  }, []);

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
      }
      if (gameStatusRef.current === "over" && e.key === "Enter") {
        startGame();
        return;
      }
      if (gameStatusRef.current === "start" && e.key === "Enter") {
        startGame();
        return;
      }
      if (
        (gameStatusRef.current === "playing" ||
          gameStatusRef.current === "paused") &&
        e.key === " "
      ) {
        e.preventDefault();
        togglePause();
        return;
      }
      if (gameStatusRef.current !== "playing") return;
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W")
        changeDir("UP");
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S")
        changeDir("DOWN");
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A")
        changeDir("LEFT");
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D")
        changeDir("RIGHT");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startGame, togglePause, changeDir]);

  // ── Start rAF on mount ──
  useEffect(() => {
    rafRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [gameLoop]);

  const isLoading = hsLoading || actorFetching;
  const hs = highScoreDisplay;

  return (
    <div className="min-h-screen flex flex-col items-center justify-between bg-background flicker select-none">
      {/* CRT scanlines */}
      <div className="crt-overlay" aria-hidden="true" />

      {/* Header */}
      <header className="w-full flex items-center justify-between px-6 pt-5 pb-3 border-b border-border max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <span
            className="text-xl font-bold tracking-widest glow-text"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            SN<span className="blink">_</span>KE
          </span>
          <span className="text-xs text-muted-foreground tracking-widest uppercase">
            v1.0
          </span>
        </div>
        <div className="text-xs text-muted-foreground tracking-wider">
          <span className="glow-text-dim">HI</span>
          <span className="ml-2 score-num glow-text font-bold text-sm">
            {String(hs).padStart(4, "0")}
          </span>
        </div>
      </header>

      {/* Main game area */}
      <main className="flex-1 flex flex-col items-center justify-center gap-4 py-4 px-4 w-full max-w-2xl mx-auto">
        {/* Score bar */}
        <div
          data-ocid="game.score.panel"
          className="w-full flex items-center justify-between px-4 py-2 border border-border glow-box"
          style={{
            maxWidth: CANVAS_W,
            background:
              "linear-gradient(90deg, oklch(0.10 0.02 142) 0%, oklch(0.13 0.03 142) 50%, oklch(0.10 0.02 142) 100%)",
          }}
        >
          <div className="text-xs tracking-widest text-muted-foreground uppercase">
            Score
          </div>
          <div className="score-num text-2xl font-bold glow-text">
            {String(score).padStart(4, "0")}
          </div>
          <button
            type="button"
            data-ocid="game.pause_button"
            onClick={togglePause}
            disabled={gameStatus === "start" || gameStatus === "over"}
            className="pixel-btn px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label={gameStatus === "paused" ? "Resume" : "Pause"}
          >
            {gameStatus === "paused" ? (
              <>
                <Play className="w-3 h-3" />
                <span>RESUME</span>
              </>
            ) : (
              <>
                <Pause className="w-3 h-3" />
                <span>PAUSE</span>
              </>
            )}
          </button>
        </div>

        {/* Canvas wrapper — CRT monitor frame */}
        <div
          className="relative glow-box"
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            maxWidth: "100%",
            borderRadius: "2px",
            outline: "4px solid oklch(0.18 0.04 142)",
            outlineOffset: "2px",
          }}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            data-ocid="game.canvas_target"
            style={{
              display: "block",
              imageRendering: "pixelated",
              maxWidth: "100%",
              height: "auto",
            }}
          />

          {/* Start screen overlay */}
          <AnimatePresence>
            {gameStatus === "start" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-6"
                style={{ background: "rgba(8,11,9,0.92)" }}
              >
                {isLoading ? (
                  <div
                    data-ocid="game.loading_state"
                    className="flex flex-col items-center gap-3 flicker"
                  >
                    <div
                      className="text-4xl font-bold glow-text tracking-widest"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      LOADING<span className="blink">_</span>
                    </div>
                    <div className="text-xs text-muted-foreground tracking-wider">
                      FETCHING HIGH SCORE
                    </div>
                  </div>
                ) : (
                  <motion.div
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="flex flex-col items-center gap-5"
                  >
                    <div className="text-center">
                      <div
                        className="text-5xl font-bold glow-text tracking-[0.25em]"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        SNAKE
                      </div>
                      <div className="text-xs text-muted-foreground tracking-[0.35em] mt-1 uppercase">
                        arcade edition
                      </div>
                    </div>
                    <div className="border border-border px-5 py-2 text-center">
                      <div className="text-xs text-muted-foreground tracking-widest uppercase mb-1">
                        High Score
                      </div>
                      <div className="score-num text-3xl font-bold glow-text">
                        {String(hs).padStart(4, "0")}
                      </div>
                    </div>
                    <button
                      type="button"
                      data-ocid="game.start_button"
                      onClick={startGame}
                      className="pixel-btn px-8 py-3 text-sm tracking-widest glow-box glow-box-hover"
                    >
                      [ START GAME ]
                    </button>
                    <div className="text-xs text-muted-foreground text-center space-y-1">
                      <div>WASD / ARROW KEYS to move</div>
                      <div>SPACE to pause · ENTER to start</div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Game over overlay */}
          <AnimatePresence>
            {gameStatus === "over" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-5"
                style={{ background: "rgba(8,11,9,0.93)" }}
              >
                <motion.div
                  initial={{ y: -8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.05 }}
                  className="text-center"
                >
                  <div
                    className="text-4xl font-bold glow-red tracking-widest"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      color: "#ff4a4a",
                    }}
                  >
                    GAME OVER
                  </div>
                  <div className="text-xs tracking-widest text-muted-foreground mt-1 uppercase">
                    system terminated
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className="border border-border divide-y divide-border text-center"
                >
                  <div className="px-8 py-3">
                    <div className="text-xs text-muted-foreground tracking-widest uppercase mb-1">
                      Score
                    </div>
                    <div className="score-num text-3xl font-bold glow-text">
                      {String(score).padStart(4, "0")}
                    </div>
                  </div>
                  <div className="px-8 py-3">
                    <div className="text-xs text-muted-foreground tracking-widest uppercase mb-1">
                      High Score
                    </div>
                    <div
                      className="score-num text-2xl font-bold"
                      style={{
                        color: score >= hs && score > 0 ? "#a8ff78" : "#6a9e64",
                      }}
                    >
                      {String(hs).padStart(4, "0")}
                      {score > 0 && score >= hs && (
                        <span className="text-xs ml-2 glow-text tracking-wider">
                          {" "}
                          ◄ NEW
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>

                <motion.button
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  data-ocid="game.restart_button"
                  onClick={startGame}
                  className="pixel-btn px-8 py-3 text-sm tracking-widest flex items-center gap-2 glow-box glow-box-hover"
                >
                  <RotateCcw className="w-3.5 h-3.5" />[ RESTART ]
                </motion.button>
                <div className="text-xs text-muted-foreground tracking-wider">
                  PRESS ENTER TO RESTART
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* D-pad controls */}
        <div
          className="flex flex-col items-center gap-1"
          aria-label="Directional controls"
        >
          {/* Up */}
          <button
            type="button"
            data-ocid="game.controls.button.1"
            className="dpad-btn"
            onPointerDown={() => {
              if (gameStatus === "playing") changeDir("UP");
            }}
            aria-label="Move up"
          >
            <ChevronUp className="w-5 h-5" />
          </button>

          {/* Middle row: Left + Right */}
          <div className="flex gap-1">
            <button
              type="button"
              data-ocid="game.controls.button.4"
              className="dpad-btn"
              onPointerDown={() => {
                if (gameStatus === "playing") changeDir("LEFT");
              }}
              aria-label="Move left"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            {/* Center pad (nonfunctional, visual) */}
            <div
              className="w-[52px] h-[52px] flex items-center justify-center border border-border"
              style={{ background: "#0c110d" }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: "oklch(0.22 0.04 142)" }}
              />
            </div>
            <button
              type="button"
              data-ocid="game.controls.button.2"
              className="dpad-btn"
              onPointerDown={() => {
                if (gameStatus === "playing") changeDir("RIGHT");
              }}
              aria-label="Move right"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Down */}
          <button
            type="button"
            data-ocid="game.controls.button.3"
            className="dpad-btn"
            onPointerDown={() => {
              if (gameStatus === "playing") changeDir("DOWN");
            }}
            aria-label="Move down"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>

        {/* Keyboard hints */}
        <div className="text-xs text-muted-foreground tracking-wider text-center space-x-3 hidden sm:block">
          <span>WASD / ARROWS — move</span>
          <span className="text-border">|</span>
          <span>SPACE — pause</span>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-border py-3 px-6 flex items-center justify-center max-w-2xl mx-auto">
        <p className="text-xs text-muted-foreground tracking-wider">
          © {new Date().getFullYear()} · Built with{" "}
          <span className="glow-text">♥</span> using{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:glow-text transition-all"
          >
            caffeine.ai
          </a>
        </p>
      </footer>
    </div>
  );
}
