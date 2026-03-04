# Snake Game

## Current State
New project — no existing code.

## Requested Changes (Diff)

### Add
- Classic Snake arcade game playable in the browser
- Canvas-based game board rendered with Canvas API and requestAnimationFrame
- Snake movement controlled by arrow keys or WASD
- Food that spawns at random positions; eating food grows the snake and increments score
- Game ends when snake hits a wall or itself
- High score tracking stored in the backend (persisted across sessions)
- Start screen, active game screen, and game-over screen with final score
- Pause/resume support (spacebar or button)

### Modify
- Nothing (new project)

### Remove
- Nothing (new project)

## Implementation Plan
1. Backend: store and retrieve high score per user (anonymous session-based or global leaderboard)
2. Frontend: Canvas-based Snake game component
   - Game loop using requestAnimationFrame with fixed time-step logic
   - Snake entity: array of grid cells, direction, growth flag
   - Food entity: random grid position avoiding snake body
   - Collision detection: wall and self
   - Score display and high score display
   - Keyboard and on-screen button controls
   - Start / Game Over overlays
