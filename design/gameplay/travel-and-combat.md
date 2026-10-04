[← Design index](../../game.md)

# Travel & Combat

- Travel between stations happens **at warp**, the only place the KL9 can attack you. Warp streaks rush past and the HUD reads "AT WARP" until the first wave.
- The ship is seen top-down with the stars scrolling past. It moves forward, back, left and right but **never turns**.
- Combat is arcade style against waves of enemies. Weapon damage removes enemy HP until the enemy is destroyed.
- Each trip is **1-4 waves**. More difficult routes tend to have more waves.
- **You must destroy every enemy in a wave before the next one starts.** Enemies never escape: anything that flies off the screen comes back in from the top for another pass. The HUD shows how many hostiles are left (and how many escorts remain during a boss fight). Asteroids are obstacles, not enemies; they drift past and don't need to be destroyed.
- A **boss** (capital ship) may appear after the last wave. The chance is 15% + 3.5% per difficulty level. The route into the Terminus always has 5 waves and a boss.
- Once the route is clear, the ship jumps toward the destination and the [docking mini-game](docking.md) begins.

**HUD:** hull and shield bars, wave counter, boss health bar, the route and its difficulty, bounty earned so far, and the weapon slots.

**Controls**

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move | WASD / Arrows | Left stick (analog: tilt less to go slower) or D-pad |
| Fire | Space / J | A or RT |
| Toggle auto-fire | F | X |
| Select weapon | 1–4, Q / E | LB / RB |
| Pause | Esc / P | Start |

Docking uses the same movement controls; the stick gives proportional thrust.

The game also pauses automatically if the window loses focus.

**Gamepad:** any controller Chrome recognizes works, using its standard (Xbox-style) layout. A Logitech F310 on a Mac must be in **D mode** (switch on the back); in X mode macOS has no driver and Chrome can't see it. If Chrome reports a non-standard layout, the game falls back to the F310's D-mode layout. A toast confirms when a gamepad connects, and the [test console](../foundations/test-console.md)'s `pad` command shows exactly what Chrome reports.

**Pause menu:** Resume, or **Retreat to origin**. Retreating forfeits the contract and bounties but costs no fee. Hull damage is kept.

See also: [Enemies](../enemies/enemies.md), [Homing Shots](../enemies/homing-shots.md), [Boss](../enemies/boss.md).
