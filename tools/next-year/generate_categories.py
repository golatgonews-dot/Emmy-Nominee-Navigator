#!/usr/bin/env python3
"""
generate_categories.py
-----------------------
Converts a reference spreadsheet (same columns as emmy_nom_2026_ref_list.xlsx)
into the CATEGORIES JSON array the app expects in public/index.html.

WHY THIS EXISTS
  The nominee list changes every year; the category structure (id, label,
  icon, group, type) barely does. This script keeps those concerns separate:
  category_schema.json holds the structure, this script only rebuilds the
  nominee lists from a fresh spreadsheet and slots them into that structure.

WHAT IT NEEDS
  1. category_schema.json — id -> {label, icon, group, type}. Already
     generated from the current app; reuse it across years. Only edit it
     when the Television Academy adds/removes/renames a category.
  2. A spreadsheet with these columns (same shape as this year's ref list):
     category, category_group, show_title, episode_title, nominees

WHAT IT DOES
  For each spreadsheet row:
    - id = slugified `category` text (e.g. "Outstanding Drama Series" ->
      "outstanding_drama_series"), looked up in the schema.
    - display string is built from `nominees` based on category_group:
        Series/Program  -> just the show title (no names)
        Performance     -> "Name — Show" (parses "Name as Character")
        Writing/Directing/Craft & Technical ->
            "Name & Name2 — Show" if <=2 credited names,
            "Name + N more — Show" if more (matches current app's pattern
            for large crew categories like Variety writing/VFX)
    - episode = episode_title if present, else null.

  Rows whose category text doesn't match any schema id are NOT silently
  dropped — they're collected into an "unmatched" report at the end so you
  can add a new schema entry (new/renamed category) or fix a typo.

USAGE
  pip install pandas openpyxl
  python generate_categories.py next_year_ref_list.xlsx category_schema.json categories_output.json

  Then open categories_output.json, copy its contents, and paste them in
  place of the CATEGORIES array in public/index.html (replace everything
  between "const CATEGORIES = " and the trailing ";").

RE-RUNNING
  Safe — always writes a fresh output file, never touches the schema or the
  input spreadsheet.
"""

import json
import re
import sys

import pandas as pd


def slugify(text):
    """'Outstanding Drama Series' -> 'outstanding_drama_series'"""
    s = str(text).strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return re.sub(r"_+", "_", s).strip("_")


def parse_names(nominees_field):
    """
    Split a raw `nominees` cell into a list of plain names, stripping
    parenthetical roles ("(Written by)") and "as Character" performance
    suffixes. Handles multiple names separated by "; ".
    """
    if not isinstance(nominees_field, str) or not nominees_field.strip():
        return []
    parts = [p.strip() for p in nominees_field.split(";") if p.strip()]
    names = []
    for p in parts:
        # Performance rows: "Sterling K. Brown as Xavier Collins" -> take name
        p = re.split(r"\s+as\s+", p, maxsplit=1)[0]
        # Writing/Directing/Craft rows: "Peter Ackerman (Written by)" -> name
        p = re.sub(r"\s*\([^)]*\)\s*$", "", p).strip()
        if p:
            names.append(p)
    return names


def build_display(group, names, show_title):
    """Match the app's existing display conventions per category_group."""
    show = str(show_title).strip()
    if group == "Series/Program" or not names:
        return show
    if group == "Performance":
        # Normally one name; join rare multi-host rows with "&"
        return f"{' & '.join(names)} — {show}"
    # Writing / Directing / Craft & Technical
    if len(names) <= 2:
        return f"{' & '.join(names)} — {show}"
    return f"{names[0]} + {len(names) - 1} more — {show}"


def main():
    if len(sys.argv) != 4:
        sys.exit(
            "Usage: python generate_categories.py <ref_list.xlsx> "
            "<category_schema.json> <output.json>"
        )
    xlsx_path, schema_path, out_path = sys.argv[1:4]

    with open(schema_path, encoding="utf-8") as f:
        schema = json.load(f)

    df = pd.read_excel(xlsx_path)
    required = {"category", "category_group", "show_title", "episode_title", "nominees"}
    missing = required - set(df.columns)
    if missing:
        sys.exit(f"ERROR: spreadsheet is missing columns: {missing}")

    # Preserve category order as first-seen in the spreadsheet.
    ordered_ids = []
    grouped = {}  # id -> list of nominee rows
    unmatched = {}  # raw category text -> row count

    for _, row in df.iterrows():
        cat_text = row["category"]
        cid = slugify(cat_text)
        if cid not in schema:
            unmatched[cat_text] = unmatched.get(cat_text, 0) + 1
            continue
        if cid not in grouped:
            grouped[cid] = []
            ordered_ids.append(cid)

        names = parse_names(row["nominees"])
        display = build_display(row["category_group"], names, row["show_title"])
        episode = row["episode_title"]
        episode = None if pd.isna(episode) else str(episode).strip()

        grouped[cid].append({"display": display, "episode": episode})

    categories = []
    for cid in ordered_ids:
        meta = schema[cid]
        categories.append({
            "id": cid,
            "label": meta["label"],
            "icon": meta["icon"],
            "group": meta["group"],
            "type": meta["type"],
            "nominees": grouped[cid],
        })

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(categories, f, ensure_ascii=False)

    schema_ids = set(schema.keys())
    covered_ids = set(ordered_ids)
    missing_from_sheet = schema_ids - covered_ids  # in schema, no rows this year

    print(f"Wrote {len(categories)} categories to {out_path}")
    print(f"Total nominee rows placed: {sum(len(v) for v in grouped.values())}")

    if unmatched:
        print(f"\n⚠ {len(unmatched)} category text(s) did not match the schema:")
        for text, count in unmatched.items():
            print(f"   \"{text}\"  ({count} row(s))  -> slug: {slugify(text)}")
        print(
            "   These are likely new or renamed categories. Add an entry to "
            "category_schema.json (pick an id, label, icon, group, type) and re-run."
        )

    if missing_from_sheet:
        print(f"\nNote: {len(missing_from_sheet)} schema categories had no rows "
              f"in this spreadsheet (fine if that category wasn't nominated this "
              f"year, worth checking otherwise):")
        for cid in sorted(missing_from_sheet):
            print(f"   {cid}")


if __name__ == "__main__":
    main()
