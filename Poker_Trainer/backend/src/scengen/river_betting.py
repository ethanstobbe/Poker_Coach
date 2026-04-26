import pandas as pd
import random

INPUT_CSV  = "poker_training_dataset_with_river_strength.csv"
OUTPUT_CSV = "poker_training_dataset_full_postflop.csv"

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

POSTFLOP_ORDER = ["SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO", "BTN"]

AGGRESSION = {
    "NIT": 0.25,
    "PASSIVE": 0.20,
    "TAG": 0.50,
    "LAG": 0.75,
}

# River sizing labels
BET_SIZES_BY_STRENGTH = {
    2: ["33", "50"],        # pair
    3: ["50", "75", "100"], # two pair / trips
    4: ["75", "100"],       # straight+ / flush+ (no all-in since no pot math)
}

MAX_RAISES_PER_STREET = 2


# -------------------------
# Action parsing
# -------------------------

def players_folded_in_action(action_str: str):
    if not isinstance(action_str, str) or "|" not in action_str:
        return set()

    _, seq = action_str.split("|", 1)
    seq = seq.strip()
    if not seq:
        return set()

    folded = set()
    for token in seq.split(","):
        token = token.strip()
        if ":F" in token:
            folded.add(token.split(":")[0])
    return folded


def active_after_turn(row):
    preflop_active = [p for p in PLAYER_COLS if row.get(p, "F") != "F"]
    flop_folded = players_folded_in_action(row.get("Flop_Action", ""))
    turn_folded = players_folded_in_action(row.get("Turn_Action", ""))
    return [p for p in preflop_active if p not in flop_folded and p not in turn_folded]


def betting_order_from_players(players):
    ordered = []
    for pos in POSTFLOP_ORDER:
        for p in players:
            if POSITIONS[p] == pos:
                ordered.append(p)
    return ordered


# -------------------------
# Decision logic
# -------------------------

def choose_bet_size(style, strength):
    # Passive strong hands bet smaller
    if style == "PASSIVE" and strength in (3, 4):
        return random.choice(["33", "50"])
    return random.choice(BET_SIZES_BY_STRENGTH.get(strength, ["50"]))


def choose_action(style, strength, facing_bet, raises_used):
    """
    River:
    - no draws bucket here (your river strength doesn't include draws)
    - strength:
        0 air
        2 pair
        3 strong (2p/trips)
        4 monster (straight+)
    """
    agg = AGGRESSION.get(style, 0.5)

    if not facing_bet:
        if strength >= 4:
            return "B"
        if strength == 3:
            if style == "PASSIVE":
                return "B" if random.random() < 0.30 else "X"
            return "B" if random.random() < agg else "X"
        if strength == 2:
            # thin value bets sometimes (more for LAG/TAG)
            if style in ("TAG", "LAG") and random.random() < 0.25:
                return "B"
            return "X"
        # air: small stab/bluff sometimes for LAG
        if style == "LAG" and random.random() < 0.10:
            return "B"
        return "X"

    # Facing bet
    if strength >= 4:
        if raises_used < MAX_RAISES_PER_STREET:
            if style == "PASSIVE":
                return "R" if random.random() < 0.20 else "C"
            return "R" if random.random() < agg else "C"
        return "C"

    if strength == 3:
        if style == "PASSIVE":
            return "C"
        if raises_used < MAX_RAISES_PER_STREET and random.random() < agg * 0.50:
            return "R"
        return "C"

    if strength == 2:
        # bluff-catch frequency depends on style
        if style == "NIT":
            return "F" if random.random() < 0.70 else "C"
        if style == "PASSIVE":
            return "F" if random.random() < 0.55 else "C"
        return "C" if random.random() < 0.55 else "F"

    # air facing bet: mostly fold, LAG hero-calls rarely
    if style == "LAG" and random.random() < 0.05:
        return "C"
    return "F"


# -------------------------
# Correct circular betting engine (River)
# -------------------------

def run_river_betting(row):
    players_in_hand = active_after_turn(row)
    players = betting_order_from_players(players_in_hand)

    if len(players) <= 1:
        return "R|HAND_OVER"

    folded = set()
    bet_exists = False
    raises_used = 0

    to_respond = set(players)
    actions = []

    idx = 0
    max_steps = 250
    steps = 0

    while to_respond and steps < max_steps:
        steps += 1

        p = players[idx]
        idx = (idx + 1) % len(players)

        if p in folded:
            continue
        if p not in to_respond:
            continue

        strength = row.get(f"River_Strength_{p}", -1)
        style = row.get(f"Style_{p}", "TAG")

        if strength < 0:
            strength = 0

        action = choose_action(style, strength, bet_exists, raises_used)

        if not bet_exists:
            if action == "X":
                actions.append(f"{p}:X")
                to_respond.remove(p)
                continue

            if action != "B":
                actions.append(f"{p}:X")
                to_respond.remove(p)
                continue

            size = choose_bet_size(style, strength)
            actions.append(f"{p}:B({size})")
            bet_exists = True
            to_respond = set(q for q in players if q not in folded and q != p)
            continue

        # Facing bet
        if action == "F":
            actions.append(f"{p}:F")
            folded.add(p)
            to_respond.remove(p)

            remaining = [q for q in players if q not in folded]
            if len(remaining) <= 1:
                to_respond.clear()
            continue

        if action == "C":
            actions.append(f"{p}:C")
            to_respond.remove(p)
            continue

        if action == "R" and raises_used < MAX_RAISES_PER_STREET:
            size = choose_bet_size(style, strength)
            actions.append(f"{p}:R({size})")
            raises_used += 1
            to_respond = set(q for q in players if q not in folded and q != p)
            continue

        # default if raise not allowed
        actions.append(f"{p}:C")
        to_respond.remove(p)

    return "R|" + ",".join(actions)


# -------------------------
# Main
# -------------------------

def main():
    print("Loading dataset...")
    df = pd.read_csv(INPUT_CSV)

    if "River_Action" not in df.columns:
        df["River_Action"] = ""

    print("Simulating RIVER betting...")
    for idx, row in df.iterrows():
        existing = str(row.get("River_Action", "")).strip()

        # Skip rows already marked as over
        if existing in ("R|HAND_OVER",):
            continue

        df.at[idx, "River_Action"] = run_river_betting(row)

    print("Saving output...")
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"Done! Wrote: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()