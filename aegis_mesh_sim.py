"""
AEGIS Core Simulation Engine (Team HELIOS-01)
Demonstrates 4-day rolling temporal reconstruction, NASA MODIS/VIIRS quality
filtering, and dynamic neighbor failover across regional sky sectors.
"""

from dataclasses import dataclass
from typing import List, Dict
import math


@dataclass
class SkyObservation:
    node_id: str
    region: str
    day_offset: int          # -3, -2, -1, 0 (Today)
    modis_cloud_frac: float  # 0.0 (clear) to 1.0 (overcast)
    viirs_radiance: float    # nW/cm^2/sr (urban skyglow metric)
    optical_clarity: float   # 0.0 to 1.0 calibrated transparency


def compute_node_trust_weight(obs: SkyObservation) -> float:
    """Calculates dynamic trust weight using NASA MODIS & VIIRS constraints."""
    if obs.modis_cloud_frac > 0.35:
        return 0.0  # Reject cloud-obstructed frame and trigger neighbor failover
    cloud_factor = 1.0 - obs.modis_cloud_frac
    light_penalty = 1.0 / (1.0 + 0.05 * obs.viirs_radiance)
    recency_decay = math.exp(0.25 * obs.day_offset)  # Favors fresher slices
    return round(obs.optical_clarity * cloud_factor * light_penalty * recency_decay, 4)


def reconstruct_4day_shell(observations: List[SkyObservation]) -> Dict[str, dict]:
    """Stitches valid 4-day rolling window frames with automatic neighbor failover."""
    window = [o for o in observations if -3 <= o.day_offset <= 0]
    sectors: Dict[str, List[tuple]] = {}

    for obs in window:
        weight = compute_node_trust_weight(obs)
        sectors.setdefault(obs.region, []).append((obs.node_id, obs.day_offset, weight))

    shell_report = {}
    for region, entries in sectors.items():
        active_nodes = [e for e in entries if e[2] > 0]
        total_weight = sum(e[2] for e in active_nodes)
        primary_node = max(active_nodes, key=lambda x: x[2])[0] if active_nodes else "NONE"
        shell_report[region] = {
            "active_failover_node": primary_node,
            "valid_slices_in_window": len(active_nodes),
            "sector_confidence_score": round(min(total_weight, 1.0), 3),
        }
    return shell_report


if __name__ == "__main__":
    sample_feed = [
        # Bengaluru urban node hit by clouds & city glare -> automatically bypassed
        SkyObservation("BLR-URBAN-01", "South-India-Sector", 0, 0.82, 42.0, 0.30),
        # Rural dark-sky neighbor 60 km away -> takes over seamlessly
        SkyObservation("KOLAR-DARK-02", "South-India-Sector", 0, 0.08, 2.1, 0.94),
        SkyObservation("COORG-RIDGE-03", "South-India-Sector", -1, 0.12, 1.4, 0.91),
        SkyObservation("HYD-OUTSKIRT-04", "South-India-Sector", -2, 0.15, 8.5, 0.86),
    ]

    result = reconstruct_4day_shell(sample_feed)
    for sector, metrics in result.items():
        print(f"[{sector}] -> {metrics}")
