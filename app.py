from flask import Flask, request, jsonify, render_template
import pandas as pd
import numpy as np
import joblib
import os
import warnings
from sklearn.exceptions import InconsistentVersionWarning

warnings.filterwarnings("ignore", category=InconsistentVersionWarning)

app = Flask(__name__)

# ── 常數 ──────────────────────────────────────────────────────────
RISK_RULES = [
    {"id": 1, "name": "高壓薪資倒掛",  "desc": "加班且月收入低於中位數",
     "check": lambda r: r.get("OverTime") == "Yes" and r.get("MonthlyIncome", 9999) < 5000},
    {"id": 2, "name": "遠距加班族",    "desc": "離家 > 15 km 且加班",
     "check": lambda r: r.get("DistanceFromHome", 0) > 15 and r.get("OverTime") == "Yes"},
    {"id": 3, "name": "職涯停滯高危",  "desc": "超過 5 年未獲晉升",
     "check": lambda r: r.get("YearsSinceLastPromotion", 0) > 5},
    {"id": 4, "name": "單身遠距壓力",  "desc": "單身且離家 > 10 km",
     "check": lambda r: r.get("MaritalStatus") == "Single" and r.get("DistanceFromHome", 0) > 10},
    {"id": 5, "name": "環境滿意度極低","desc": "環境滿意度最低分",
     "check": lambda r: r.get("EnvironmentSatisfaction", 4) == 1},
    {"id": 6, "name": "關鍵適應期風險","desc": "新進員工",
     "check": lambda r: r.get("YearsAtCompany", 2) <= 1},
    {"id": 7, "name": "工作滿意度極低","desc": "工作滿意度最低分",
     "check": lambda r: r.get("JobSatisfaction", 4) == 1},
]

WHATIF_FIELDS = {
    "EnvironmentSatisfaction": {"label": "環境滿意度",    "min": 1, "max": 4, "step": 1},
    "JobSatisfaction":         {"label": "工作滿意度",    "min": 1, "max": 4, "step": 1},
    "WorkLifeBalance":         {"label": "工作生活平衡",  "min": 1, "max": 4, "step": 1},
    "StockOptionLevel":        {"label": "股票選擇權等級","min": 0, "max": 3, "step": 1},
    "MonthlyIncome":           {"label": "月收入",        "min": 1000, "max": 20000, "step": 500},
}

# 從訓練資料實際計算的各職級薪資中位數（避免 Relative_Income / Travel_ROI 基準漂移）
LEVEL_MEDIANS = {1: 2670, 2: 5340, 3: 9980, 4: 16154, 5: 19232}

FEATURE_ORDER = [
    "Age", "DailyRate", "DistanceFromHome", "HourlyRate", "MonthlyIncome",
    "MonthlyRate", "StockOptionLevel", "TotalWorkingYears", "IncomePerWorkingYear",
    "Distance_Overtime_Interaction", "Career_Maturity", "Career_Stagnation",
    "Manager_Loyalty", "Relative_Income", "Travel_ROI",
    "Tenure_Performance_Buffer", "Income_Burnout_Shock", "Edu_PCA2",
]

EDU_FIELD_COLS = [
    "EducationField_Human Resources", "EducationField_Life Sciences",
    "EducationField_Marketing", "EducationField_Medical",
    "EducationField_Other", "EducationField_Technical Degree",
]

XGB_MODEL_PATH = 'xgb_model.pkl'
PCA_MODEL_PATH = 'edu_pca_model.pkl'
RAW_DATA_PATH  = 'WA_Fn-UseC_-HR-Employee-Attrition.csv'
# useData.csv 不再使用

try:
    model = joblib.load(XGB_MODEL_PATH)
    pca   = joblib.load(PCA_MODEL_PATH)
    print("模型載入成功")
except Exception as e:
    print(f"模型載入失敗：{e}")
    model = pca = None

# ── 核心特徵工程 ──────────────────────────────────────────────────
# auto_predict 和 whatif 共用同一個函式，確保兩條路徑的特徵值完全一致，
# 不會因路徑不同而造成「未調整就飄移」的問題。
def build_features(raw: pd.Series, override_ot: str = None) -> pd.DataFrame:
    """
    從一列 WA_Fn raw row 建構 18 個模型特徵。
    override_ot: 'Yes'/'No'，覆蓋 OverTime 欄位（用於 What-If 停止加班情境）。
    HourlyRate 直接取 raw 欄位（獨立欄位，非 DailyRate/8）。
    """
    ot_str = override_ot if override_ot in ('Yes', 'No') else str(raw.get('OverTime', 'No'))
    ot  = 1 if ot_str == 'Yes' else 0
    ms  = 1 if str(raw.get('MaritalStatus', '')) == 'Single' else 0
    bt_map = {'Non-Travel': 0, 'Travel_Rarely': 1, 'Travel_Frequently': 2}
    bt  = bt_map.get(str(raw.get('BusinessTravel', 'Non-Travel')), 0)

    inc  = float(raw.get('MonthlyIncome',          0))
    dr   = float(raw.get('DailyRate',               0))
    hr   = float(raw.get('HourlyRate',              0))
    mr   = float(raw.get('MonthlyRate',             0))
    dist = float(raw.get('DistanceFromHome',        0))
    twy  = float(raw.get('TotalWorkingYears',       0))
    age  = float(raw.get('Age',                     30))
    ysp  = float(raw.get('YearsSinceLastPromotion', 0))
    yac  = float(raw.get('YearsAtCompany',          0))
    ymg  = float(raw.get('YearsWithCurrManager',    0))
    prf  = float(raw.get('PerformanceRating',       3))
    jl   = int(raw.get('JobLevel',                  1))
    env  = float(raw.get('EnvironmentSatisfaction', 3))
    job  = float(raw.get('JobSatisfaction',         3))
    wlb  = float(raw.get('WorkLifeBalance',         3))
    stk  = int(raw.get('StockOptionLevel',          0))
    ef   = str(raw.get('EducationField',            'Other'))

    # Edu_PCA2：pca 模型存在時才算，否則用 0（兩條路徑一致）
    if pca is not None:
        one_hot  = [1 if f"EducationField_{ef}" == c else 0 for c in EDU_FIELD_COLS]
        edu_pca2 = float(pca.transform([one_hot])[0, 1])
    else:
        edu_pca2 = 0.0

    bi = (12 - (env + job + wlb)) * (ot + 1)   # burnout_index
    ls = dist * ot * ms                          # life_stress_index
    ri = inc / LEVEL_MEDIANS.get(jl, 5000)      # relative_income

    row = {
        "Age":                           age,
        "DailyRate":                     dr,
        "DistanceFromHome":              dist,
        "HourlyRate":                    hr,
        "MonthlyIncome":                 inc,
        "MonthlyRate":                   mr,
        "StockOptionLevel":              stk,
        "TotalWorkingYears":             twy,
        "IncomePerWorkingYear":          inc / (twy + 1),
        "Distance_Overtime_Interaction": dist * ot,
        "Career_Maturity":               twy / (age - 18 + 1),
        "Career_Stagnation":             ysp / (yac + 1),
        "Manager_Loyalty":               ymg / (yac + 1),
        "Relative_Income":               ri,
        "Travel_ROI":                    ri / (bt + 1),
        "Tenure_Performance_Buffer":     yac * prf,
        "Income_Burnout_Shock":          np.log1p(inc) / (bi + ls + 1),
        "Edu_PCA2":                      edu_pca2,
    }
    return pd.DataFrame([row])[FEATURE_ORDER]


def assign_risk_rules(row_dict):
    matched = []
    for rule in RISK_RULES:
        try:
            if rule["check"](row_dict):
                matched.append({"id": rule["id"], "name": rule["name"], "desc": rule["desc"]})
        except Exception:
            pass
    return matched


# ── 原始資料快取（只讀一次）──────────────────────────────────────
_df_raw_cache = None

def get_raw_df():
    global _df_raw_cache
    if _df_raw_cache is None:
        _df_raw_cache = pd.read_csv(RAW_DATA_PATH).reset_index(drop=True)
    return _df_raw_cache


# ── Routes ────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard_20260305.html')

@app.route('/new')
def new():
    return render_template('p3.html')


@app.route('/pl3')
def pl3():
    return render_template('pl3.html')


@app.route('/auto_predict')
def auto_predict():
    if not os.path.exists(RAW_DATA_PATH):
        return jsonify({"status": "error", "message": f"找不到 {RAW_DATA_PATH}"}), 404
    if model is None:
        return jsonify({"status": "error", "message": "模型尚未載入"}), 500
    try:
        df_raw = get_raw_df().copy()

        # 全員特徵工程（與 whatif 路徑完全相同的 build_features，不再讀 useData.csv）
        features_list = [
            build_features(df_raw.iloc[i]).iloc[0].to_dict()
            for i in range(len(df_raw))
        ]
        X = pd.DataFrame(features_list)[FEATURE_ORDER]

        probs = model.predict_proba(X)[:, 1]
        df_raw['Attrition_Probability'] = [round(float(p) * 100, 2) for p in probs]
        df_raw['Original_Index'] = df_raw.index  # 排序前記錄，whatif 用此對齊

        def enrich(row):
            prob = row['Attrition_Probability']
            rd   = row.to_dict()
            table_advice  = []
            drawer_advice = []

            if prob >= 30:
                if rd.get('DistanceFromHome', 0) > 15 and rd.get('OverTime', '') == 'Yes':
                    table_advice.append({"text": "遠距通勤壓力", "type": "warning"})
                    drawer_advice.append("【遠距通勤壓力】員工住家距離較遠且頻繁加班，雙重損耗嚴重。")
                elif rd.get('OverTime', '') == 'Yes':
                    table_advice.append({"text": "工時過長", "type": "warning"})
                    drawer_advice.append("【工時負荷】近期加班頻率高，建議重新分配工作量。")
                if rd.get('MonthlyIncome', 0) < 5000 and rd.get('YearsSinceLastPromotion', 0) >= 3:
                    table_advice.append({"text": "薪酬停滯", "type": "warning"})
                    drawer_advice.append("【薪酬與職涯風險】薪資競爭力不足且長期未晉升。")
                if not table_advice:
                    table_advice.append({"text": "潛在風險", "type": "warning"})
                    drawer_advice.append("根據模型預測有流失風險，建議主管主動關懷。")
            else:
                table_advice.append({"text": "狀態穩定", "type": "success"})
                drawer_advice.append("目前各項指標正常。")

            return pd.Series({
                "Risk_Level":    "high" if prob >= 70 else ("medium" if prob >= 40 else "low"),
                "Table_Advice":  table_advice,
                "Drawer_Advice": drawer_advice,
                "Risk_Rules":    assign_risk_rules(rd),
            })

        enriched = df_raw.apply(enrich, axis=1)
        df_out   = pd.concat([df_raw, enriched], axis=1)
        df_out   = df_out.sort_values(by='Attrition_Probability', ascending=False)

        avg_rate   = round(float(probs.mean()) * 100, 2)
        counts     = df_out['Risk_Level'].value_counts().to_dict()
        risk_stats = {
            "high":   counts.get("high",   0),
            "medium": counts.get("medium", 0),
            "low":    counts.get("low",    0),
        }

        # 部門 × 職等 高風險率熱力圖（只含在職員工）
        heatmap_data = []
        if 'Department' in df_out.columns and 'JobLevel' in df_out.columns:
            active = df_out[df_out['Attrition'] != 'Yes'] \
                     if 'Attrition' in df_out.columns else df_out
            for dept in sorted(active['Department'].dropna().unique()):
                for lvl in sorted(active['JobLevel'].dropna().unique()):
                    grp      = active[(active['Department'] == dept) & (active['JobLevel'] == lvl)]
                    total    = len(grp)
                    if total == 0:
                        continue
                    high_cnt = int((grp['Risk_Level'] == 'high').sum())
                    heatmap_data.append({
                        "dept":     dept,
                        "level":    int(lvl),
                        "total":    total,
                        "high_cnt": high_cnt,
                        "rate":     round(high_cnt / total * 100, 1),
                    })
        dept_risk = []
        if 'Department' in df_out.columns:
            grp = df_out.groupby(['Department', 'Risk_Level']).size().unstack(fill_value=0)
            for dept, row in grp.iterrows():
                dept_risk.append({
                    "department": dept,
                    "high":   int(row.get("high",   0)),
                    "medium": int(row.get("medium", 0)),
                    "low":    int(row.get("low",    0)),
                })

        return jsonify({
            "status":             "success",
            "avg_attrition_rate": f"{avg_rate}%",
            "overall_suggestion": f"整體離職風險為 {avg_rate}%",
            "risk_stats":         risk_stats,
            "heatmap_data":       heatmap_data,
            "dept_risk": dept_risk,
            "table_data":         df_out.to_dict(orient='records'),
            "whatif_fields":      WHATIF_FIELDS,
        })
    except Exception as e:
        import traceback; print(traceback.format_exc())
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/whatif', methods=['POST'])
def whatif():
    if model is None:
        return jsonify({"error": "模型尚未載入"}), 500
    try:
        body         = request.get_json()
        original_idx = int(body.get("employee_index", 0))
        changes      = body.get("changes", {})

        df_raw = get_raw_df()

        # orig_prob：與 auto_predict 路徑完全相同，不會有基準飄移
        orig_prob = round(
            float(model.predict_proba(build_features(df_raw.iloc[original_idx]))[:, 1][0]) * 100, 2
        )

        # 套用滑桿變更
        raw_row = df_raw.iloc[original_idx].copy()

        # overtime_override：「停止加班」快捷鍵，字串欄位單獨處理
        override_ot = None
        if 'overtime_override' in changes:
            override_ot = changes.pop('overtime_override')

        for col, val in changes.items():
            raw_row[col] = float(val)

        new_prob = round(
            float(model.predict_proba(build_features(raw_row, override_ot=override_ot))[:, 1][0]) * 100, 2
        )

        return jsonify({
            "employee_index": original_idx,
            "original_prob":  orig_prob,
            "new_prob":       new_prob,
            "delta":          round(new_prob - orig_prob, 2),
        })
    except Exception as e:
        import traceback; print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route('/predict', methods=['POST'])
def predict():
    """
    供 pl3.html 個人輸入介面使用的預測端點。
    接收單筆員工資料，回傳離職風險機率與特徵值。
    對應原 FastAPI main.py 的 /predict 端點，特徵工程邏輯與 build_features() 對齊。
    """
    if model is None:
        return jsonify({"error": "模型尚未載入"}), 500
    try:
        d = request.get_json()

        # ── 解析輸入欄位（對應 main.py EmployeeInput schema）──────────────────
        age              = int(d.get('age', 30))
        marital_single   = bool(d.get('marital_single', False))
        education        = int(d.get('education', 3))
        education_field  = str(d.get('education_field', 'Other'))
        distance         = int(d.get('distance_from_home', 0))
        job_level        = int(d.get('job_level', 1))
        stock_level      = int(d.get('stock_option_level', 0))
        business_travel  = str(d.get('business_travel', 'Non-Travel'))
        env_sat          = int(d.get('env_satisfaction', 3))
        job_sat          = int(d.get('job_satisfaction', 3))
        wlb              = int(d.get('work_life_balance', 3))
        perf             = int(d.get('performance_rating', 3))
        total_years      = int(d.get('total_working_years', 0))
        overtime_str     = str(d.get('overtime', '否'))          # '否' / '有時' / '經常'
        years_company    = int(d.get('years_at_company', 0))
        since_promo      = int(d.get('years_since_promotion', 0))
        with_mgr         = int(d.get('years_with_curr_manager', 0))
        daily_rate       = float(d.get('daily_rate', 0))
        monthly_income   = float(d.get('monthly_income', 0))
        monthly_rate     = float(d.get('monthly_rate', 0))

        # ── 衍生變數 ──────────────────────────────────────────────────────────
        ot_val  = 1 if overtime_str in ('有時', '經常') else 0
        ms_val  = 1 if marital_single else 0
        bt_map  = {'Non-Travel': 0, 'Travel_Rarely': 1, 'Travel_Frequently': 2}
        bt_val  = bt_map.get(business_travel, 0)

        # Edu PCA2
        if pca is not None:
            one_hot  = [1 if f"EducationField_{education_field}" == c else 0 for c in EDU_FIELD_COLS]
            edu_pca2 = float(pca.transform([one_hot])[0, 1])
        else:
            edu_pca2 = 0.0

        burnout_index       = (12 - (env_sat + job_sat + wlb)) * (ot_val + 1)
        life_stress_index   = distance * ot_val * ms_val
        relative_income     = monthly_income / LEVEL_MEDIANS.get(job_level, 5000)
        travel_roi          = relative_income / (bt_val + 1)
        income_per_wy       = monthly_income / (total_years + 1)
        dist_ot             = distance * ot_val
        career_maturity     = total_years / (age - 18 + 1)
        career_stagnation   = since_promo / (years_company + 1)
        manager_loyalty     = with_mgr / (years_company + 1)
        tenure_perf_buf     = years_company * perf
        income_burnout_shock = np.log1p(monthly_income) / (burnout_index + life_stress_index + 1)
        # HourlyRate：pl3.html 傳入 daily_rate，按 main.py 邏輯 daily_rate/8
        hourly_rate         = daily_rate / 8

        row = {
            "Age":                           age,
            "DailyRate":                     daily_rate,
            "DistanceFromHome":              distance,
            "HourlyRate":                    hourly_rate,
            "MonthlyIncome":                 monthly_income,
            "MonthlyRate":                   monthly_rate,
            "StockOptionLevel":              stock_level,
            "TotalWorkingYears":             total_years,
            "IncomePerWorkingYear":          income_per_wy,
            "Distance_Overtime_Interaction": dist_ot,
            "Career_Maturity":               career_maturity,
            "Career_Stagnation":             career_stagnation,
            "Manager_Loyalty":               manager_loyalty,
            "Relative_Income":               relative_income,
            "Travel_ROI":                    travel_roi,
            "Tenure_Performance_Buffer":     tenure_perf_buf,
            "Income_Burnout_Shock":          income_burnout_shock,
            "Edu_PCA2":                      edu_pca2,
        }
        features_df = pd.DataFrame([row])[FEATURE_ORDER]
        prob = float(model.predict_proba(features_df)[:, 1][0])

        res_features = features_df.iloc[0].to_dict()
        res_features["Life_Stress_Index"] = life_stress_index

        return jsonify({
            "risk_percent": round(prob * 100, 2),
            "stay_percent": round(100 - prob * 100, 2),
            "is_high_risk": prob >= 0.3440,
            "threshold":    0.5352,
            "features":     res_features,
        })
    except Exception as e:
        import traceback; print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


# if __name__ == '__main__':
#     app.run(debug=True)

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=False)
