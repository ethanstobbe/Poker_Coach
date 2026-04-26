import pandas as pd

INPUT_CSV = "poker_training_dataset_full_postflop.csv"
OUTPUT_CSV = "hand_scenarios_supabase_ready.csv"

COLUMN_MAPPING = {
    "HandID": "hand_scenario_id",
    "P1": "hero_hand",
    "P2": "p2",
    "P3": "p3",
    "P4": "p4",
    "P5": "p5",
    "P6": "p6",
    "P7": "p7",
    "P8": "p8",
    "Style_P1": "style_p1",
    "Style_P2": "style_p2",
    "Style_P3": "style_p3",
    "Style_P4": "style_p4",
    "Style_P5": "style_p5",
    "Style_P6": "style_p6",
    "Style_P7": "style_p7",
    "Style_P8": "style_p8",
    "Flop": "flop",
    "Turn": "turn",
    "River": "river",
    "Flop_Action": "flop_action",
    "Turn_Action": "turn_action",
    "River_Action": "river_action",
}

FINAL_COLUMN_ORDER = [
    "hand_scenario_id",
    "hero_hand",
    "p2",
    "p3",
    "p4",
    "p5",
    "p6",
    "p7",
    "p8",
    "style_p1",
    "style_p2",
    "style_p3",
    "style_p4",
    "style_p5",
    "style_p6",
    "style_p7",
    "style_p8",
    "flop",
    "turn",
    "river",
    "flop_action",
    "turn_action",
    "river_action",
]


def main():
    print("Loading final dataset...")
    df = pd.read_csv(INPUT_CSV)

    missing = [col for col in COLUMN_MAPPING if col not in df.columns]
    if missing:
        raise ValueError(f"Missing required input columns: {missing}")

    print("Filtering and renaming columns...")
    df = df[list(COLUMN_MAPPING.keys())].rename(columns=COLUMN_MAPPING)

    print("Reordering columns...")
    df = df[FINAL_COLUMN_ORDER]

    if df.empty:
        raise ValueError("No scenarios available after processing")

    print("Selecting one random scenario row...")
    df = df.sample(n=1).reset_index(drop=True)

    print("Saving Supabase-ready CSV...")
    df.to_csv(OUTPUT_CSV, index=False)

    print(f"Done! Output written to '{OUTPUT_CSV}'")


if __name__ == "__main__":
    main()