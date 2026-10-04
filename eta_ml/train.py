from pathlib import Path
from src.eta_ml import save_training_outputs

if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    report = save_training_outputs(root)
    print("ML metrics:", report["ml"])
    print("Naive baseline metrics:", report["baseline"])
    print("Lane-average baseline metrics:", report["lane_average_baseline"])
    print("Improvement:", report["improvement"])
    print("Uncertainty:", report["uncertainty"])
