import json
import re
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime

INPUT_XLSX = "/Users/maxhigdon/Downloads/table_2026-03-30_12-41-18.xlsx"
OUTPUT_JSON = "public/data/scotland-degree-share.json"
CONSTITUENCY_GEO = "public/data/scotland-constituencies.geojson"

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


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


def col_from_cell(cell: str) -> str:
    return "".join(ch for ch in cell if ch.isalpha())


def col_index(col: str) -> int:
    idx = 0
    for ch in col:
        idx = idx * 26 + (ord(ch.upper()) - ord("A") + 1)
    return idx


def load_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        with zf.open("xl/sharedStrings.xml") as f:
            tree = ET.parse(f)
        strings = []
        for si in tree.findall(".//s:si", NS):
            parts = []
            for t in si.findall(".//s:t", NS):
                parts.append(t.text or "")
            strings.append("".join(parts))
        return strings
    except KeyError:
        return []


def load_rows(zf: zipfile.ZipFile, sheet_path: str, shared: list[str]):
    with zf.open(sheet_path) as f:
        tree = ET.parse(f)
    rows = []
    for row in tree.findall(".//s:sheetData/s:row", NS):
        row_vals = {}
        for c in row.findall("s:c", NS):
            r = c.get("r")
            t = c.get("t")
            v = c.find("s:v", NS)
            if v is None:
                continue
            value = v.text or ""
            if t == "s":
                try:
                    value = shared[int(value)]
                except Exception:
                    pass
            row_vals[r] = value
        if row_vals:
            rows.append(row_vals)
    return rows


def find_header_row(rows):
    for idx, row in enumerate(rows):
        vals = list(row.values())
        if any("Degree level qualifications or above" in str(v) for v in vals) and any(
            "All people aged 16 and over" in str(v) for v in vals
        ):
            return idx, row
    return None, None


def parse_degree_table(rows):
    header_idx, header_row = find_header_row(rows)
    if header_row is None:
        raise RuntimeError("Header row not found.")

    def get_cell(row, col_letter):
        for key, value in row.items():
            if col_from_cell(key) == col_letter:
                return value
        return ""

    parsed = []
    for row in rows[header_idx + 1 :]:
        name = get_cell(row, "B")
        if not name or name == "Scottish Parliamentary Region - Scottish Parliamentary Constituency 2021":
            continue
        total_raw = get_cell(row, "C")
        degree_raw = get_cell(row, "I")
        try:
            total = float(total_raw)
        except Exception:
            total = None
        try:
            degree = float(degree_raw)
        except Exception:
            degree = None
        parsed.append((name, total, degree))

    return parsed


def main():
    with zipfile.ZipFile(INPUT_XLSX) as zf:
        shared = load_shared_strings(zf)
        rows = load_rows(zf, "xl/worksheets/sheet2.xml", shared)
    parsed = parse_degree_table(rows)

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
    total_pop = 0.0
    total_degree = 0.0
    missing = []

    for name, total, degree in parsed:
        if not total or total <= 0 or degree is None:
            continue
        key = normalized_key(name)
        code = name_to_code.get(key)
        if not code:
            missing.append(name)
            continue
        degree_share = degree / total
        constituencies[code] = {
            "degree": degree_share,
            "noDegree": max(0.0, 1.0 - degree_share),
            "totalPop": total,
        }
        total_pop += total
        total_degree += degree

    baseline_degree = (total_degree / total_pop) if total_pop else 0.0
    baseline = {
        "degree": baseline_degree,
        "noDegree": max(0.0, 1.0 - baseline_degree),
    }

    payload = {
        "source": {
            "file": INPUT_XLSX,
            "table": "UV501 - Highest level of qualification",
            "notes": "Degree share for age 16+ using degree-level qualifications or above. No-degree is residual.",
        },
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "meta": {"baseline": baseline, "totalPop": total_pop, "missing": missing},
        "constituencies": constituencies,
    }

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

    print("Wrote", OUTPUT_JSON, "rows", len(constituencies), "missing", len(missing))


if __name__ == "__main__":
    main()
