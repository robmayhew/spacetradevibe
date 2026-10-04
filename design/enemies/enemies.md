[← Design index](../../game.md)

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
| Scout | 20 | 24 | 45 | 36 | Weaves down in formation and fires [homing](homing-shots.md) shots |
| Asteroid (obstacle) | 45 (scales with size) | none | none | 54 | Drifts and tumbles. Hurts on contact |
| Fighter | 40 | 30 | 50 | 45 | Hovers, tracks your position and fires [homing](homing-shots.md) shots |
| Kamikaze | 14 | none | none | 75 | Locks onto you and rams; if it misses, it comes back for another dive |
| Gunship | 180 | 30 ×5 spread | 38 | 75 | Slow and tough. Strafes and fires a 5-shot spread |
| Sniper | 70 | 39 ×3 burst | 85 | 45 | Hangs back, repositions and fires fast 3-shot bursts |

Each wave has a spawn budget of 6 + 1.9×d + 2.5×(wave number, starting at 0), and **every wave has at least 6 hostile ships**. If the budget would buy fewer, extra groups are added; asteroids don't count toward the 6. Waves are a mix of all the enemy types at every difficulty: types are dealt from a shuffled deck across the flight, so you meet every type before any repeats. Enemies arrive in groups: lines, columns, V formations or scattered.

A route may end with a capital ship: see [Boss](boss.md).
