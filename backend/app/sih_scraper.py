import re
import requests
from bs4 import BeautifulSoup

SOURCE_URL = "https://www.sih.gov.in/sih2026PS"
HEADERS = {
    "User-Agent": "SIH-Submission-Monitor/1.0 (respectful polling)"
}

def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()

def parse_count(value: str):
    m = re.search(r"(\d[\d,]*)\s*/\s*(\d[\d,]*)", value or "")
    if not m:
        return None, None
    return int(m.group(1).replace(",", "")), int(m.group(2).replace(",", ""))

def fetch_problem_statements():
    response = requests.get(SOURCE_URL, headers=HEADERS, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    records = []

    for table in soup.find_all("table"):
        for tr in table.find_all("tr"):
            cells = tr.find_all(["td", "th"])
            if len(cells) < 8:
                continue
            values = [clean(c.get_text(" ", strip=True)) for c in cells]
            count_idx = next(
                (i for i, v in enumerate(values) if parse_count(v)[0] is not None),
                None
            )
            ps_idx = next(
                (i for i, v in enumerate(values) if re.fullmatch(r"SIH\d{5,}", v)),
                None
            )
            if count_idx is None or ps_idx is None:
                continue

            category = next(
                (v for v in values if v.lower() in ("software", "hardware")),
                None
            )
            if not category:
                continue

            submitted, capacity = parse_count(values[count_idx])
            if submitted is None:
                continue

            records.append({
                "ps_id": values[ps_idx],
                "title": values[2] if len(values) > 2 else "",
                "organization": values[1] if len(values) > 1 else "",
                "department": values[1] if len(values) > 1 else "",
                "category": category.capitalize(),
                "theme": values[-2] if len(values) >= 2 else "",
                "submitted": submitted,
                "capacity": capacity or 500,
                "deadline": values[-1] if values else "",
                "description": "",
            })

    unique = {}
    for r in records:
        unique[r["ps_id"]] = r
    return list(unique.values())
