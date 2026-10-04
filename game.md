# TXL TRADER

A 2D video game where the player controls a spaceship seen from a top-down view. The goal is to move goods from station to station, fighting enemies and obstacles on each trip. Reaching the **Terminus** at the far edge of the map wins the game.

The design is split into pages under [`design/`](design/):

## Foundations

- [Tech Stack](design/foundations/tech-stack.md): JavaScript, Vite, Three.js, saving
- [Visual Style](design/foundations/visual-style.md): low-poly, gritty look and interface

## Game Play

- [Main Menu](design/gameplay/main-menu.md)
- [Station Screen](design/gameplay/station-screen.md): contracts, ship systems, star map
- [Travel & Combat](design/gameplay/travel-and-combat.md): waves, HUD, controls, pause
- [Docking / Undocking](design/gameplay/docking.md): the docking mini-game and lively stations
- [End of a Trip](design/gameplay/end-of-trip.md): delivered, destroyed, retreated

## Ship & Upgrades

- [Ship Rating](design/ship/ship-rating.md): rating and route danger
- [Systems](design/ship/systems.md): upgrades, costs, repairs
- [Weapons](design/ship/weapons.md)

## Enemies

- [Enemies](design/enemies/enemies.md): scaling, enemy types, wave makeup
- [Homing Shots](design/enemies/homing-shots.md): tracking missiles and their counters
- [Boss](design/enemies/boss.md): the capital ship

## World

- [Route Difficulty & Economy](design/world/route-difficulty-and-economy.md): pay and goods
- [Map](design/world/map.md)
- [Victory](design/world/victory.md)

## Online

- [Escorts](design/online/escorts.md): phone and laptop helpers
- [Leaderboard](design/online/leaderboard.md)

## Review

- [Open Questions / Ideas](design/open-questions.md)
