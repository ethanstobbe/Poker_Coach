import pandas as pd
from collections import Counter

INPUT_CSV  = "poker_training_dataset_with_turn_bets.csv"
OUTPUT_CSV = "poker_training_dataset_with_river_strength.csv"

PLAYER_COLS = [f"P{i}" for i in range(1, 9)]
RANK_ORDER = "23456789TJQKA"


# -------------------------
# Helpers
# -------------------------

def parse_cards(card_str: str):
    return str(card_str).split()

def rank(card: str) -> str:
    return card[0]

def suit(card: str) -> str:
    return card[1]

def rank_idx(r: str) -> int:
    return RANK_ORDER.index(r)


def players_folded_in_action(action_str: str):
    """
    Parses: F|P3:X,P4:B(33),P5:F
    Returns set({"P5"})
    Works for F|..., T|..., R|...
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


def active_after_turn(row):
    """
    Players still in after turn:
    - start from preflop-active (Pi != 'F')
    - remove folds in Flop_Action
    - remove folds in Turn_Action
    """
    preflop_active = [p for p in PLAYER_COLS if row.get(p, "F") != "F"]
    flop_folded = players_folded_in_action(row.get("Flop_Action", ""))
    turn_folded = players_folded_in_action(row.get("Turn_Action", ""))
    return [p for p in preflop_active if p not in flop_folded and p not in turn_folded]


# -------------------------
# Made hand detection (7 cards)
# -------------------------

def made_hand_category(cards):
    """
    Coarse made-hand category using all 7 cards (hole + flop + turn + river):
      0 = high card
      1 = one pair
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
    suniq = set(uniq)

    # wheel A2345
    wheel = {12, 0, 1, 2, 3}
    if wheel.issubset(suniq):
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


def evaluate_river_strength(hole, flop, turn, river):
    """
    River buckets (no draws):
      0 = air / high card
      2 = pair (medium)
      3 = two pair / trips (strong)
      4 = straight+ / flush+ / boats+ (monster)
    """
    cards = hole + flop + [turn, river]
    cat = made_hand_category(cards)

    if cat >= 4:
        return 4
    if cat in (2, 3):
        return 3
    if cat == 1:
        return 2
    return 0


# -------------------------
# Main
# -------------------------

def main():
    print("Loading dataset...")
    df = pd.read_csv(INPUT_CSV)

    # Ensure River_Action exists
    if "River_Action" not in df.columns:
        df["River_Action"] = ""

    # Create strength columns
    for p in PLAYER_COLS:
        df[f"River_Strength_{p}"] = -1

    print("Evaluating river strength (river always present)...")
    for idx, row in df.iterrows():
        turn_action = str(row.get("Turn_Action", "")).strip()

        # If hand ended on turn, mark river and skip evaluation
        if turn_action == "T|HAND_OVER":
            df.at[idx, "River_Action"] = "R|HAND_OVER"
            continue

        still_in = active_after_turn(row)
        if len(still_in) <= 1:
            df.at[idx, "River_Action"] = "R|HAND_OVER"
            continue

        flop = parse_cards(row["Flop"])
        turn = str(row["Turn"]).strip()
        river = str(row["River"]).strip()

        for p in still_in:
            hole = parse_cards(row[p])
            df.at[idx, f"River_Strength_{p}"] = evaluate_river_strength(hole, flop, turn, river)

        # Leave River_Action blank; river betting script fills it
        df.at[idx, "River_Action"] = ""

    print("Saving output...")
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"Done! Wrote: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()