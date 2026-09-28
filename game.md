# TXL TRADER

# Overview

A 2D video game where the player controls a spaceship seen from a top-down view. The goal is to move goods from station to station, fighting enemies and obstacles on each trip. Reaching the **Terminus** at the far edge of the map wins the game.

# Tech Stack

- JavaScript (ES modules), built and served with Vite (`npm run dev`).
- Three.js for all rendering, with a bloom post-process for the neon look.
- Menus, the station screen and the in-flight HUD are HTML/CSS layered over the Three.js canvas.
- Sound effects are generated in code with WebAudio. There are no image or audio files.
- Progress auto-saves to the browser's `localStorage` each time you dock.

## Visual Style

Neon vector graphics: glowing outlined shapes with a translucent fill over a scrolling parallax starfield. Every enemy type has its own shape and color, and explosions are particle bursts.

# Game Play

## Main Menu

- **Continue** appears when a save exists.
- **New Game** starts a fresh galaxy. It asks for confirmation if it would overwrite a save.
- **Sound On/Off** toggle.
- A short How to Play panel with the controls.

A new game starts with **60 credits**, the starting ship and the Pulse Laser.

## Station Screen

The header shows the station name and its tier, your credits, your hull (with a **Repair** button when damaged) and your **Ship Rating**. A **Menu** button returns to the main menu.

The screen has three tabs. A footer on every tab shows the selected contract and the **Launch** button, which stays disabled until a destination is selected.

*Destination Selection (Contracts tab)* Each station offers 1–3 contracts, one for each connected station. Each contract shows:

- the destination, and whether you have visited it
- the route difficulty (1–10)
- the good to carry and the pay per unit
- the distance and roughly how many waves to expect `q  `
- the total payout: cargo units × pay per unit

Contracts whose difficulty is above your Ship Rating are **locked**. New contracts are generated every time you dock.

*Ship Systems* Shows your Ship Rating and what you need for the next rating, then the upgrades and weapons (see **Ship & Upgrades**).

*Star Map* The whole galaxy:

- Drag to pan, scroll to zoom. **Center on me** and **Show all** buttons.
- Systems are colored by tier and are dim until visited.
- Your location pulses. Contract destinations are ringed: cyan if you can fly there, red if locked.
- Hovering a system shows its details. Clicking a ringed system selects its contract.

## Travel Screen

- The ship is seen top-down with the stars scrolling past. It moves forward, back, left and right but **never turns**.
- Combat is arcade style against waves of enemies. Weapon damage removes enemy HP until the enemy is destroyed.
- Each trip is **2–5 waves**. Longer routes tend to have more waves.
- A **boss** (capital ship) may appear after the last wave. The chance is 15% + 3.5% per difficulty level. The route into the Terminus always has 5 waves and a boss.
- Once the route is clear, a station slides into view and the ship docks.

**HUD:** hull and shield bars, wave counter, boss health bar, the route and its difficulty, bounty earned so far, and the weapon slots.

**Controls**

| Key | Action |
| --- | --- |
| WASD / Arrows | Move |
| Space / J | Fire |
| F | Toggle auto-fire |
| 1–4, Q / E | Select weapon |
| Esc / P | Pause |

The game also pauses automatically if the window loses focus.

**Pause menu:** Resume, or **Retreat to origin**. Retreating forfeits the contract and bounties but costs no fee. Hull damage is kept.

## End of a Trip

| Outcome | Result |
| --- | --- |
| **Delivered** | Paid for the cargo plus bounties for every kill. Hull damage carries over. The destination becomes your current station. |
| **Destroyed** | Cargo and bounties are lost. Pay a tow fee (40 cr × 1.55^(difficulty−1), capped at the credits you have). The ship is rebuilt to full hull back at the origin station. |
| **Retreated** | Back at the origin station, contract forfeited, no fee. |

A summary pop-up shows the result every time you return to a station.

# Ship & Upgrades

## Ship Rating

Rating = floor((Weapons Core + Hull + Shield + 1) / 3), with a maximum of 10. The shield starts at level 0, which is why it counts +1. The starting ship is rating 1.

**You can only accept routes whose difficulty is at or below your rating.** This is what forces you to grind level-1 routes and upgrade before moving on to level 2, and so on.

## Systems

Upgrade cost = base cost × 1.6 for each level already bought.

| System | Counts toward rating | Start → Max | Effect | Base cost |
| --- | --- | --- | --- | --- |
| Weapons Core | Yes | 1 → 10 | All weapon damage ×1.45 per level | 210 |
| Hull Plating | Yes | 1 → 10 | 120 hull, ×1.33 per level | 180 |
| Deflector Shield | Yes | 0 → 10 | 35 shield at level 1, ×1.33 per level. Recharges 22%/s after 2.5 s without being hit | 240 |
| Engines | No | 1 → 6 | Speed 40, +6 per level | 300 |
| Cargo Hold | No | 1 → 10 | 8 units, +4 per level (more pay per contract) | 250 |

**Repairs:** hull is repaired at a station. A full repair costs 50 cr × 1.55^(Hull level−1), scaled by how much hull is missing.

## Weapons

Each weapon is bought once, and all of them are boosted by the Weapons Core. You switch between owned weapons in flight.

| Weapon | Cost | Behavior | Base DPS |
| --- | --- | --- | --- |
| Pulse Laser | Starting weapon | Fast single bolts straight ahead | 60 |
| Scatter Cannon | 450 | 5-pellet spread, short range | 78 |
| Seeker Missiles | 1,600 | Twin homing missiles | 82 |
| Ion Beam | 4,500 | Continuous beam that hits the first enemy in line | 100 |

# Enemies

Enemy stats scale with route difficulty (d):

- HP ×1.45^(d−1)
- damage ×1.33^(d−1)
- fire rate 0.7 + 0.06×(d−1)
- bullet speed +4% per level
- bounties ×1.55^(d−1)

The HP and damage rates match the player's upgrade scaling, so upgrades at level N are balanced for difficulty-N routes.

| Enemy | From difficulty | HP (d1) | Behavior |
| --- | --- | --- | --- |
| Scout | 1 | 20 | Weaves down in formation and fires straight down |
| Asteroid (obstacle) | 1 | 45 (scales with size) | Drifts and spins. Hurts on contact |
| Fighter | 1 | 40 | Hovers, tracks your position, fires aimed shots, then leaves |
| Kamikaze | 3 | 14 | Locks onto you and rams |
| Gunship | 4 | 180 | Slow and tough. Strafes and fires a 5-shot spread |
| Sniper | 6 | 70 | Hangs back, repositions and fires fast 3-shot bursts |

Each wave has a spawn budget of 6 + 1.9×d + 2.5×(wave number, starting at 0). Enemies arrive in groups: lines, columns, V formations or scattered.

**Boss (capital ship):** 1,100 HP at d1 (scaled like other enemies), 100 cr bounty at d1. It cycles through attack patterns:

- **Fan:** a spread of shots across the screen.
- **Aimed:** rapid shots at the player.
- **Spiral:** rotating arms of bullets.
- **Summon:** calls in escorts from difficulty 3 (scouts, or kamikazes from difficulty 5).

Below 50% HP it gets faster and its spreads get wider.

# Route Difficulty & Economy

*Route Difficulty* Each route has a difficulty from 1 to 10, equal to the higher tier of its two stations. Level 1 can be done with the starting ship. After that, the Ship Rating gate means you must trade and upgrade before taking harder routes.

**Pay per unit:** 1.6 × good base price × 1.55^(d−1) × random 0.85–1.2 × (1 + distance/300).

Better goods unlock at higher difficulties:

| Difficulty | Goods |
| --- | --- |
| 1 | Ice Water, Hydroponic Greens, Textiles, Machine Parts |
| 2 | Medical Supplies, Ore Concentrate |
| 3 | Fusion Cells, Cryo Colonists |
| 4 | Nanofiber, Terraforming Seeds |
| 5 | Quantum Chips, Luxury Goods |
| 6 | Antimatter Pods, Xeno Artifacts |
| 7 | Dark Matter |
| 8 | Neural Cores |
| 9 | Singularity Shards |
| 10 | Void Relics |

A route of difficulty d offers goods unlocked at d, d−1 or d−2. The route to the Terminus carries the special cargo **Founders' Beacon**.

With this tuning, reaching each new rating takes roughly 2–3 deliveries.

# Map

- **100 star systems** generated from a random seed: 10 tiers of 10 systems laid out left to right.
- The last tier has 9 systems plus the **Terminus**, the final destination at the far right, where the game is won.
- Each station links to 1–3 others. Links only join the same or neighboring tiers, so difficulty rises gradually.
- The map is always fully connected. The shortest path from start to Terminus is about 30 jumps.
- You start at the leftmost tier-1 system.

## Victory

Delivering to the Terminus shows a victory screen with your stats: deliveries, credits earned, kills, bosses destroyed, ships lost and systems visited. From there you can **Keep flying** on the same save or go to the main menu.

# Open Questions / Ideas for Review

- Is ~30 jumps and ~2–3 deliveries per rating the right length, or should the run be shorter?
- Should the Ship Rating be a hard lock, or only a warning ("under-equipped")?
- Is the loss on destruction (cargo + bounties + tow fee) too harsh or too soft?
- Should the map hide unvisited systems (fog of war) instead of showing everything?
- Possible additions:
  - random events between waves (pirates demanding cargo, derelicts to salvage)
  - buying cargo instead of loading it for free
  - weapon-specific upgrades
  - music
  - gamepad and touch controls
