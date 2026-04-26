import pandas as pd
import random

# =========================
# CONFIG
# =========================
INPUT_CSV  = "poker_training_dataset_with_flop_strength.csv"
OUTPUT_CSV = "poker_training_dataset_with_flop_bets.csv"

PLAYER_COLS = [f"P{i}" for i in range(1, 9)]

POSITIONS = {
    "P1": "BTN",
    "P2": "SB",
    "P3": "BB",
    "P4": "UTG",
    "P5": "UTG+1",
    "P6": "MP",
    "P7": "HJ",
    "P8": "CO",
}

# Postflop order (first to act -> last to act)
POSTFLOP_ORDER = ["SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO", "BTN"]

AGGRESSION = {
    "NIT": 0.25,
    "PASSIVE": 0.20,
    "TAG": 0.50,
    "LAG": 0.75,
}

# Size labels only (backend can translate to pot math later)
BET_SIZES_BY_STRENGTH = {
    2: ["33", "50"],        # single draw
    3: ["33", "50", "75"],  # strong (often not huge)
    4: ["75", "100"],       # monster
}

MAX_RAISES_PER_STREET = 2  # total raises (not per player)


# =========================
# HELPERS
# =========================

def active_players(row):
    """Players who are still in hand preflop (not 'F')."""
    return [p for p in PLAYER_COLS if row.get(p, "F") != "F"]

def betting_order(row):
    """Returns active players ordered SB->...->BTN."""
    active = active_players(row)
    ordered = []
    for pos in POSTFLOP_ORDER:
        for p in active:
            if POSITIONS[p] == pos:
                ordered.append(p)
    return ordered

def choose_bet_size(style, strength):
    # Passive strong bets smaller by preference
    if style == "PASSIVE" and strength in (3, 4):
        return random.choice(["33", "50"])
    return random.choice(BET_SIZES_BY_STRENGTH.get(strength, ["50"]))

def choose_action(style, strength, facing_bet, raises_used):
    """
    Returns one of: X, F, C, B, R
    NOTE: This function MUST NOT return X when facing_bet is True.
    """
    agg = AGGRESSION.get(style, 0.5)

    if not facing_bet:
        # No bet yet: check or bet
        if strength >= 4:
            return "B"

        if strength == 3:
            if style == "PASSIVE":
                return "B" if random.random() < 0.35 else "X"
            return "B" if random.random() < agg else "X"

        if strength == 2:
            # LAG semi-bluffs more often
            return "B" if style == "LAG" and random.random() < 0.35 else "X"

        # Weak/air: mostly check; LAG occasional stab with air is optional
        if strength == 0 and style == "LAG" and random.random() < 0.10:
            return "B"
        return "X"

    # Facing a bet: fold/call/raise
    if strength >= 4:
        # Passive can raise monsters sometimes but less often
        if raises_used < MAX_RAISES_PER_STREET:
            if style == "PASSIVE":
                return "R" if random.random() < 0.25 else "C"
            return "R" if random.random() < agg else "C"
        return "C"

    if strength == 3:
        # Passive: call strong hands; others may raise sometimes
        if style == "PASSIVE":
            return "C"
        if raises_used < MAX_RAISES_PER_STREET and random.random() < agg * 0.6:
            return "R"
        return "C"

    if strength == 2:
        return "C" if random.random() < 0.6 else "F"

    return "F"


# =========================
# CORRECT CIRCULAR BETTING ENGINE
# =========================

def run_flop(row):
    """
    Legal betting loop:
    - Iterate in order with a circular pointer.
    - If no bet exists: players can check/bet; round ends when all active players have checked (or folded somehow).
    - If a bet/raise exists: every non-folded player (except aggressor) must respond (C/F/R).
    - If a new raise occurs: response requirement resets to all remaining players except new aggressor.
    """
    players = betting_order(row)
    if not players:
        return "F|"

    # Track who folded during this street
    folded = set()

    # Betting state
    bet_exists = False
    raises_used = 0

    # Who still must act to close the round:
    # - If no bet: everyone must act once (check/bet).
    # - If bet: everyone except aggressor must respond.
    to_respond = set(players)

    actions = []

    # Start at first actor (players[0] = SB if active else next)
    idx = 0

    # Safety cap to prevent infinite loops if a bug slips in
    max_steps = 200
    steps = 0

    while to_respond and steps < max_steps:
        steps += 1

        p = players[idx]
        idx = (idx + 1) % len(players)

        # Skip folded players
        if p in folded:
            continue

        # If this player doesn't owe an action right now, skip them
        if p not in to_respond:
            continue

        strength = row.get(f"Flop_Strength_{p}", -1)
        style = row.get(f"Style_{p}", "TAG")

        # If for some reason strength missing but player is active, treat as weak
        if strength < 0:
            strength = 1

        action = choose_action(style, strength, bet_exists, raises_used)

        if not bet_exists:
            # Allowed: X or B
            if action == "X":
                actions.append(f"{p}:X")
                to_respond.remove(p)
                continue

            # Force a bet if action isn't X
            if action != "B":
                action = "X"
                actions.append(f"{p}:X")
                to_respond.remove(p)
                continue

            size = choose_bet_size(style, strength)
            actions.append(f"{p}:B({size})")
            bet_exists = True
            # After a bet: everyone else must respond
            to_respond = set(q for q in players if q not in folded and q != p)
            continue

        else:
            # Facing a bet: allowed F/C/R (no X)
            if action == "F":
                actions.append(f"{p}:F")
                folded.add(p)
                to_respond.remove(p)

                # If only one player remains, street ends immediately
                remaining = [q for q in players if q not in folded]
                if len(remaining) <= 1:
                    to_respond.clear()
                continue

            if action == "C":
                actions.append(f"{p}:C")
                to_respond.remove(p)
                continue

            # Raise
            if action == "R" and raises_used < MAX_RAISES_PER_STREET:
                size = choose_bet_size(style, strength)
                actions.append(f"{p}:R({size})")
                raises_used += 1
                # After a raise: everyone else must respond again
                to_respond = set(q for q in players if q not in folded and q != p)
                continue

            # If raise not allowed, default to call
            actions.append(f"{p}:C")
            to_respond.remove(p)

    # If we hit the safety cap, still output what we have (shouldn't happen)
    return "F|" + ",".join(actions)


# =========================
# MAIN
# =========================

def main():
    print("Loading dataset...")
    df = pd.read_csv(INPUT_CSV)

    # Drop deprecated columns safely if they exist
    df.drop(columns=["ActionHistory", "HeroEquity", "Difficulty", "Winner"], errors="ignore", inplace=True)

    print("Simulating FLOP betting with correct circular order...")
    df["Flop_Action"] = df.apply(run_flop, axis=1)

    print("Saving output...")
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"Done! Wrote: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()