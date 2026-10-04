# TXL TRADER

A 2D video game where the player controls a spaceship seen from a top-down view. The goal is to move goods from station to station, fighting the KL9 robot army and obstacles on each trip. Reaching the **Terminus** at the far edge of the map wins the game.

## Story

You are the chosen one of your people, from the planet **Mulerebs**, long oppressed by the **KL9** robot army. You have been given a ship with only minimal weapons. You must reach the **Terminus**, the heart of the robot army, and deliver the shutdown virus code to its core.

The KL9 can only attack you at warp. Trade between stations and gather technologies until you are strong enough to battle them.

Reach the **Terminus** and free your people!

How the story shows up in play: [Story in the Game](design/story.md).

The design is split into pages under [`design/`](design/):

## Foundations

- [Tech Stack](design/foundations/tech-stack.md): JavaScript, Vite, Three.js, saving
- [Visual Style](design/foundations/visual-style.md): low-poly, gritty look and interface
- [Test Console](design/foundations/test-console.md): cheats and tuning for testing

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
- [Leaderboard](design/online/leaderboard.md): Lane Records, score, run clock

## Review

- [Open Questions / Ideas](design/open-questions.md)
