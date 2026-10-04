[← Design index](../../game.md)

# Weapons

Each weapon is bought once, and all of them are boosted by the Weapons Core. You switch between owned weapons in flight.

| Weapon | Cost | Behavior | Base DPS |
| --- | --- | --- | --- |
| Pulse Laser | Starting weapon | Fast single bolts straight ahead | 60 |
| Scatter Cannon | 450 | 5-pellet spread, short range; damage falls off with distance | 30 point-blank |
| Seeker Missiles | 1,600 | Twin homing missiles; limited ammo | 82 burst (about 23 sustained; 45 with Rapid Recharge 5; 82 at level 6) |
| Ion Beam | 4,500 | Continuous beam that hits the first enemy in line | 100 |

## Scatter Cannon

The longer a pellet travels, the lower its damage: full damage at the muzzle, falling linearly to 25% at maximum range (about 70 units, roughly three-quarters of the screen height). Pellets visibly shrink as they weaken. Up close a full volley does about 11.5 damage at Weapons Core 1; at the edge of its range, under 2.

## Seeker Missiles

Limited ammo: **3 shots** (each shot fires one missile from each pod), then the launcher **recharges for 5 seconds** and refills all 3. The weapon slot on the HUD shows the shots left (▮▮▯) or the recharge countdown, and the missile tips on the ship's pods disappear as they're used.

### Rapid Recharge upgrade

Once Seeker Missiles are installed, their card in Ship Systems offers **Rapid Recharge**, which shortens the recharge by 20% per level; the very expensive final level removes it entirely. It doesn't count toward Ship Rating.

| Level | Recharge | Upgrade cost |
| --- | --- | --- |
| 1 (with purchase) | 5.0 s | — |
| 2 | 4.0 s | 800 |
| 3 | 3.2 s | 1,280 |
| 4 | 2.6 s | 2,048 |
| 5 | 2.0 s | 3,277 |
| 6 (max): **No Recharge** | none: the pods refill as the third salvo fires, so Seekers fire non-stop (HUD shows ∞) | 50,000 |

Levels 2–5 cost ×1.6 per level like other upgrades; level 6 is priced far above the curve (it would otherwise be 5,243). At level 5, sustained damage rises from about 23 to about 45 DPS (3 salvos of 48 damage every ~3.2 s instead of every ~6.2 s); at level 6 it's the full 82 DPS, continuously. Tuning lives in `WEAPON_UPGRADES` in `src/data.js`; other weapons can get upgrades the same way.
