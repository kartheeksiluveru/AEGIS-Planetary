# AEGIS — Decentralized Citizen-Science Atmospheric & Celestial Mesh
NASA Space Apps Challenge 2026 · Team HELIOS-01  
Challenge: Be An Earth System Trend Detective!

# Overview:
AEGIS is a decentralized citizen-science network that transforms everyday amateur astrophotography rigs into a continuous, self-healing planetary sensor shell. 
While NASA orbital instruments (MODIS, VIIRS) capture vast global datasets, regional cloud cover (~67% global average), urban light pollution, and orbital revisit delays create blind spots in continuous ground-level trend tracking.
AEGIS solves this with zero new hardware by linking backyard observers across overlapping regional sectors.

# Core Architecture:
1. 4-Day Rolling Temporal Window:** Calibrated 2D night-sky frames are plate-solved onto shared celestial coordinates and stitched across a sliding 4-day window (`Day -3` to `Today`), separating short-term weather noise from genuine atmospheric trends.
2. Dynamic Neighbor Failover:** Cross-referenced against **NASA MODIS Cloud Fraction and NASA VIIRS Nighttime Lights (Black Marble)**. When clouds or city skyglow obscure a primary node, AEGIS automatically routes observation priority to clear-sky neighboring nodes.
3. Gamified Incentive Engine:** A contributor leaderboard rewards dark-sky clarity, multi-day streak consistency, and coverage in under-monitored regions.


# Repository Contents:
* `aegis_mesh_sim.py` — Python simulation of the 4-day rolling window, MODIS/VIIRS quality weighting, and dynamic neighbor failover logic.
* `index.html` — Interactive browser visualization of the Earth-Core planetary sensor shell and live node routing (deployable via GitHub Pages).


# Data & SI Disclosure:
* NASA Datasets: NASA Earth Observations (MODIS Cloud Fraction), NASA Earthdata VIIRS Nighttime Lights (Black Marble).
* Super Intelligence (SI) Disclosure:** AI assistance was used to structure documentation copy, presentation slides, and simulation boilerplate. All system architecture, mathematical framing, and validation logic were designed by Team HELIOS-01(solo entry).
