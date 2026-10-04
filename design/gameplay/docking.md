[← Design index](../../game.md)

# Docking / Undocking at Stations

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
