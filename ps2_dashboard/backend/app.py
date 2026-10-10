"""CreditNirvana PS2 dashboard — FastAPI backend.
Loads the saved model bundles from ps2_model_artifacts/ and serves live predictions + chart data."""
import os, json, numpy as np, pandas as pd, joblib
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import featurize as fz

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))              # D:\Downloads\openiit_data
FRONT = os.path.abspath(os.path.join(HERE, '..', 'frontend'))

# Artifact dir resolution (deploy-friendly): ART_DIR env > repo-root/ps2_model_artifacts > backend/artifacts
ART = os.environ.get('ART_DIR') or os.path.join(ROOT, 'ps2_model_artifacts')
if not os.path.isdir(ART):
    ART = os.path.join(HERE, 'artifacts')

print('Loading model artifacts from', ART)
HEALTH = joblib.load(os.path.join(ART, 'health_primary.joblib'))
COMP   = joblib.load(os.path.join(ART, 'rpc_per_attempt_companion.joblib'))
ADDR   = joblib.load(os.path.join(ART, 'address_rpc.joblib'))
SKIP   = joblib.load(os.path.join(ART, 'skip_trace_pfind.joblib'))
_h = np.load(os.path.join(ART, 'hmm_params.npz'))
HMM = {'EMIT': _h['EMIT'], 'TM': _h['TRANSITION'], 'PRIOR': _h['PRIOR']}
MANIFEST = json.load(open(os.path.join(ART, 'manifest.json')))
try:
    SCORECARD = pd.read_csv(os.path.join(ART, 'contact_point_scorecard.csv'))
except Exception:
    SCORECARD = pd.DataFrame()
DASH = {}
_dp = os.path.join(FRONT, 'data', 'dashboard_data.json')
if os.path.exists(_dp): DASH = json.load(open(_dp))

HFEAT = HEALTH['features']; HCAT = HEALTH['categorical']; HENC = HEALTH['tree_encoder']; HCATSET = set(HCAT)

app = FastAPI(title='CreditNirvana PS2 Dashboard')

# Allow the static frontend (same-origin on Render, or a separate Vercel domain) to call the API.
_origins = os.environ.get('ALLOW_ORIGINS', '*')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'] if _origins.strip() == '*' else [o.strip() for o in _origins.split(',') if o.strip()],
    allow_methods=['*'], allow_headers=['*'], allow_credentials=False,
)

def _predict(bundle, feat_dict):
    cat = bundle['categorical']; enc = bundle.get('tree_encoder') or bundle.get('encoder')
    order = bundle['features'] if 'features' in bundle else (list(bundle['categorical']) + list(bundle['numeric']))
    catrow = [[feat_dict.get(c) for c in cat]]
    enc_vals = enc.transform(catrow)[0]
    catmap = dict(zip(cat, enc_vals))
    row = {f: (catmap[f] if f in set(cat) else feat_dict.get(f, np.nan)) for f in order}
    X = pd.DataFrame([row], columns=order).astype(float)
    model = bundle.get('calibrated_model') or bundle.get('model')
    return float(model.predict_proba(X)[:, 1][0])

# ---------------- API ----------------
class HealthReq(BaseModel):
    source: Optional[str]=None; relation_recorded: Optional[str]=None; priority_slot: Optional[float]=0
    masked_n_accounts: Optional[float]=1; phone_age_days: Optional[float]=30; channel: Optional[str]='tele_agent'
    dialling_arm: Optional[str]='rule_based'; lender_id: Optional[str]='L01'; portfolio: Optional[str]='pl_salaried'
    income_type: Optional[str]='salaried'; town_id: Optional[str]='T1'; preferred_language: Optional[str]='hinglish'
    bucket_start: Optional[str]='1-30'; bureau_score_band: Optional[str]='550-649'
    last_bounce_reason: Optional[str]='insufficient_funds'; outstanding: Optional[float]=100000
    emi_amount: Optional[float]=10000; overdue_start: Optional[float]=20000; dpd_start: Optional[float]=30
    other_active_loans: Optional[float]=1; ability_to_pay_estimate: Optional[float]=None
    prev_ptp_count: Optional[float]=0; prev_ptp_broken: Optional[float]=0; salary_day_known: Optional[bool]=False
    paid_other_lenders_30d: Optional[bool]=False; hour: Optional[float]=10; dow: Optional[float]=2
    sequence: Optional[List[Dict[str, Any]]]=[]

@app.get('/api/meta')
def meta():
    cats = {c: list(map(str, v)) for c, v in zip(HCAT, HENC.categories_)}
    return {'categories': cats, 'states': fz.S9, 'horizon_days': HEALTH.get('horizon_days', 14),
            'metrics': MANIFEST.get('metrics_test', {}), 'hidden_states': fz.HMM_HID}

@app.get('/api/data')
def data(): return JSONResponse(DASH)

@app.get('/api/scorecard')
def scorecard(limit: int = 5000):
    if SCORECARD.empty: return {'rows': []}
    _sk = 'p_raw' if 'p_raw' in SCORECARD.columns else 'p_health'
    df = SCORECARD.sort_values(_sk, ascending=False).head(limit)
    return {'rows': df.to_dict(orient='records')}

@app.post('/api/predict/health')
def predict_health(req: HealthReq):
    p = req.dict()
    f, agg = fz.build_features(p, HMM)
    p_health = _predict(HEALTH, f)
    # companion per-attempt score (same feature dict, its own feature order)
    try: p_attempt = _predict(COMP, f)
    except Exception: p_attempt = None
    state = fz.health_state(agg, p.get('masked_n_accounts'))
    action, reason, suppress = fz.decide(p_health, state, p.get('masked_n_accounts'))
    drivers = [
        {'label': 'Prior RPC rate', 'value': None if np.isnan(f['h_rpc_rate']) else round(f['h_rpc_rate'], 2), 'good': (not np.isnan(f['h_rpc_rate'])) and f['h_rpc_rate'] > 0.2},
        {'label': 'Days since last RPC', 'value': None if np.isnan(f['days_since_last_rpc']) else round(f['days_since_last_rpc'], 0), 'good': (not np.isnan(f['days_since_last_rpc'])) and f['days_since_last_rpc'] < 14},
        {'label': 'HMM borrower belief', 'value': round(f['hmm_borrower_number'], 2), 'good': f['hmm_borrower_number'] > 0.5},
        {'label': 'Fail streak', 'value': int(f['fail_streak']), 'good': f['fail_streak'] < 3},
        {'label': 'Shared by # accounts', 'value': int(f['masked_n_accounts']), 'good': f['masked_n_accounts'] < 2},
        {'label': 'Number source', 'value': f['ph_source'], 'good': f['ph_source'] in ('kyc_origination', 'borrower_update', 'skip_trace')},
    ]
    hmm_belief = {h: round(float(f[f'hmm_{h}']), 3) for h in fz.HMM_HID}
    return {'p_health': round(p_health, 4), 'p_attempt': (round(p_attempt, 4) if p_attempt is not None else None),
            'state': state, 'action': action, 'reason': reason, 'suppress': suppress,
            'drivers': drivers, 'hmm_belief': hmm_belief, 'agg': agg, 'horizon_days': HEALTH.get('horizon_days', 14)}

class SkipReq(BaseModel):
    outstanding: float=200000; dpd_start: float=90; emi_amount: float=12000; overdue_start: float=40000
    other_active_loans: float=1; prev_ptp_count: float=1; prev_ptp_broken: float=1
    ability_to_pay_estimate: Optional[float]=None; n_phones: float=2; n_attempts: float=15
    cost_inr: float=104; bucket_start: str='90+'; bureau_score_band: str='300-549'

@app.post('/api/skiptrace')
def skiptrace(req: SkipReq):
    p = req.dict()
    feat = {**p}
    p_find = _predict(SKIP, feat)
    p_rec = SKIP.get('p_recover_given_reached', 0.69)
    E_rec = p['outstanding'] * p_rec
    ev = p_find * E_rec - p['cost_inr']
    return {'p_find': round(p_find, 4), 'p_recover': round(float(p_rec), 3), 'E_recovery': round(E_rec, 0),
            'cost': p['cost_inr'], 'ev': round(ev, 0), 'worth_it': bool(ev > 0)}

@app.get('/health')
def hc(): return {'ok': True, 'models': ['health_primary', 'companion', 'address_rpc', 'skip_trace_pfind'],
                  'health_features': len(HFEAT)}

# ---------------- static frontend ----------------
# /static kept for backward compatibility; the root mount (html=True) serves index.html
# and relative asset paths (css/, js/, data/) so the SAME frontend works when hosted by
# this backend (Render) or by a static host (Vercel).
app.mount('/static', StaticFiles(directory=FRONT), name='static')
app.mount('/', StaticFiles(directory=FRONT, html=True), name='root')
