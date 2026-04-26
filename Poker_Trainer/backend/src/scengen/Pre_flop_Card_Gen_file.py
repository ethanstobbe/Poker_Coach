import random
import csv
import os
from treys import Card, Deck

# ======================================================
# CONFIG
# ======================================================

NUM_PLAYERS = 8
STARTING_STACK = 100
OPEN_SIZE = 2.5
CALL_SIZE = 2.5

POSITIONS = [
    "UTG", "UTG+1", "MP", "HJ",
    "CO", "BTN", "SB", "BB"
]

POSITION_THRESHOLD = {
    "UTG": 12, "UTG+1": 11, "MP": 10, "HJ": 9,
    "CO": 8, "BTN": 7, "SB": 7, "BB": 0
}

# ======================================================
# PREFLOP STRENGTH
# ======================================================

def preflop_strength(card1, card2):
    r1 = Card.get_rank_int(card1)
    r2 = Card.get_rank_int(card2)

    high = max(r1, r2)

    if r1 == r2:
        return 20 + high

    suited_bonus = 2 if Card.get_suit_int(card1) == Card.get_suit_int(card2) else 0
    return high + suited_bonus


def assign_player_styles(rng):
    styles = {}
    possible = ["TAG", "LAG", "PASSIVE", "NIT"]
    for i in range(NUM_PLAYERS):
        styles[f"P{i+1}"] = rng.choice(possible)
    return styles

# ======================================================
# PREFLOP SIMULATION
# ======================================================

def simulate_preflop(hole_cards):
    stacks = {f"P{i+1}": STARTING_STACK for i in range(NUM_PLAYERS)}
    actions = {}
    raise_occurred = False

    for i in range(NUM_PLAYERS):
        player = f"P{i+1}"
        pos = POSITIONS[i]
        strength = preflop_strength(*hole_cards[player])
        threshold = POSITION_THRESHOLD[pos]

        if strength >= threshold:
            if not raise_occurred:
                actions[player] = "Raise"
                stacks[player] -= OPEN_SIZE
                raise_occurred = True
            else:
                actions[player] = "Call"
                stacks[player] -= CALL_SIZE
        else:
            actions[player] = "Fold"

    active_players = {
        p: hole_cards[p]
        for p in hole_cards
        if actions[p] != "Fold"
    }

    return active_players, actions, stacks

# ======================================================
# SIMPLE BETTING ROUND PLACEHOLDER
# ======================================================

def simulate_betting_round(
    street,
    active_players,
    stacks,
    board,
    rng,
    bet_fraction,
    allow_raises=True
):
    """
    Lightweight placeholder betting round used only for deciding
    whether players remain in the hand as the board develops.

    This does NOT save action history or pot data, since later scripts
    generate the real betting lines.
    """

    players_order = list(active_players.keys())

    for player in players_order:
        if player not in active_players:
            continue

        style = PLAYER_STYLES_MAP[player]

        if style == "LAG":
            fold_chance = 0.15
        elif style == "TAG":
            fold_chance = 0.25
        elif style == "PASSIVE":
            fold_chance = 0.30
        else:  # NIT
            fold_chance = 0.40

        if rng.random() < fold_chance and len(active_players) > 1:
            del active_players[player]

    return active_players, stacks

# ======================================================
# SCENARIO GENERATOR
# ======================================================

def generate_scenario(hand_id):
    rng = random.Random(1000 + hand_id)

    for _ in range(300):
        deck = Deck()
        rng.shuffle(deck.cards)

        hole_cards = {f"P{i+1}": deck.draw(2) for i in range(NUM_PLAYERS)}

        global PLAYER_STYLES_MAP
        PLAYER_STYLES_MAP = assign_player_styles(rng)

        active_players, actions, stacks = simulate_preflop(hole_cards)

        if len(active_players) < 2:
            continue

        # ALWAYS generate a full board
        flop = deck.draw(3)
        turn_card = deck.draw(1)[0]
        river_card = deck.draw(1)[0]

        turn_board = flop + [turn_card]
        river_board = turn_board + [river_card]

        # Placeholder street progression still allowed for pruning/flow,
        # but it no longer controls whether cards are generated.
        active_players_after_flop = dict(active_players)
        active_players_after_flop, stacks = simulate_betting_round(
            "F", active_players_after_flop, stacks, flop, rng, bet_fraction=0.5
        )

        active_players_after_turn = dict(active_players_after_flop)
        active_players_after_turn, stacks = simulate_betting_round(
            "T", active_players_after_turn, stacks, turn_board, rng, bet_fraction=0.66
        )

        active_players_after_river = dict(active_players_after_turn)
        active_players_after_river, stacks = simulate_betting_round(
            "R", active_players_after_river, stacks, river_board, rng, bet_fraction=0.75
        )

        def card_to_str(c):
            return Card.int_to_str(c)

        return {
            "HandID": hand_id,
            **{
                f"P{i+1}": " ".join(card_to_str(c) for c in hole_cards[f"P{i+1}"])
                for i in range(NUM_PLAYERS)
            },
            **{
                f"Style_P{i+1}": PLAYER_STYLES_MAP[f"P{i+1}"]
                for i in range(NUM_PLAYERS)
            },
            "Flop": " ".join(card_to_str(c) for c in flop),
            "Turn": card_to_str(turn_card),
            "River": card_to_str(river_card)
        }

    return {"HandID": hand_id, "Error": "Fallback scenario triggered"}

# ======================================================
# CSV WRITER
# ======================================================

def generate_csv(filename, num_hands):
    fieldnames = (
        ["HandID"] +
        [f"P{i+1}" for i in range(NUM_PLAYERS)] +
        [f"Style_P{i+1}" for i in range(NUM_PLAYERS)] +
        ["Flop", "Turn", "River"]
    )

    with open(filename, mode="w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()

        for hand_id in range(1, num_hands + 1):
            scenario = generate_scenario(hand_id)

            filtered_scenario = {
                key: scenario.get(key, "")
                for key in fieldnames
            }

            writer.writerow(filtered_scenario)

            if hand_id % 1000 == 0:
                print(f"Generated {hand_id} hands...")

    print(f"\nCSV generated at: {filename}")

# ======================================================
# MAIN
# ======================================================

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, "poker_training_dataset.csv")

    generate_csv(output_path, num_hands=20)