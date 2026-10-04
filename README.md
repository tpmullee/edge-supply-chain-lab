# EDGE Supply Chain Lab

> **ETA v1 rebuild in progress on this branch:** a supervised Gradient Boosting model trained on 30,000 disclosed synthetic FTL shipments, evaluated on a chronological future holdout, compared with both a naive operating heuristic and a training-only lane-average baseline, with real SHAP explanations and held-out residual prediction ranges. See `eta_ml/` for the reproducible model package and measured artifacts.
>
> The older FastAPI `/eta/train` RandomForest flow remains in the repo as the original toy prototype; it is not the model used for the new v1 evaluation claims.


A unified portfolio application showcasing real supply chain analytics capabilities built by **Pat Mullee**.

This application is designed to demonstrate practical, executive-level supply chain insights that a COO, VP Supply Chain, or Senior Analytics Leader would expect — presented in a clean, modern interface matching the brand of Pat’s portfolio.

---

## 📦 Features

### **1. On-Time & ETA Intelligence**
- Train a toy ETA regression model.
- Predict travel time for individual shipments.
- Upload ETA & arrival CSVs.
- Measure forecast accuracy:
  - Bias (min)
  - P50 absolute error
  - P90 absolute error

---

### **2. Inventory Policy Simulator**
- Simulates a classic **(s, S)** system.
- Outputs:
  - Average daily cost
  - Service level (% demand served)
  - Number of replenishment orders

---

### **3. Network & Coverage Explorer**
- Explore geographic coverage using:
  - Retail store locations (Sam’s Club demo dataset)
  - UN LOCODE global location dataset
- Returns summaries by state/country.

---

### **4. Emissions Calculator**
- Multimodal transport emissions:
  - Truck
  - Rail
  - Ocean
  - Air
- Calculates CO₂ (kg) using ton-km factors.
- Supports multiple parallel shipments.

---

## 🏗️ Tech Stack

### **Backend**
- FastAPI
- NumPy / Pandas
- Scikit-learn
- CORS-enabled for local dev

### **Frontend**
- React (Vite)
- Fully custom CSS (matching Pat Mullee portfolio look)

---

## 🚀 Running Locally

### **1. Start Backend**

cd backend
uvicorn app:app --reload

### **2. Start Frontend**

cd frontend
npm install
npm run dev

Frontend will start at:
http://localhost:5173


Backend listens at:
http://localhost:8000


---

## 📁 Project Structure


backend/
app.py
routers/
core/
data/
frontend/
src/
modules/
components/
styles/
README.md
---

## 📌 Notes
- CSV datasets (Sam’s Club, UN LOCODE, ISO codes) should be placed under `backend/data/`.
- The UI is intentionally simple, clean, and focused on demonstrating business value.

---

## ✨ Author
**Pat Mullee**  
AI Product & Platform Leader  
www.patmullee.com
