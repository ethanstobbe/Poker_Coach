import pandas as pd
from collections import Counter
import math

INPUT_CSV  = "poker_training_dataset_prefolded.csv"
OUTPUT_CSV = "poker_training_dataset_with_flop_strength.csv"

PLAYER_COLS = [f"P{i}" for i in range(1, 9)]
RANK_ORDER = "23456789TJQKA"


# -------------------------
# Basic helpers
# -------------------------

def is_missing(x) -> bool:
    if x is None:
        return True
    if isinstance(x, float) and math.isnan(x):
        return True
    s = str(x).strip()
    return s == "" or s.lower() in ("nan", "none")

def parse_cards(card_str: str):
    return str(card_str).split()

def rank(card: str) -> str:
    return card[0]

def suit(card: str) -> str:
    return card[1]

def rank_idx(r: str) -> int:
    return RANK_ORDER.index(r)

def valid_hole(cell) -> bool:
    # expects "Qs Tc" or "Ah Ad"
    return isinstance(cell, str) and cell != "F" and len(cell.split()) == 2


# -------------------------
# Hand feature detectors (hole + flop = 5 cards)
# -------------------------

def made_hand_category(cards):
    """
    Coarse made-hand category using 5 cards (hole + flop):
      0 = high card
      1 = one pair
      2 = two pair
      3 = trips
      4 = straight
      5 = flush
      6 = full house/quads (rare on flop w/ 5 cards but included)
    """
    rs = [rank(c) for c in cards]
    ss = [suit(c) for c in cards]

    rc = Counter(rs)
    sc = Counter(ss)
    counts = sorted(rc.values(), reverse=True)

    # Flush made (possible with 2 suited hole + 3 suited flop)
    is_flush = any(v >= 5 for v in sc.values())

    # Straight made (including wheel A2345)
    uniq = sorted(set(rank_idx(r) for r in rs))
    suniq = set(uniq)
    wheel = {12, 0, 1, 2, 3}
    if wheel.issubset(suniq):
        is_straight = True
    else:
        is_straight = any(uniq[i + 4] - uniq[i] == 4 for i in range(len(uniq) - 4))

    if counts[0] == 4:
        return 6
    if counts[0] == 3 and len(counts) > 1 and counts[1] >= 2:
        return 6
    if is_flush:
        return 5
    if is_straight:
        return 4
    if counts[0] == 3:
        return 3
    if counts[0] == 2 and len(counts) > 1 and counts[1] == 2:
        return 2
    if counts[0] == 2:
        return 1
    return 0

def has_flush_draw(cards):
    """Flush draw on flop: exactly 4 of a suit (and not already a flush)."""
    sc = Counter([suit(c) for c in cards])
    return any(v == 4 for v in sc.values())

def has_straight_draw(cards):
    """
    Simple flop straight-draw detector:
    - Excludes made straights
    - True if there exist 4 ranks within a span <= 4 (OESD-ish / gutshot-ish approx)
    - Includes wheel draw when you have 4 of A2345 ranks
    """
    rs = [rank(c) for c in cards]
    uniq = sorted(set(rank_idx(r) for r in rs))
    suniq = set(uniq)

    # exclude made straight
    wheel = {12, 0, 1, 2, 3}
    if wheel.issubset(suniq):
        return False
    if any(uniq[i + 4] - uniq[i] == 4 for i in range(len(uniq) - 4)):
        return False

    # wheel draw (4 of 5)
    if len(wheel.intersection(suniq)) == 4:
        return True

    # any 4 ranks packed in <= 4 span
    for i in range(len(uniq) - 3):
        window = uniq[i:i + 4]
        if window[-1] - window[0] <= 4:
            return True

    return False


# -------------------------
# Flop bucket evaluation
# -------------------------

def evaluate_flop_strength(hole_cards, flop_cards):
    cards = hole_cards + flop_cards
    made = made_hand_category(cards)

    # Monster: two pair+ OR trips+ OR made straight/flush+
    if made >= 2:
        return 4

    # Draws
    fd = has_flush_draw(cards)
    sd = has_straight_draw(cards)

    if fd and sd:
        return 3  # multi-draw
    if fd or sd:
        return 2  # single draw

    # Pair logic
    if made == 1:
        board_ranks = [rank(c) for c in flop_cards]
        all_ranks = [rank(c) for c in cards]
        rc = Counter(all_ranks)
        pair_rank = next(r for r, c in rc.items() if c == 2)

        top_board = max(board_ranks, key=rank_idx)

        # top pair or overpair-ish
        if rank_idx(pair_rank) >= rank_idx(top_board):
            return 3
        return 1

    # High card: overcards -> weak, else air
    board_ranks = [rank(c) for c in flop_cards]
    hole_ranks = [rank(c) for c in hole_cards]
    top_board = max(board_ranks, key=rank_idx)
    top_hole = max(hole_ranks, key=rank_idx)

    return 1 if rank_idx(top_hole) > rank_idx(top_board) else 0


# -------------------------
# Main
# -------------------------

def main():
    print("Loading dataset...")
    df = pd.read_csv(INPUT_CSV)

    print("Computing Flop_Strength_P1..P8...")
    for p in PLAYER_COLS:
        df[f"Flop_Strength_{p}"] = -1

    for idx, row in df.iterrows():
        if is_missing(row.get("Flop")):
            # Can't evaluate if flop missing
            continue

        flop = parse_cards(row["Flop"])
        if len(flop) != 3:
            # Invalid flop format
            continue

        for p in PLAYER_COLS:
            cell = row.get(p, "F")

            if not valid_hole(cell):
                df.at[idx, f"Flop_Strength_{p}"] = -1
                continue

            hole = parse_cards(cell)
            df.at[idx, f"Flop_Strength_{p}"] = evaluate_flop_strength(hole, flop)

    print("Saving output...")
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"Done! Wrote: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()