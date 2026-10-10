"""Turn raw dashboard inputs (+ a recent call-outcome sequence) into the exact feature
vector the saved PS2 models expect. Mirrors the notebook's leakage-safe as-of logic:
recency-weighted disposition shares, run-length / switch-rate, recycled-signatures, and a
forward-filter HMM borrower belief computed from the saved hmm_params.npz."""
import numpy as np

S9 = ['RPC','THIRD_PARTY','WRONG','REJECTED','NO_ANSWER','UNREACHABLE','SWITCHED_OFF','INVALID','OTHER']
SI9 = {s: i for i, s in enumerate(S9)}
KEEP = [s for s in S9 if s not in ('NO_ANSWER', 'OTHER')]          # states kept as share_/wshare_ features
LAMBDA = np.log(2) / 14.0                                          # recency half-life = 14 days
ANSWERED = {'RPC', 'THIRD_PARTY', 'WRONG'}                         # states that imply the line was answered
STATE2RESP = {'RPC':'answered','THIRD_PARTY':'answered','WRONG':'answered','REJECTED':'busy_rejected',
              'NO_ANSWER':'ring_no_answer','UNREACHABLE':'not_reachable','SWITCHED_OFF':'switched_off',
              'INVALID':'number_does_not_exist'}
HMM_HID = ['borrower_number','switched_off','not_borrower_number','third_party_number','invalid_number']

def hmm_belief(seq_states, EMIT, TM, PRIOR):
    """Forward-filter the hidden borrower-state belief after observing the whole sequence."""
    b = PRIOR.copy()
    for st in seq_states:
        o = SI9.get(st, SI9['OTHER'])
        b = b * EMIT[:, o]
        s = b.sum()
        b = (b / s) if s > 0 else PRIOR.copy()
        b = b @ TM
    return b

def _f(x, default=np.nan):
    try:
        if x is None or x == '': return default
        return float(x)
    except Exception:
        return default

def build_features(p, hmm):
    """p = dict from the UI; hmm = dict(EMIT,TM,PRIOR). Returns {feature_name: value} + derived info."""
    seq = p.get('sequence') or []                                  # list of {state, days_ago}
    seq = sorted(seq, key=lambda e: -float(e.get('days_ago', 0)))   # oldest -> newest
    states = [e.get('state', 'NO_ANSWER') for e in seq]
    days = [float(e.get('days_ago', 0)) for e in seq]
    n = len(seq)
    si = [SI9.get(s, SI9['OTHER']) for s in states]

    # counts
    cnt = {s: states.count(s) for s in S9}
    rpc = cnt['RPC']; ans = sum(cnt[s] for s in ANSWERED); so = cnt['SWITCHED_OFF']
    tp = cnt['THIRD_PARTY']; wr = cnt['WRONG'] + cnt['INVALID']
    # recency weights (recent -> higher)
    w = np.exp(-LAMBDA * np.array(days)) if n else np.array([])
    f = {}
    # ---- phone call-history (as-of now) ----
    f['h_attempts'] = n
    f['h_rpc'] = rpc; f['h_rpc_rate'] = (rpc / n) if n else np.nan
    f['h_ans'] = ans; f['h_ans_rate'] = (ans / n) if n else np.nan
    f['h_so'] = so; f['h_tp'] = tp; f['h_wrong'] = wr
    f['days_since_last_attempt'] = min(days) if n else np.nan
    rpc_days = [d for s, d in zip(states, days) if s == 'RPC']
    f['days_since_last_rpc'] = min(rpc_days) if rpc_days else np.nan
    # fail streak = consecutive non-RPC at the most-recent end
    fs = 0
    for s in reversed(states):
        if s == 'RPC': break
        fs += 1
    f['fail_streak'] = fs
    # account-level history approximated by the phone (single-number demo)
    f['ha_attempts'] = n; f['ha_rpc'] = rpc; f['ha_rpc_rate'] = (rpc / n) if n else np.nan
    f['days_since_last_attempt_acct'] = f['days_since_last_attempt']
    # ---- raw + recency-weighted disposition shares ----
    for s in S9:
        f[f'share_{s}'] = (cnt[s] / n) if n else np.nan
    if n and w.sum() > 0:
        for s in S9:
            mask = np.array([1.0 if st == s else 0.0 for st in states])
            f[f'wshare_{s}'] = float((w * mask).sum() / w.sum())
    else:
        for s in S9: f[f'wshare_{s}'] = np.nan
    # ---- sequence dynamics ----
    f['last_si'] = si[-1] if n else -1
    # run length of the final run
    rl = 0
    if n:
        last = states[-1]
        for s in reversed(states):
            if s == last: rl += 1
            else: break
    f['run_length'] = rl
    sw = sum(1 for i in range(1, n) if states[i] != states[i-1])
    f['switch_rate'] = (sw / n) if n else np.nan
    # recycled signatures
    waft_rpc = waft_dead = 0; seen_rpc = False
    for i, s in enumerate(states):
        prev = states[i-1] if i > 0 else None
        if s == 'WRONG':
            if seen_rpc: waft_rpc += 1
            if prev in ('SWITCHED_OFF', 'UNREACHABLE'): waft_dead += 1
        if s == 'RPC': seen_rpc = True
    f['waft_rpc'] = waft_rpc; f['waft_dead'] = waft_dead
    # ---- HMM belief ----
    bel = hmm_belief(states, hmm['EMIT'], hmm['TM'], hmm['PRIOR'])
    for i, h in enumerate(HMM_HID): f[f'hmm_{h}'] = float(bel[i])
    f['hmm_entropy'] = float(-(bel * np.log(bel + 1e-9)).sum())
    # ---- static contact-point ----
    f['priority_slot'] = _f(p.get('priority_slot'), 0)
    f['masked_n_accounts'] = _f(p.get('masked_n_accounts'), 1)
    f['phoneid_n_accounts'] = _f(p.get('masked_n_accounts'), 1)
    f['phone_age_days'] = _f(p.get('phone_age_days'), 30)
    f['is_self'] = 1.0 if p.get('relation_recorded') == 'self' else 0.0
    # ---- account context ----
    out = _f(p.get('outstanding'), 100000); emi = _f(p.get('emi_amount'), 10000); od = _f(p.get('overdue_start'), 20000)
    f['log_outstanding'] = np.log1p(out); f['log_emi_amount'] = np.log1p(emi); f['log_overdue_start'] = np.log1p(od)
    f['dpd_start'] = _f(p.get('dpd_start'), 30); f['other_active_loans'] = _f(p.get('other_active_loans'), 1)
    atp = p.get('ability_to_pay_estimate'); f['ability_to_pay_estimate'] = _f(atp, np.nan)
    f['atp_missing'] = 1.0 if (atp is None or atp == '') else 0.0
    ppc = _f(p.get('prev_ptp_count'), 0); ppb = _f(p.get('prev_ptp_broken'), 0)
    f['prev_ptp_count'] = ppc; f['prev_ptp_broken'] = ppb
    f['prev_ptp_broken_rate'] = (ppb / ppc) if ppc else np.nan
    f['salary_day_missing'] = 0.0 if p.get('salary_day_known') else 1.0
    f['paid_other_lenders_30d'] = 1.0 if p.get('paid_other_lenders_30d') else 0.0
    f['hour'] = _f(p.get('hour'), 10); f['dow'] = _f(p.get('dow'), 2)
    # ---- categoricals (strings; encoded by the app with the saved OrdinalEncoder) ----
    f['ph_source'] = p.get('source', 'kyc_origination')
    f['relation_recorded'] = p.get('relation_recorded', 'self')
    f['lender_id'] = p.get('lender_id', 'L01')
    f['portfolio'] = p.get('portfolio', 'pl_salaried')
    f['income_type'] = p.get('income_type', 'salaried')
    f['town_id'] = p.get('town_id', 'T1')
    f['preferred_language'] = p.get('preferred_language', 'hinglish')
    f['bucket_start'] = p.get('bucket_start', '1-30')
    f['bureau_score_band'] = p.get('bureau_score_band', '550-649')
    f['last_bounce_reason'] = p.get('last_bounce_reason', 'insufficient_funds')
    f['channel'] = p.get('channel', 'tele_agent')
    f['dialling_arm'] = p.get('dialling_arm', 'rule_based')
    f['prev_resp'] = STATE2RESP.get(states[-1], 'NONE') if n else 'NONE'
    agg = dict(n=n, rpc=rpc, ans=ans, tp=tp, wr=wr, so=so)
    return f, agg

def health_state(agg, masked_n):
    """Rule-based contact-point state (mirrors the notebook's phone_state heuristic)."""
    n, rpc, ans, tp, wr, so = agg['n'], agg['rpc'], agg['ans'], agg['tp'], agg['wr'], agg['so']
    if n == 0: return 'untested'
    if rpc > 0 and rpc / max(ans, 1) >= 0.4: return 'reachable'
    if wr >= 2 or (wr >= 1 and rpc == 0 and ans <= 1): return 'invalid'
    if tp >= 2 or (tp > rpc and tp >= 1): return 'third_party_recycled'
    if so / max(n, 1) >= 0.5: return 'switched_off_longterm'
    if ans > 0 and rpc == 0: return 'avoiding'
    return 'temporarily_unreachable' if ans == 0 else 'avoiding'

def decide(p_health, state, masked_n):
    """Next-best action + reason + compliance suppression."""
    suppress = state in ('third_party_recycled', 'invalid') or (masked_n or 1) >= 4
    if suppress:
        return ('suppress', 'Recycled / third-party / shared number — do NOT discuss the debt (RBI FPC). Route to compliance.', True)
    if state == 'reachable' or p_health >= 0.45:
        return ('continue', 'Valid & reachable — keep dialling this number at the best time slot (08–09h / 18h).', False)
    if state == 'avoiding':
        return ('switch_channel', 'Valid but the borrower is avoiding — switch channel (WhatsApp / field), do not keep redialling.', False)
    if state == 'switched_off_longterm':
        return ('retry_or_trace', 'Switched off long-term — retry with back-off, else move to another number or trace.', False)
    if state in ('temporarily_unreachable',):
        return ('retry', 'Temporarily unreachable — retry later with exponential back-off.', False)
    return ('trace', 'No reachable contact point — trigger a skip-trace (rank by expected value).', False)
