import csv
import json
from datetime import datetime

INPUT_CSV = "/Users/maxhigdon/Downloads/table_2026-03-30_12-47-02.csv"
OUTPUT_JSON = "public/data/scotland-nssec-share.json"
CONSTITUENCY_GEO = "public/data/scotland-constituencies.geojson"


def normalize_name(value: str) -> str:
    return (
        str(value or "")
        .lower()
        .replace("islands", "")
        .replace("&", " and ")
        .replace(",", " ")
        .replace(".", " ")
        .replace("'", " ")
        .split()
    )


def normalized_key(value: str) -> str:
    return " ".join(normalize_name(value))


def read_rows(path: str):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.reader(f))


def build_lookup(rows):
    label_idx = None
    for i, row in enumerate(rows):
        if row and row[0].strip() == "Scottish Parliamentary Region - Scottish Parliamentary Constituency 2021":
            label_idx = i
            break
    if label_idx is None:
        raise RuntimeError("Could not find constituency label row.")

    # column indices based on the header row discovered in the CSV export
    idx_total = 1
    l1 = 2
    l2 = 3
    l3 = 4
    l4 = 5
    l5 = 6
    l6 = 7
    l7 = 8
    l8 = 9
    l9 = 10
    l10 = 11
    l11 = 12
    l12 = 13
    l13 = 14
    l14_1 = 15
    l14_2 = 16
    l15 = 17

    entries = []
    for row in rows[label_idx + 1 :]:
        if not row or len(row) <= idx_total:
            continue
        name = row[0].strip()
        if not name:
            continue

        def val(i):
            try:
                return float(row[i])
            except Exception:
                return 0.0

        try:
            total = float(row[idx_total])
        except Exception:
            continue

        higher = val(l1) + val(l2) + val(l3) + val(l4) + val(l5)
        intermediate = val(l6) + val(l7) + val(l8) + val(l9) + val(l10)
        lower = val(l11) + val(l12) + val(l13) + val(l14_1) + val(l14_2)
        excluded = val(l15)

        entries.append(
            {
                "name": name,
                "total": total,
                "higher": higher,
                "intermediate": intermediate,
                "lower": lower,
                "excluded": excluded,
            }
        )

    return entries


def main():
    rows = read_rows(INPUT_CSV)
    entries = build_lookup(rows)

    with open(CONSTITUENCY_GEO, "r", encoding="utf-8") as f:
        geo = json.load(f)

    name_to_code = {}
    for feature in geo.get("features", []):
        props = feature.get("properties") or {}
        name = props.get("SPC22NM")
        code = props.get("SPC22CD")
        if not name or not code:
            continue
        name_to_code[normalized_key(name)] = code

    constituencies = {}
    missing = []
    total_pop = 0.0
    total_higher = 0.0
    total_intermediate = 0.0
    total_lower = 0.0
    total_excluded = 0.0

    for entry in entries:
        name = entry["name"]
        total = entry["total"]
        if total <= 0:
            continue
        key = normalized_key(name)
        code = name_to_code.get(key)
        if not code:
            missing.append(name)
            continue
        higher = entry["higher"]
        intermediate = entry["intermediate"]
        lower = entry["lower"]
        excluded = entry["excluded"]
        total_pop += total
        total_higher += higher
        total_intermediate += intermediate
        total_lower += lower
        total_excluded += excluded
        constituencies[code] = {
            "higher": higher / total,
            "intermediate": intermediate / total,
            "lower": lower / total,
            "excluded": excluded / total,
            "totalPop": total,
        }

    baseline = {
        "higher": total_higher / total_pop if total_pop else 0.0,
        "intermediate": total_intermediate / total_pop if total_pop else 0.0,
        "lower": total_lower / total_pop if total_pop else 0.0,
        "excluded": total_excluded / total_pop if total_pop else 0.0,
    }

    payload = {
        "source": {
            "file": INPUT_CSV,
            "table": "UV607 - NS-SeC",
            "grouping": {
                "higher": ["L1", "L2", "L3", "L4", "L5"],
                "intermediate": ["L6", "L7", "L8", "L9", "L10"],
                "lower": ["L11", "L12", "L13", "L14.1", "L14.2"],
                "excluded": ["L15"],
            },
        },
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "meta": {
            "baseline": {
                "higher": baseline["higher"],
                "intermediate": baseline["intermediate"],
                "lower": baseline["lower"],
            },
            "excluded": baseline["excluded"],
            "totalPop": total_pop,
            "missing": missing,
        },
        "constituencies": constituencies,
    }

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

    print("Wrote", OUTPUT_JSON, "rows", len(constituencies), "missing", len(missing))


if __name__ == "__main__":
    main()
