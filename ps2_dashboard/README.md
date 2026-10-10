# CreditNirvana PS2 — Collections Intelligence Dashboard

A bespoke dashboard for Problem Statement 2 (Right-Party-Contact prediction & skip-trace prioritisation).
It serves **live predictions from the saved model weights** in `../ps2_model_artifacts/`.

## Run
**Windows:** double-click `run.bat` (or run it from a terminal).
**Any OS:**
```bash
cd ps2_dashboard/backend
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```
Then open **http://127.0.0.1:8000**.

## What it shows
- **Command Center** — headline KPIs, portfolio reachability, RPC-per-1,000 lift, model leaderboard, health mix.
- **Contact-Point Scorer** — enter a number's context + its recent call outcomes → **live** P(RPC within 14 days), state, next-best action, reason, compliance flag, HMM belief. Presets included.
- **Dial List & Actions** — contact points ranked by health from the deployed scorecard.
- **Skip-Trace Value** — live expected-value-of-information calculator.
- **Model Performance** — ROC / PR / calibration (recomputed with the saved model) + the technique-evaluation table.
- **EDA & Insights** — best-time heatmap, personas, funnel, shared-number, survival, source RPC.
- **Compliance** — the RBI FPC / DPDP guardrails and suppression mix.

## Architecture
- **backend/app.py** — FastAPI; loads the joblib bundles + `hmm_params.npz`; prediction endpoints; serves the frontend.
- **backend/featurize.py** — builds the exact 72-feature vector from raw inputs, incl. recency-weighted shares + a forward-filter HMM belief.
- **frontend/** — hand-written HTML/CSS/JS (Apache ECharts), CreditNirvana palette.
- **frontend/data/dashboard_data.json** — precomputed EDA/metric chart data (regenerate with the data script if the models change).

## Dependencies
`fastapi`, `uvicorn`, `joblib`, `scikit-learn`, `lightgbm`, `numpy`, `pandas` (already in the Anaconda base used to train).
