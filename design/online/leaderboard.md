[← Design index](../../game.md)

# Leaderboard

Lane Records lists **In flight** runs while the captain is still playing, and **Arrived** after they submit a Terminus delivery. Score ranking includes open runs. Time ranking is finished runs only. An in-flight row drops off if it is not updated for 15 minutes.

## Score

Score = credits earned + kills × 50 + capital ships destroyed × 2,500 − ships lost × 10,000.

The weights are `SCORE` in `src/data.js`. Credits dominate: the Terminus delivery alone pays roughly 5,000–7,000 credits per cargo unit (about 40,000–55,000 with the starting 8-unit hold, 200,000+ with a full 44-unit hold), so cargo upgrades matter most and kills, bosses and losses mostly separate runs with similar earnings.

## Run clock

Each save has a run clock. It only counts while you are playing: not on the main menu or victory screen, not while paused, and not while the window is unfocused or hidden.

## Posting

- **Live rows:** your run is posted as **In flight** each time you return to a station and about once a minute while playing, using your menu callsign. The server ignores live updates that come less than 30 seconds apart.
- **Arrival:** from the [victory screen](../world/victory.md). Runs under 3 minutes, saves without a run clock, and test runs can't be posted. An arrived run can't be turned back into a live one.
- The server allows at most 10 new runs or arrivals per IP address per hour.
- Under `npm run dev`, a local stand-in serves the board, so it works without the PHP API.
