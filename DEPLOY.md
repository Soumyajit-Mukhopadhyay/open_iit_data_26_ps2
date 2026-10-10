# Deploying the CreditNirvana PS2 Dashboard

The app has two parts:

| Part | Stack | Can it go on Vercel? |
|------|-------|----------------------|
| **Frontend** | static HTML / CSS / JS + ECharts (`ps2_dashboard/frontend`) | ✅ Yes |
| **Backend** | FastAPI + LightGBM + scikit-learn + pandas, loads ~14 MB of model weights and runs `predict_proba` live (`ps2_dashboard/backend`) | ❌ Not practical |

**Why the backend can't go on Vercel:** Vercel runs Python only as serverless functions with a 250 MB unzipped bundle cap. `scikit-learn + scipy + pandas + numpy + lightgbm` together blow past that, and reloading the pickled weights on every cold start is slow. So the backend needs a normal always-on container — **Render** (or Railway / Fly.io) is the right home.

You have two deployment options.

---

## Option A — Everything on Render (simplest, recommended)

The FastAPI backend already serves the frontend, so **one** Render service gives you a single working URL. You do **not** need Vercel.

1. Go to <https://dashboard.render.com> → **New** → **Blueprint**.
2. Connect your GitHub and pick `open_iit_data_26_ps2`.
3. Render reads [`render.yaml`](render.yaml) and proposes the service `creditnirvana-ps2`. Click **Apply**.
   - It uses root dir `ps2_dashboard/backend`, installs `requirements.txt`, and starts `uvicorn app:app --host 0.0.0.0 --port $PORT`.
   - First build takes ~3–5 min (compiling wheels).
4. Open the URL Render gives you, e.g. `https://creditnirvana-ps2.onrender.com` — the full dashboard loads.

> Free tier note: the service sleeps after ~15 min idle; the first request after sleep takes ~30 s to wake. Upgrade to the $7 Starter plan to keep it warm.

**Done.** Skip Option B unless you specifically want the frontend on Vercel's CDN.

---

## Option B — Frontend on Vercel + Backend on Render

Use this if you want the UI served from Vercel's edge network and the API from Render.

### 1. Deploy the backend on Render (same as Option A, steps 1–3)
Note the backend URL, e.g. `https://creditnirvana-ps2.onrender.com`.

### 2. Point the frontend at that backend
Edit **`ps2_dashboard/frontend/index.html`** — the line near the top:
```html
<script>
  window.CN_API_BASE = "https://creditnirvana-ps2.onrender.com";   // ← your Render URL
  window.CN_API_BASE = (window.CN_API_BASE || "").replace(/\/$/, "");
</script>
```
Commit and push the change.

### 3. Deploy the frontend on Vercel
1. <https://vercel.com> → **Add New** → **Project** → import `open_iit_data_26_ps2`.
2. Set **Root Directory** = `ps2_dashboard/frontend`.
3. Framework preset = **Other**, Build Command = *(empty)*, Output Directory = `.` (the included [`vercel.json`](ps2_dashboard/frontend/vercel.json) already says this).
4. **Deploy.** You'll get e.g. `https://open-iit-ps2.vercel.app`.

### 4. (Optional) Lock CORS down
On Render, set the env var `ALLOW_ORIGINS` to your exact Vercel URL instead of `*`, then redeploy.

---

## Local run

```bash
cd ps2_dashboard/backend
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000
# open http://127.0.0.1:8000
```

## How paths resolve (for maintainers)
- `app.py` finds the weights via `ART_DIR` env var → else `<repo>/ps2_model_artifacts` → else `backend/artifacts`.
- The frontend uses **relative** asset paths (`css/…`, `js/…`) and a configurable `window.CN_API_BASE`, so the *same* files work whether the backend serves them (Render) or a static host does (Vercel).
- CORS is open by default (`ALLOW_ORIGINS=*`); set it to your frontend origin in production.
