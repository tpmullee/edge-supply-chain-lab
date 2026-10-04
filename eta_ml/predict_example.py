from pathlib import Path
from src.eta_ml import explain_with_shap, load_bundle, predict

root = Path(__file__).resolve().parent
bundle = load_bundle(root / "artifacts" / "eta_model_bundle.joblib")
request = dict(origin="ORD", destination="LAX", depart_time="2026-10-09T13:00:00Z", late_threshold_iso="2026-10-11T14:00:00Z")
print(predict(bundle, **request))
print(explain_with_shap(bundle, origin=request["origin"], destination=request["destination"], depart_time=request["depart_time"]))
