import pandas as pd
import random
import math

# =========================
# Configuration
# =========================

INPUT_CSV = "poker_training_dataset.csv"
OUTPUT_CSV = "poker_training_dataset_prefolded.csv"

RANK_ORDER = "23456789TJQKA"

PLAYER_COLS = [f"P{i}" for i in range(1, 9)]
STYLE_COLS = [f"Style_P{i}" for i in range(1, 9)]

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

POSITION_FALLBACK = {
    "SB": "BTN",        # SB plays loose-ish
    "BB": "BTN",        # BB defends wide
    "UTG+1": "UTG",     # Slightly looser than UTG
    "HJ": "MP",         # Between MP and CO
}

# Base preflop ranges (tight baseline)
BASE_RANGES = {
    "UTG": {
        "pairs": ["AA", "KK", "QQ", "JJ", "TT", "99"],
        "suited": ["AKs", "AQs", "AJs", "KQs"],
        "offsuit": ["AKo"]
    },
    "MP": {
        "pairs": ["AA", "KK", "QQ", "JJ", "TT", "99", "88"],
        "suited": ["AKs", "AQs", "AJs", "ATs", "KQs", "QJs"],
        "offsuit": ["AKo", "AQo"]
    },
    "CO": {
        "pairs": ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77"],
        "suited": ["AKs", "AQs", "AJs", "ATs", "A9s", "KQs", "QJs", "JTs"],
        "offsuit": ["AKo", "AQo", "AJo"]
    },
    "BTN": {
        "pairs": ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55"],
        "suited": ["AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "KQs", "QJs", "JTs", "T9s"],
        "offsuit": ["AKo", "AQo", "AJo", "KQo"]
    }
}

# =========================
# Helper Functions
# =========================

def is_missing(x) -> bool:
    if x is None:
        return True
    if isinstance(x, float) and math.isnan(x):
        return True
    s = str(x).strip()
    return s == "" or s.lower() in ("nan", "none")

def normalize_style(style):
    """
    Ensures style is a usable string like 'NIT', 'TAG', 'LAG', 'PASSIVE'.
    Defaults to 'TAG' if missing.
    """
    if is_missing(style):
        return "TAG"
    return str(style).strip().upper()

def is_valid_hand(cell):
    """
    Returns True if the cell contains exactly two cards (e.g., 'Qs Tc')
    """
    return (
        isinstance(cell, str)
        and cell != "F"
        and len(cell.split()) == 2
    )

def parse_hand(card_str):
    """
    'Qs Tc' -> 'QTo'
    'Ah Kh' -> 'AKs'
    '7d 7c' -> '77'
    """
    c1, c2 = card_str.split()
    r1, s1 = c1[0], c1[1]
    r2, s2 = c2[0], c2[1]

    # Sort ranks high -> low
    if RANK_ORDER.index(r1) < RANK_ORDER.index(r2):
        r1, r2 = r2, r1
        s1, s2 = s2, s1

    if r1 == r2:
        return r1 + r2
    elif s1 == s2:
        return r1 + r2 + "s"
    else:
        return r1 + r2 + "o"

def is_pocket_pair(hand):
    return len(hand) == 2 and hand[0] == hand[1]

def is_suited(hand):
    return hand.endswith("s")

def high_card_rank(hand):
    return hand[0]

def count_active_players(row):
    return sum(1 for p in PLAYER_COLS if row[p] != "F")

def is_playable(hand, position, style):
    """
    Returns True if the player continues preflop
    """
    # Map position to closest baseline if needed
    if position not in BASE_RANGES:
        if position in POSITION_FALLBACK:
            position = POSITION_FALLBACK[position]
        else:
            return False

    base = BASE_RANGES[position]

    # Everyone plays pocket pairs
    if is_pocket_pair(hand):
        return True

    # Tight baseline
    if hand in base["pairs"] or hand in base["suited"] or hand in base["offsuit"]:
        return True

    # LOOSE / PASSIVE extensions
    if style in ("LAG", "PASSIVE"):
        # Any suited T+ (T2s+ where high card is T/J/Q/K/A)
        if is_suited(hand) and high_card_rank(hand) >= "T":
            return True

        # Any suited ace (A2s+)
        if is_suited(hand) and hand[0] == "A":
            return True

        # Suited connectors / gappers (down to ~65s)
        if is_suited(hand) and high_card_rank(hand) >= "6":
            return True

        # Random off-book looseness
        if random.random() < 0.15:
            return True

    return False

# =========================
# Main
# =========================

def main():
    print("Loading dataset...")
    df = pd.read_csv(INPUT_CSV)

    # Required columns check
    required = ["HandID"] + PLAYER_COLS + STYLE_COLS
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    print("Applying preflop fold logic...")

    for idx, row in df.iterrows():
        for i in range(1, 9):
            player_col = f"P{i}"
            style_col = f"Style_P{i}"
            position = POSITIONS[player_col]

            cell = row[player_col]

            # Invalid or empty hands are folded
            if not is_valid_hand(cell):
                df.at[idx, player_col] = "F"
                continue

            hand = parse_hand(cell)
            style = normalize_style(row[style_col])

            if not is_playable(hand, position, style):
                df.at[idx, player_col] = "F"

    print("Removing dead scenarios (0 or 1 player left)...")
    df["active_players"] = df.apply(count_active_players, axis=1)
    df = df[df["active_players"] >= 2].drop(columns=["active_players"])

    print("Saving updated dataset...")
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"Done! Output written to '{OUTPUT_CSV}'")

if __name__ == "__main__":
    main()