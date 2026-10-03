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

Low poly solid vector graphics. A rugged, gritty style with a translucent fill over a scrolling parallax starfield. Every enemy type has its own shape and color, and explosions are particle bursts.

- **Ships and stations:** solid low-poly hulls with chamfered edges, flat-shaded under a single key light. Uneven panel shading, occasional scorch marks and dark panel lines make them look worn.
- **Translucent fill:** glass canopies on ships, the shield bubble and engine glow.
- **Palette:** muted and weathered (rust, ochre, olive, steel). Glow is kept only for shots, engines, warning lights and explosions.
- **Explosions:** fireball particles plus debris in the wreck's hull color.
- **Background:** asteroids are tumbling low-poly rocks, and docking scenes show a low-poly planet.
- **Interface:** an industrial look with amber accents on gunmetal panels, hard corners and the Chakra Petch typeface.

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
- the distance and roughly how many waves to expect
- the total payout: cargo units × pay per unit

Every contract can be flown. Each card shows a **danger rating** for your ship (see **Ship Rating**), and routes above your rating get a red border. Selecting a contract of Extreme danger or worse turns the button into a red **Launch anyway**. New contracts are generated every time you dock.

*Ship Systems* Shows your Ship Rating and what you need for the next rating, then the upgrades and weapons (see **Ship & Upgrades**).

*Star Map* The whole galaxy:

- Drag to pan, scroll to zoom. **Center on me** and **Show all** buttons.
- Systems are colored by tier and are dim until visited.
- Your location pulses. Contract destinations are ringed in their danger color.
- Hovering a system shows its details. Clicking a ringed system selects its contract.

## Travel Screen

- The ship is seen top-down with the stars scrolling past. It moves forward, back, left and right but **never turns**.
- Combat is arcade style against waves of enemies. Weapon damage removes enemy HP until the enemy is destroyed.
- Each trip is **1-4 waves**. More difficult routes tend to have more waves.
- **You must destroy every enemy in a wave before the next one starts.** Enemies never escape: anything that flies off the screen comes back in from the top for another pass. The HUD shows how many hostiles are left (and how many escorts remain during a boss fight). Asteroids are obstacles, not enemies; they drift past and don't need to be destroyed.
- A **boss** (capital ship) may appear after the last wave. The chance is 15% + 3.5% per difficulty level. The route into the Terminus always has 5 waves and a boss.
- Once the route is clear, the ship jumps toward the destination and the docking mini-game begins.

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

## Docking / Undocking at Stations

Each docking and undocking is a mini-game. Every flight is: **undock** at the origin → **travel** waves → **dock** at the destination.

- **Undocking:** the ship starts on its assigned pad. You must fly clear of the station and through the **departure gate** at the top of the screen.
- **Docking:** the ship arrives from the bottom of the screen and is assigned a numbered pad. To land, fly onto the pad and **hold steady** (moving slowly) for 1.5 seconds. A ring around the pad fills as you land. Drifting off the pad drains the ring.
- **Flying:** same controls, and the ship still never turns, but it has **inertia**. It drifts, so you must brake by thrusting the other way. Small puffs from the thrusters show which way you're pushing. A faint guide line points to the pad or gate.
- **Hazards:** the station hub, its arms, traffic ships and maintenance drones are all solid. Hitting one hard is a **bump**: it costs 4% of max hull and bounces you off. Docking can't destroy the ship, since hull stops at 1.
- **Precision docking bonus:** landing with **no bumps** pays a bonus of 10% of the cargo payout.
- There is no time limit. The HUD shows elapsed time and your bump count.

Each system is a lively environment with other ships coming and going and ongoing maintenance activity:

- **Station layout:** each station has its own layout: a central hub with arms leading out to 3–6 numbered landing pads. It is the same every visit and is based on the station's tier color. A planet hangs in the background.
- **Traffic:**
  - Shuttles, tugs and freighters fly in, land on free pads, wait, then undock and leave.
  - Other ships cross the screen without stopping.
  - Traffic never uses your assigned pad.
- **Maintenance:** drones move along the station arms and stop to weld, throwing off sparks. Warning lights blink on the hub and pads.
- **Difficulty by tier:**
  - Higher-tier stations have more pads and more traffic, up to 8 ships.
  - **Every station rotates**, so the pads are always moving. Tier-1 stations turn slowly (pads drift about 1.6 units/s), and the spin gets faster with each tier, up to about 4.4 units/s at tier 10.

## End of a Trip

| Outcome | Result |
| --- | --- |
| **Delivered** | Paid for the cargo plus bounties for every kill, plus the precision docking bonus if you docked without bumps. Hull damage (including bumps while docking and undocking) carries over. The destination becomes your current station. |
| **Destroyed** | Cargo and bounties are lost. Pay a tow fee (40 cr × 1.55^(difficulty−1), capped at the credits you have). The ship is rebuilt to full hull back at the origin station. |
| **Retreated** | Back at the origin station, contract forfeited, no fee. |

A summary pop-up shows the result every time you return to a station.

# Ship & Upgrades

## Ship Rating

Rating = floor((Weapons Core + Hull + Shield + 1) / 3), with a maximum of 10. The shield starts at level 0, which is why it counts +1. The starting ship is rating 1.

**Nothing is locked.** Your rating only sets each route's **danger**:

| Route difficulty vs. rating | Danger |
| --- | --- |
| Below your rating | Low |
| Equal to your rating | Moderate |
| 1 above | High |
| 2 above | Extreme |
| 3 or more above | Suicidal |

Even Moderate routes can kill you, since enemies hit hard at every level. Upgrading is how you make harder routes survivable.

## Systems

Upgrade cost = base cost × 1.6 for each level already bought.

| System | Counts toward rating | Start → Max | Effect | Base cost |
| --- | --- | --- | --- | --- |
| Weapons Core | Yes | 1 → 10 | All weapon damage ×1.75 per level | 210 |
| Hull Plating | Yes | 1 → 10 | 120 hull, ×1.43 per level | 180 |
| Deflector Shield | Yes | 0 → 10 | 35 shield at level 1, ×1.43 per level. Recharges 22%/s after 2.5 s without being hit | 240 |
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

- HP ×1.75^(d−1)
- damage ×1.43^(d−1)
- fire rate 1.1 + 0.06×(d−1)
- bullet speed +4% per level
- bounties ×1.55^(d−1)

The HP and damage rates match the player's upgrade scaling, so upgrades at level N are balanced for difficulty-N routes.

For comparison, the starting ship moves at 40. Base damage is high everywhere: one shot from a scout takes 20% of the starting ship's 120 hull, and a kamikaze ram takes over 60%.

| Enemy | HP (d1) | Shot damage (d1) | Shot speed (d1) | Ram damage (d1) | Behavior |
| --- | --- | --- | --- | --- | --- |
| Scout | 20 | 24 | 45 | 36 | Weaves down in formation and fires **homing** shots |
| Asteroid (obstacle) | 45 (scales with size) | none | none | 54 | Drifts and tumbles. Hurts on contact |
| Fighter | 40 | 30 | 50 | 45 | Hovers, tracks your position and fires **homing** shots |
| Kamikaze | 14 | none | none | 75 | Locks onto you and rams; if it misses, it comes back for another dive |
| Gunship | 180 | 30 ×5 spread | 38 | 75 | Slow and tough. Strafes and fires a 5-shot spread |
| Sniper | 70 | 39 ×3 burst | 85 | 45 | Hangs back, repositions and fires fast 3-shot bursts |

**Homing shots:** scouts and fighters, the single-shot enemies, fire tracking missiles. They steer toward you at 3.5 radians per second, leave a trail, and burn out after 4 seconds. Simply running sideways won't shake them (about 99% hit), and dodging hard just before impact works roughly 3 times in 10. Two counters:

- **Shoot them down.** Any of your shots destroys a homing missile it touches (the shot is used up), and the Ion Beam burns through any in its path. Plain shots (bursts, spreads, boss patterns) can't be shot.
- **Make them turn a full circle.** Once a missile has turned 360° in total, it loses its lock, dims, stops trailing and flies straight. Circling tightly makes it chase its own tail.

Each wave has a spawn budget of 6 + 1.9×d + 2.5×(wave number, starting at 0), and **every wave has at least 6 hostile ships**. If the budget would buy fewer, extra groups are added; asteroids don't count toward the 6. Waves are a mix of all the enemy types at every difficulty: types are dealt from a shuffled deck across the flight, so you meet every type before any repeats. Enemies arrive in groups: lines, columns, V formations or scattered.

**Boss (capital ship):** 1,100 HP and 33 shot damage at d1, shot speeds 34–60 (scaled like other enemies), 100 cr bounty at d1. It cycles through attack patterns:

- **Fan:** a spread of shots across the screen.
- **Aimed:** rapid shots at the player.
- **Spiral:** rotating arms of bullets.
- **Summon:** calls in escorts from difficulty 3 (scouts, or kamikazes from difficulty 5).

Below 50% HP it gets faster and its spreads get wider.

# Route Difficulty & Economy

**Route Difficulty** Each route has a difficulty from 1 to 10, equal to the higher tier of its two stations. Level 1 can be done with the starting ship, though not safely. Any route can be attempted; the danger rating shows how far it outclasses your ship.

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

- **30 star systems** generated from a random seed: 10 tiers of 3 systems laid out left to right.
- The last tier has 3 systems plus the **Terminus**, the final destination at the far right, where the game is won. That makes 31 stations in total.
- Each station links to 1–3 others. Links only join the same or neighboring tiers, so difficulty rises gradually.
- The map is always fully connected. The shortest path from start to Terminus is 13–22 jumps, usually about 18.
- You start at the leftmost tier-1 system.

## Victory

Delivering to the Terminus shows a victory screen with your stats: deliveries, credits earned, kills, bosses destroyed, ships lost and systems visited. From there you can **Keep flying** on the same save or go to the main menu.

# Open Questions / Ideas for Review

- Is ~18 jumps and ~2–3 deliveries per rating the right length?
- Docking happens twice per delivery (roughly 50+ times per game). Should there be a paid **autopilot** option to skip it once you've mastered it?
- Is 4% hull per bump too punishing, or not punishing enough? Should the precision bonus be bigger?
- Is the loss on destruction (cargo + bounties + tow fee) too harsh or too soft?
- Should the map hide unvisited systems (fog of war) instead of showing everything?
- Possible additions:
  - random events between waves (pirates demanding cargo, derelicts to salvage)
  - buying cargo instead of loading it for free
  - weapon-specific upgrades
  - music
  - gamepad and touch controls
