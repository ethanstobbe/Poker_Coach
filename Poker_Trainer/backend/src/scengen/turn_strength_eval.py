import pandas as pd
from collections import Counter
import math

INPUT_CSV = "poker_training_dataset_with_flop_bets.csv"
OUTPUT_CSV = "poker_training_dataset_with_turn_strength.csv"

PLAYER_COLS = [f"P{i}" for i in range(1, 9)]
RANK_ORDER = "23456789TJQKA"


# -------------------------
# Parsing helpers
# -------------------------

def parse_cards(card_str: str):
    return str(card_str).split()

def rank(card: str) -> str:
    return card[0]

def suit(card: str) -> str:
    return card[1]

def rank_idx(r: str) -> int:
    return RANK_ORDER.index(r)

def is_missing(x) -> bool:
    if x is None:
        return True
    if isinstance(x, float) and math.isnan(x):
        return True
    s = str(x).strip()
    return s == "" or s.lower() in ("nan", "none")


def players_folded_in_action(action_str: str):
    """
    Parses: F|P3:X,P4:B(33),P5:F
    Returns set({"P5"})
    """
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


def active_after_flop(row):
    """
    Returns list of players still in hand after flop action.
    - Start from preflop-active (Pi != 'F')
    - Remove anyone who folded during Flop_Action
    """
    preflop_active = [p for p in PLAYER_COLS if row.get(p, "F") != "F"]
    folded = players_folded_in_action(row.get("Flop_Action", ""))
    return [p for p in preflop_active if p not in folded]


# -------------------------
# Hand feature detectors
# -------------------------

def made_hand_bucket(cards):
    """
    Coarse made hand detection from 5 cards (hole + flop + turn):
      0 = high card
      1 = pair
      2 = two pair
      3 = trips
      4 = straight
      5 = flush
      6 = full house / quads
    """
    rs = [rank(c) for c in cards]
    ss = [suit(c) for c in cards]

    rc = Counter(rs)
    sc = Counter(ss)

    counts = sorted(rc.values(), reverse=True)

    is_flush = any(v >= 5 for v in sc.values())

    uniq = sorted(set(rank_idx(r) for r in rs))
    wheel = {12, 0, 1, 2, 3}
    if wheel.issubset(set(uniq)):
        is_straight = True
    else:
        is_straight = any(uniq[i + 4] - uniq[i] == 4 for i in range(len(uniq) - 4))

    if counts[0] == 4:
        return 6
    if counts[0] == 3 and counts[1] >= 2:
        return 6
    if is_flush:
        return 5
    if is_straight:
        return 4
    if counts[0] == 3:
        return 3
    if counts[0] == 2 and counts[1] == 2:
        return 2
    if counts[0] == 2:
        return 1
    return 0


def has_flush_draw(cards):
    """Turn flush draw: exactly 4 cards of same suit (not already flush)."""
    sc = Counter([suit(c) for c in cards])
    return any(v == 4 for v in sc.values())


def has_straight_draw(cards):
    """
    Simple straight draw detector (turn):
    - returns True if there exist 4 ranks within span <= 4
    - excludes made straights
    - includes wheel draw when you have 4 of A2345
    """
    rs = [rank(c) for c in cards]
    uniq = sorted(set(rank_idx(r) for r in rs))
    suniq = set(uniq)

    wheel = {12, 0, 1, 2, 3}
    # made wheel straight
    if wheel.issubset(suniq):
        return False

    # made straight
    if any(uniq[i + 4] - uniq[i] == 4 for i in range(len(uniq) - 4)):
        return False

    # wheel draw (4 of 5)
    if len(wheel.intersection(suniq)) == 4:
        return True

    for i in range(len(uniq) - 3):
        window = uniq[i:i + 4]
        if window[-1] - window[0] <= 4:
            return True

    return False


def evaluate_turn_strength(hole, flop, turn):
    """
    Buckets:
      0 = air
      1 = weak made / overcards
      2 = single draw
      3 = multi-draw OR strong pair/top-pair+
      4 = monster (two pair+, trips+, straight+, flush+, boats)
    """
    cards = hole + flop + [turn]
    made = made_hand_bucket(cards)

    # Monster: two pair or better OR made straight/flush+
    if made >= 2:
        return 4

    # Draws
    fd = has_flush_draw(cards)
    sd = has_straight_draw(cards)

    if fd and sd:
        return 3
    if fd or sd:
        return 2

    # Pair strength
    if made == 1:
        board_ranks = [rank(c) for c in flop + [turn]]
        all_ranks = [rank(c) for c in cards]
        rc = Counter(all_ranks)
        pair_rank = next(r for r, c in rc.items() if c == 2)

        top_board = max(board_ranks, key=rank_idx)
        if rank_idx(pair_rank) >= rank_idx(top_board):
            return 3
        return 1

    # High card: overcards -> 1 else air
    board_ranks = [rank(c) for c in flop + [turn]]
    hole_ranks = [rank(c) for c in hole]
    top_board = max(board_ranks, key=rank_idx)
    top_hole = max(hole_ranks, key=rank_idx)

    return 1 if rank_idx(top_hole) > rank_idx(top_board) else 0


# -------------------------
# Main
# -------------------------

def main():
    print("Loading dataset...")
    df = pd.read_csv(INPUT_CSV)

    print("Creating Turn_Strength_P1..P8...")
    for p in PLAYER_COLS:
        df[f"Turn_Strength_{p}"] = -1

    # Optional: create Turn_Action placeholder to mark ended hands now (useful later)
    if "Turn_Action" not in df.columns:
        df["Turn_Action"] = ""

    for idx, row in df.iterrows():
        still_in = active_after_flop(row)

        # If hand ended on flop, don't evaluate turn at all
        if len(still_in) <= 1:
            df.at[idx, "Turn_Action"] = "T|HAND_OVER"
            continue

        # If Turn card missing, also skip (mark)
        if is_missing(row.get("Turn")):
            df.at[idx, "Turn_Action"] = "T|NO_TURN_CARD"
            continue

        flop = parse_cards(row["Flop"])
        turn = str(row["Turn"]).strip()

        # Evaluate only players still in
        for p in still_in:
            hole = parse_cards(row[p])
            df.at[idx, f"Turn_Strength_{p}"] = evaluate_turn_strength(hole, flop, turn)

    print("Saving output...")
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"Done! Wrote: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()