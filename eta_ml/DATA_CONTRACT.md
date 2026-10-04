# ETA v1 synthetic data contract

The ETA v1 training corpus is **synthetic**. Its purpose is to demonstrate a legitimate supervised-learning workflow and product contract without implying access to Amazon, carrier, FourKites, or customer shipment data.

## Prediction moment

The model predicts total transit minutes at shipment departure. Features therefore must be available at or before `depart_time`.

| Feature group | Examples | Availability | Leakage rule |
| --- | --- | --- | --- |
| Route geometry | distance_miles | Known at planning/departure | Allowed |
| Operating plan | planned_transit_min | Known at planning/departure | Allowed |
| Departure calendar | hour/day cyclic encodings, Friday, weekend, peak window | Known from departure timestamp | Allowed |
| Seasonal proxy | is_winter, route_winter_exposure | Known from route + date | Allowed; synthetic proxy, not live weather |
| Origin history | origin_dwell_mean_min, origin_congestion_index | Historical profile | Allowed |
| Destination history | destination_dwell_mean_min, destination_dwell_p90_min, destination_congestion_index | Historical profile | Allowed |
| Lane history | lane_delay_mean_min, lane_delay_std_min, lane_reliability | Historical profile | Allowed |
| Outcome | actual_transit_min | Known only after delivery | **Target only** |
| Training target | target_residual_min | Derived from outcome - heuristic baseline | **Target only** |

No realized arrival time, realized dwell, realized traffic, or post-departure event is supplied as a feature.

## Why the target is not trivial

The generator intentionally includes:
- nonlinear interactions among calendar, congestion, dwell, distance, and lane reliability;
- unobserved Gaussian noise whose scale depends on lane variability;
- occasional long-tail delay events;
- route-level effects that are only partly represented by the observed historical profile.

The supervised model therefore cannot reconstruct the label from a single deterministic formula.

## Evaluation boundary

Rows are sorted by departure time and split:
- 70% train;
- 15% calibration;
- 15% future test.

Lane-average benchmark values are computed **from the training partition only** before being applied to the future test set.

The primary test answers: "How does this model perform on future shipments on the supported lane network?"

A lane-holdout test would answer a different question—cold-start generalization to unseen lanes—and is a useful secondary diagnostic, not a replacement for the primary temporal holdout.
