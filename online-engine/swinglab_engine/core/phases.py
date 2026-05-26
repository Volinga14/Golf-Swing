from __future__ import annotations

PHASES = ["address", "takeaway", "top", "impact", "finish"]
PHASE_LABELS = {
    "address": "Address",
    "takeaway": "Takeaway",
    "top": "Top",
    "impact": "Impact",
    "finish": "Finish",
}
REFERENCE_RATIOS = {
    "address": 0.04,
    "takeaway": 0.22,
    "top": 0.46,
    "impact": 0.68,
    "finish": 0.92,
}
REFERENCE_WINDOWS = {
    "address": (0.00, 0.12),
    "takeaway": (0.12, 0.32),
    "top": (0.34, 0.58),
    "impact": (0.56, 0.78),
    "finish": (0.78, 1.00),
}
