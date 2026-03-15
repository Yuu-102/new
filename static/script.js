// ── 全域變數 ─────────────────────────────────────────────────
let allEmployees  = [];
let whatifFields  = {};
let chart, middleLabel;

 //color
    var Green = '#23A094', Orange = '#FE6F50', Yellow = '#faad14', Brown = '#98282A';
    var Blue = '#90A8ED', Pink = '#FF90E8', Gray = '#D6D3D1', Gold = '#F1F333', DeepBlue = '#3B82F6';

// ── 圖表初始化 + 頁面載入 ────────────────────────────────────
am4core.ready(function () {
    chart = am4core.create("chartdiv", am4charts.PieChart);
    chart.startAngle = 180;
    chart.endAngle   = 360;
    chart.innerRadius = am4core.percent(50);

    middleLabel = chart.seriesContainer.createChild(am4core.Label);
    middleLabel.text = "--%";
    middleLabel.fontSize = 26;
    middleLabel.fontWeight = "700";
    middleLabel.horizontalCenter = "middle";
    middleLabel.verticalCenter   = "middle";
    middleLabel.dy = -20;

    const series = chart.series.push(new am4charts.PieSeries());
    series.dataFields.value    = "value";
    series.dataFields.category = "category";
    series.labels.template.disabled = true;
    series.ticks.template.disabled  = true;

    series.slices.template.adapter.add("fill", function (fill, target) {
        if (target.dataItem && target.dataItem.category === "預測離職率") {
            return am4core.color("#FE6F50");
        }
        return am4core.color("#23A094");
    });

    chart.data = [
        { category: "預測離職率", value: 0 },
        { category: "預計留任率", value: 100 }
    ];

    autoPredict();
});

// ── 自動預測 ──────────────────────────────────────────────────
function autoPredict() {
    fetch('/auto_predict')
        .then(r => r.json())
        .then(data => {
            if (data.status !== 'success') {
                document.getElementById('overallSuggestion').innerText = '載入失敗：' + (data.message || '');
                return;
            }
            allEmployees = data.table_data || [];
            whatifFields = data.whatif_fields || {};

            const avgNum = parseFloat((data.avg_attrition_rate || "0").replace('%', '')) || 0;
            document.getElementById('overallSuggestion').innerText = data.overall_suggestion || '';
            //document.getElementById('result-area').innerText = '平均離職率：' + data.avg_attrition_rate;

            updateGaugeChart(avgNum);
            populateDeptFilter(allEmployees);
            renderTable(allEmployees);
            renderDeptRiskChart(data.dept_risk || []);
        })
        .catch(err => {
            console.error(err);
            document.getElementById('overallSuggestion').innerText = '無法連線至伺服器';
        });
}

function updateGaugeChart(rate) {
    if (!chart) return;
    chart.data = [
        { category: "預測離職率", value: rate },
        { category: "預計留任率", value: 100 - rate }
    ];
    if (middleLabel) middleLabel.text = rate.toFixed(1) + "%";
}

// ── 部門篩選器填充 ────────────────────────────────────────────
function populateDeptFilter(data) {
    const sel = document.getElementById('deptFilter');
    const depts = [...new Set(data.map(r => r.Department).filter(Boolean))].sort();
    depts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d; opt.text = d;
        sel.appendChild(opt);
    });
}

   
// ── 風險標籤 HTML ─────────────────────────────────────────────
function riskBadge(level) {
    const map = {
        high:   ['高風險', 'cpill h'],
        medium: ['中風險', 'cpill m'],
        low:    ['低風險', 'cpill l'],
    };
    const [label, color] = map[level] || ['未知', '#666'];
    return `<span class="${color}">${label}</span>`;
}
// ── 離職標籤 HTML ─────────────────────────────────────────────
function leaveBadge(leave) {
    const map = {
        Yes:   ['已離職', Gray],
        No:    ['在職', Gold],
    };
    const [label, color] = map[leave] || ['未知', '#666'];
    return `<span style="background:${color};color:#555;border-radius:20px;
                padding:2px 10px;font-size:12px;font-weight:600;">${label}</span>`;
}

// ── 渲染表格 ──────────────────────────────────────────────────
function renderTable(data) {
    const tbody = document.getElementById('tableBody');
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="placeholder">無資料</td></tr>';
        return;
    }
    tbody.innerHTML = '';
    data.forEach((emp, i) => {
        const prob  = emp.Attrition_Probability || 0;
        const level = emp.Risk_Level || 'low';
        const empNo = emp.EmployeeNumber || i;
 
        const adviceHtml = (emp.Table_Advice || []).map(a =>
    `<span class="advice-tag ${a.type === 'success' ? 'btn-stable' : 'btn-risk'}">${a.text}</span>`
).join(' '); // 這裡只會顯示如「薪酬落差」、「工時負荷」等標籤
      
 
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.setAttribute('data-risk',  level);
        tr.setAttribute('data-dept',  (emp.Department || '').toLowerCase());
        tr.setAttribute('data-leave', (emp.Attrition  || '').toLowerCase());
        tr.setAttribute('data-lvl',   String(emp.JobLevel != null ? emp.JobLevel : ''));
        tr.setAttribute('data-search',
            `${empNo} ${emp.Department || ''} ${emp.JobRole || ''}`.toLowerCase());
        // 快速篩選 chip 用的布林 data 屬性
        tr.setAttribute('data-ot',   emp.OverTime === 'Yes' ? '1' : '0');
        tr.setAttribute('data-new',  (emp.YearsAtCompany != null && emp.YearsAtCompany <= 1) ? '1' : '0');
        tr.setAttribute('data-dist', (emp.DistanceFromHome != null && emp.DistanceFromHome > 15) ? '1' : '0');
        // 滿意度低：三項任一 <= 1，或平均 <= 2
        const _sat = [emp.EnvironmentSatisfaction, emp.JobSatisfaction, emp.WorkLifeBalance]
                        .filter(v => v != null);
        const _satLow = _sat.some(v => v <= 1) || (_sat.length && (_sat.reduce((a,b)=>a+b,0)/_sat.length) <= 2);
        tr.setAttribute('data-sat', _satLow ? '1' : '0');
 
        tr.innerHTML = `
            <td>${empNo}</td>
             <td>
                <strong>${prob}%</strong>
                <div class="prob-bar-wrap">
                    <div class="prob-bar bar-${level}" style="width:${prob}%"></div>
                </div>
            </td>
            <td>${riskBadge(level)}</td>
            <td>${emp.Department || '-'}</br><span class='text-secondary'>${emp.JobRole || '-'}</span></td>
            <td>${emp.JobLevel || '-'}</td>
            <td>${emp.Age || '-'}</td>
            <td>${emp.YearsAtCompany != null ? emp.YearsAtCompany + ' 年' : '-'}</td>    
            <td class='d-none'>${emp.MonthlyIncome != null ? '$' + Number(emp.MonthlyIncome).toLocaleString() : '-'}</td>
            <td>${emp.OverTime === 'Yes' ? '<span class="text-danger">Yes</span>' : '<span class="text-success">No</class>'}</td>
            <td class='d-none'>${emp.MaritalStatus || '-'}</td>
            <td class='d-none'>${emp.DistanceFromHome != null ? emp.DistanceFromHome + ' km' : '-'}</td>
           
            <td style="text-align:left">${adviceHtml}</td>
        `;
        tr.addEventListener('click', () => openDrawer(emp));
        tbody.appendChild(tr);
    });
    // 渲染完成後立即更新人數統計
    filterTable();
}
 
// ── 部門風險堆疊長條圖 ────────────────────────────────────
let deptChart = null;

function renderDeptRiskChart(deptData) {
    if (!deptData || deptData.length === 0) return;

    // 若已建立則先 dispose
    if (deptChart) { deptChart.dispose(); deptChart = null; }

    deptChart = am4core.create("deptRiskChart", am4charts.XYChart);
    deptChart.colors.step = 2;

    // X 軸 — 部門名稱
    const xAxis = deptChart.xAxes.push(new am4charts.CategoryAxis());
    xAxis.dataFields.category = "department";
    xAxis.renderer.minGridDistance = 20;
    xAxis.renderer.labels.template.fontSize = 13;

    // Y 軸 — 人數
    const yAxis = deptChart.yAxes.push(new am4charts.ValueAxis());
    yAxis.title.text = "人數";
    yAxis.title.fontSize = 12;
    yAxis.min = 0;
    yAxis.strictMinMax = true;
    yAxis.calculateTotals = true;

     // 建立堆疊系列
    function makeSeries(field, label, color) {
        const series = deptChart.series.push(new am4charts.ColumnSeries());
        series.name = label;
        series.dataFields.valueY = field;
        series.dataFields.valueYShow = "totalPercent";
        series.dataFields.categoryX = "department";
        series.stacked = true;
        series.columns.template.fill = am4core.color(color);
        series.columns.template.stroke = am4core.color(color);
        series.columns.template.width = am4core.percent(60);
        // valueYTotalPercent 需透過 adapter 從 dataItem 取得才有值
        series.columns.template.tooltipText = "{name}: {valueY} 人";
        series.columns.template.adapter.add("tooltipText", function(text, target) {
            const di = target.dataItem;
            if (di && di.values && di.values.valueY) {
                const pct = di.values.valueY.totalPercent;
                return "{name}: {valueY} 人 (" + (pct ? pct.toFixed(1) : "0") + "%)";
            }
            return text;
        });
 
        // 顯示數值 label
        const label2 = series.bullets.push(new am4charts.LabelBullet());
        label2.label.text = "{valueY}";
        label2.label.fill = am4core.color("#fff");
        label2.label.fontSize = 12;
        label2.label.fontWeight = "600";
        label2.label.truncate = false;
        label2.label.hideOversized = true;
        label2.locationY = 0.5;
        return series;
    }
 
    makeSeries("low",    "低風險", "#23A094");
    makeSeries("medium", "中風險", "#faad14");
    makeSeries("high",   "高風險", "#FE6F50");
 
    // 圖例
    deptChart.legend = new am4charts.Legend();
    deptChart.legend.position = "top";
    deptChart.legend.fontSize = 12;
 
    const deptNameMap = {
        "Human Resources":       "人力資源",
        "Research & Development": "研發部",
        "Sales":                 "業務部",
    };
    deptChart.data = deptData.map(d => ({
        ...d,
        department: deptNameMap[d.department] || d.department
    }));
}
 // ── 部門 × 職等 高風險率熱力圖（純 HTML table）────────────
function renderHeatmap(data) {
    const container = document.getElementById('deptRiskChart2');
    if (!container) return;
    if (!data || data.length === 0) {
        container.innerHTML = '<div style="color:#aaa;font-size:13px;padding:24px;text-align:center;">無熱力圖資料</div>';
        return;
    }
 
    // 收集所有部門 / 職等
    const depts  = [...new Set(data.map(d => d.dept))].sort();
    const levels = [...new Set(data.map(d => d.level))].sort((a, b) => a - b);
 
    // rate → color（6 stop 漸層：綠→黃→橘→紅）
    function rateColor(rate) {
        const stops = [
            [0,   [236,253,243]],
            [10,  [187,247,208]],
            [25,  [252,211, 77]],
            [40,  [251,146, 60]],
            [60,  [239, 68, 68]],
            [100, [185, 28, 28]],
        ];
        let lo = stops[0], hi = stops[stops.length-1];
        for (let i = 0; i < stops.length - 1; i++) {
            if (rate >= stops[i][0] && rate <= stops[i+1][0]) {
                lo = stops[i]; hi = stops[i+1]; break;
            }
        }
        const t = lo[0] === hi[0] ? 0 : (rate - lo[0]) / (hi[0] - lo[0]);
        const r = Math.round(lo[1][0] + t * (hi[1][0] - lo[1][0]));
        const g = Math.round(lo[1][1] + t * (hi[1][1] - lo[1][1]));
        const b = Math.round(lo[1][2] + t * (hi[1][2] - lo[1][2]));
        const lum = 0.299*r + 0.587*g + 0.114*b;
        return { bg: `rgb(${r},${g},${b})`, text: lum > 150 ? '#1a1a1a' : '#fff' };
    }
 
    // rateMap 查詢
    const rateMap = {};
    data.forEach(d => { rateMap[`${d.dept}__${d.level}`] = d; });
 
    // 部門縮寫
    const deptAbbr = { 'Human Resources': 'HR', 'Research & Development': 'R&D', 'Sales': 'Sales' };
 
    // 表格 HTML
    let html = `
    <div style="overflow-x:auto;padding:4px 2px;">
    <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:8px;letter-spacing:.04em;">
        部門 × 職等　高風險率熱力圖（在職員工）
    </div>
    <table style="border-collapse:separate;border-spacing:4px;width:100%;">
        <thead>
            <tr>
                <th style="font-size:11px;color:#888;font-weight:600;text-align:left;padding:4px 8px;white-space:nowrap;">部門</th>
                ${levels.map(l => `<th style="font-size:11px;color:#888;font-weight:600;text-align:center;padding:4px 6px;">Lv${l}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            ${depts.map(dept => `
            <tr>
                <td style="font-size:12px;font-weight:700;color:#333;padding:4px 8px;white-space:nowrap;">
                    ${deptAbbr[dept] || dept}
                </td>
                ${levels.map(lvl => {
                    const d = rateMap[`${dept}__${lvl}`];
                    if (!d) return `<td style="background:#f5f5f5;border-radius:6px;text-align:center;padding:8px 4px;">
                        <span style="color:#ccc;font-size:11px;">—</span></td>`;
                    const c = rateColor(d.rate);
                    return `<td style="background:${c.bg};border-radius:6px;text-align:center;
                                padding:10px 4px;cursor:default;transition:transform .15s;min-width:58px;"
                             onmouseover="this.style.transform='scale(1.08)'"
                             onmouseout="this.style.transform='scale(1)'"
                             title="${dept} Lv${lvl}：${d.high_cnt}/${d.total} 人為高風險">
                        <div style="font-size:16px;font-weight:800;color:${c.text};line-height:1.1;">${d.rate}%</div>
                        <div style="font-size:10px;color:${c.text};opacity:.75;margin-top:2px;">${d.high_cnt}/${d.total}</div>
                    </td>`;
                }).join('')}
            </tr>`).join('')}
        </tbody>
    </table>
 
    <!-- 圖例 -->
    <div style="display:flex;align-items:center;gap:6px;margin-top:10px;">
        <span style="font-size:11px;color:#888;">低風險</span>
        <div style="flex:1;height:8px;border-radius:4px;
            background:linear-gradient(to right,#ECFDF3,#BBF7D0,#FCD34D,#FB923C,#EF4444,#B91C1C);"></div>
        <span style="font-size:11px;color:#888;">高風險</span>
    </div>
    </div>`;
 
    container.innerHTML = html;
    container.style.height = 'auto';
    container.style.minHeight = '0';
}

// ── 搜尋 & 篩選 ───────────────────────────────────────────────
function filterTable() {
    const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
    const risk   = document.getElementById('riskFilter')?.value  || 'all';
    const dept   = (document.getElementById('deptFilter')?.value || 'all').toLowerCase();
    const leave  = document.getElementById('leaveFilter')?.value || 'all';
    const lvl    = document.getElementById('lvlFilter')?.value   || 'all';
 
    // chip 勾選篩選（勾選 = 必須符合該條件；可多選，取交集）
    const chkOt   = document.getElementById('chk_ot')?.checked   || false;
    const chkNew  = document.getElementById('chk_new')?.checked  || false;
    const chkDist = document.getElementById('chk_dist')?.checked || false;
    const chkSat  = document.getElementById('chk_sat')?.checked  || false;
 
    let total = 0, cntHigh = 0, cntMedium = 0, cntLow = 0;
 
    document.querySelectorAll('#tableBody tr').forEach(row => {
        const matchSearch = (row.getAttribute('data-search') || '').includes(search);
        const matchRisk   = risk  === 'all' || (row.getAttribute('data-risk')  || '') === risk;
        const matchDept   = dept  === 'all' || (row.getAttribute('data-dept')  || '') === dept;
        const matchLeave  = leave === 'all' || (row.getAttribute('data-leave') || '') === leave;
        const matchLvl    = lvl   === 'all' || (row.getAttribute('data-lvl')   || '') === lvl;
        // chip 篩選：只有勾選時才限制（多選取交集）
        const matchOt   = !chkOt   || row.getAttribute('data-ot')   === '1';
        const matchNew  = !chkNew  || row.getAttribute('data-new')  === '1';
        const matchDist = !chkDist || row.getAttribute('data-dist') === '1';
        const matchSat  = !chkSat  || row.getAttribute('data-sat')  === '1';
        const visible = matchSearch && matchRisk && matchDept && matchLeave && matchLvl
                     && matchOt && matchNew && matchDist && matchSat;
        row.style.display = visible ? '' : 'none';
 
        if (visible) {
            total++;
            const r = row.getAttribute('data-risk') || '';
            if (r === 'high')   cntHigh++;
            else if (r === 'medium') cntMedium++;
            else                cntLow++;
        }
    });
 
    // 更新人數顯示
    const el = (id) => document.getElementById(id);
    if (el('filter-count-total'))  el('filter-count-total').innerText  = total;
    if (el('filter-count-high'))   el('filter-count-high').innerText   = cntHigh;
    if (el('filter-count-medium')) el('filter-count-medium').innerText = cntMedium;
    if (el('filter-count-low'))    el('filter-count-low').innerText    = cntLow;
}

// ── 抽屜開關 ─────────────────────────────────────────────────
function openDrawer(emp) {
    document.getElementById('drawer-content').innerHTML = buildDrawerHTML(emp);
    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawer-overlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
    // 綁定 What-If 滑桿
    bindWhatifSliders(emp);
}

function closeDrawer() {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawer-overlay').style.display = 'none';
    document.body.style.overflow = '';
}
// ── 個人資訊卡 HTML ───────────────────────────────────────────
function buildDrawerHTML(emp) {
    const prob  = emp.Attrition_Probability || 0;
    const level = emp.Risk_Level || 'low';
    const leave = emp.Attrition || 'yes';
    const empNo = emp.EmployeeNumber || '-';
    const rules = emp.Risk_Rules || [];
    const adviceList = Array.isArray(emp.Drawer_Advice) ? emp.Drawer_Advice : [emp.Drawer_Advice];
    const adviceItems = adviceList.map(item => `<li>${item}</li>`).join('');
    // 滿意度星星
    const stars = n => n ? '★'.repeat(n) + '☆'.repeat(4 - n) : '-';
     console.log(leave)

    // What-If 滑桿
    const slidersHTML = Object.entries(whatifFields).map(([key, cfg]) => {
        const cur = emp[key] != null ? emp[key] : cfg.min;
        return `
        <div class="whatif-row">
            <label>${cfg.label}</label>
            <input type="range" id="wi_${key}" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}"
                   value="${cur}" oninput="updateSliderBadge('${key}', this.value)">
            <span class="val-badge" id="wib_${key}">${cur}</span>
        </div>`;
    }).join('');

    return `
    <div style="margin-bottom:6px;">
        <div style="font-size:22px;font-weight:800;color:#222;">員工 #${empNo}</div>
        <div style="color:#888;font-size:13px;">${emp.JobRole || ''} ｜ ${emp.Department || ''}</div>
    </div>

    <!-- 風險機率 -->
    <div class="drawer-section">
        <h4>離職風險</h4>
        <div style="display:flex;align-items:center;gap:14px;">
            <div style="font-size:36px;font-weight:800;color:${level==='high'?Orange:level==='medium'?Yellow:Green}">
                ${prob}%
            </div>
            ${riskBadge(level)} ${leaveBadge(leave)}
        </div>
        <div class="prob-bar-wrap" style="margin-top:10px;">
            <div class="prob-bar bar-${level}" style="width:${prob}%"></div>
        </div>
    </div>

    <!-- 命中風險規則 -->
    <div class="drawer-section">
        <h4>命中風險規則</h4>
        ${emp.Risk_Rules.map(r => `<span class="rule-tag ${r.level==='high'?'rule-high':''}">${r.name}</span>`).join('')}
    </div>

    <!-- 基本資訊 -->
    <div class="drawer-section">
        <h4>員工基本資訊</h4>
        <div class="info-grid">
            <div class="info-item"><div class="label">年齡</div><div class="value">${emp.Age || '-'} 歲</div></div>
            <div class="info-item"><div class="label">年資</div><div class="value">${emp.YearsAtCompany != null ? emp.YearsAtCompany + ' 年' : '-'}</div></div>
            <div class="info-item"><div class="label">月收入</div><div class="value">${emp.MonthlyIncome != null ? '$' + Number(emp.MonthlyIncome).toLocaleString() : '-'}</div></div>
            <div class="info-item"><div class="label">加班</div><div class="value">${emp.OverTime === 'Yes' ? '⚡ 是' : '✔ 否'}</div></div>
            <div class="info-item"><div class="label">婚姻狀態</div><div class="value">${emp.MaritalStatus || '-'}</div></div>
            <div class="info-item"><div class="label">離家距離</div><div class="value">${emp.DistanceFromHome != null ? emp.DistanceFromHome + ' km' : '-'}</div></div>
        </div>
    </div>

    <!-- 滿意度 -->
    <div class="drawer-section">
        <h4>滿意度指標</h4>
        <div class="info-grid">
            <div class="info-item"><div class="label">環境滿意度</div><div class="value" style="color:#f39c12">${stars(emp.EnvironmentSatisfaction)}</div></div>
            <div class="info-item"><div class="label">工作滿意度</div><div class="value" style="color:#f39c12">${stars(emp.JobSatisfaction)}</div></div>
            <div class="info-item"><div class="label">工作生活平衡</div><div class="value" style="color:#f39c12">${stars(emp.WorkLifeBalance)}</div></div>
            <div class="info-item"><div class="label">距上次晉升</div><div class="value">${emp.YearsSinceLastPromotion != null ? emp.YearsSinceLastPromotion + ' 年' : '-'}</div></div>
        </div>
    </div>
    <div class="drawer-section">
        <h4><i class="bi bi-lightbulb-fill text-warning"></i> AI 深度分析建議</h4>
        <div class="alert alert-light" style=" border: 1px solid #aaa;border-left: 4px solid #111;border-radius: 0 8px 8px 0;">
            <ul style="margin-bottom: 0; padding-left: 20px;">
                ${adviceItems}
            </ul>
        </div>
    </div>

    <!-- What-If 模擬 -->
    <div class="drawer-section">
        <h4>🔬 What-If 介入模擬</h4>
        <div style="font-size:12px;color:#666;margin-bottom:12px;">調整指標後點擊「試算」，查看預期風險變化</div>

        <!-- 快捷情境按鈕 -->
        <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px;">
            ${emp.OverTime === 'Yes' ? `
            <button class="wi-preset-btn" onclick="applyNoOvertime()">
                <i class="bi bi-moon-stars-fill"></i> 停止加班試算
            </button>` : ''}
            <button class="wi-preset-btn wi-reset-btn" onclick="resetSliders()">
                <i class="bi bi-arrow-counterclockwise"></i> 還原初始值
            </button>
        </div>

        ${slidersHTML}
        <button onclick="runWhatif(${emp.Original_Index != null ? emp.Original_Index : 0})"
            style="background: #212529; color: #fff; border: none; border-radius: 4px; padding: 9px 20px;
        font-size: 14px; font-weight: 600; cursor: pointer;margin-top: 6px; width: 100%;">
            試算介入效果
        </button>
        <div id="whatif-result"></div>
    </div>

    
    `;
}

// ── 滑桿數值即時更新 ──────────────────────────────────────────
function updateSliderBadge(key, val) {
    const badge  = document.getElementById('wib_' + key);
    const slider = document.getElementById('wi_' + key);
    if (badge)  badge.innerText = val;
    if (slider) {
        const cfg = whatifFields[key];
        const pct = ((parseFloat(val) - cfg.min) / (cfg.max - cfg.min)) * 100;
        slider.style.setProperty('--val', pct.toFixed(1) + '%');
    }
}

// ── 快取員工原始值供「還原」使用 ─────────────────────────────
let _empDefaults  = {};   // { key: originalValue }
let _empIndex     = null; // Original_Index
let _empOverTime  = 'No'; // 原始 OverTime 狀態

// ── 綁定滑桿初始值 ────────────────────────────────────────────
function bindWhatifSliders(emp) {
    _empDefaults = {};
    _empIndex    = emp.Original_Index ?? null;
    _empOverTime = emp.OverTime || 'No';
    Object.keys(whatifFields).forEach(key => {
        const slider = document.getElementById('wi_' + key);
        const val    = emp[key] != null ? emp[key] : whatifFields[key].min;
        _empDefaults[key] = val;
        if (slider) {
            slider.value = val;
            updateSliderBadge(key, val);
        }
    });
}

// ── 還原所有滑桿至員工原始值 ─────────────────────────────────
function resetSliders() {
    Object.keys(whatifFields).forEach(key => {
        const slider = document.getElementById('wi_' + key);
        const orig   = _empDefaults[key];
        if (slider && orig != null) {
            slider.value = orig;
            updateSliderBadge(key, orig);
        }
    });
    const res = document.getElementById('whatif-result');
    if (res) { res.style.display = 'none'; res.className = ''; res.innerHTML = ''; }
}

// ── 「停止加班」情境試算 ──────────────────────────────────────
function applyNoOvertime() {
    if (_empIndex === null) return;
    const changes = { overtime_override: 'No' };
    Object.keys(whatifFields).forEach(key => {
        const el = document.getElementById('wi_' + key);
        if (el) changes[key] = parseFloat(el.value);
    });
    _runWhatifWithChanges(_empIndex, changes, '停止加班情境');
}

// ── What-If API 呼叫 ─────────────────────────────────────────
function runWhatif(rowIndex) {
    const changes = {};
    Object.keys(whatifFields).forEach(key => {
        const el = document.getElementById('wi_' + key);
        if (el) changes[key] = parseFloat(el.value);
    });
    _runWhatifWithChanges(rowIndex, changes, null);
}

function _runWhatifWithChanges(rowIndex, changes, label) {
    const el = document.getElementById('whatif-result');
    el.style.display = 'block'; el.className = 'neutral';
    el.innerHTML = '<i class="bi bi-hourglass-split"></i> 試算中…';

    fetch('/whatif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_index: rowIndex, changes })
    })
    .then(r => r.json())
    .then(res => {
        if (res.error) {
            el.className = 'negative';
            el.innerHTML = '⚠️ 試算失敗：' + res.error;
            return;
        }
        const delta      = res.delta;
        const noChange   = Math.abs(delta) <= 0.05;
        const arrow      = delta < -0.05 ? '↓' : delta > 0.05 ? '↑' : '→';
        const cls        = delta < -1 ? 'positive' : delta > 1 ? 'negative' : 'neutral';
        const clr        = delta < 0 ? '#027A48' : delta > 0 ? '#B42318' : '#475467';
        const tag        = label ? ` <span style="font-size:11px;opacity:.6;">(${label})</span>` : '';
        el.className = cls;
        el.innerHTML = `
            <strong>介入效果預測${tag}</strong>
            <div style="display:flex;gap:16px;align-items:center;margin:8px 0;">
                <div>
                    <div style="font-size:10px;color:#888;">調整前</div>
                    <div style="font-size:22px;font-weight:800;">${res.original_prob}%</div>
                </div>
                <div style="font-size:20px;color:#aaa;">${arrow}</div>
                <div>
                    <div style="font-size:10px;color:#888;">調整後</div>
                    <div style="font-size:22px;font-weight:800;color:${clr};">${res.new_prob}%</div>
                </div>
                <div style="margin-left:auto;text-align:right;">
                    <div style="font-size:10px;color:#888;">變化幅度</div>
                    <div style="font-size:16px;font-weight:700;color:${clr};">
                        ${noChange ? '—' : (delta > 0 ? '+' : '') + delta + '%'}
                    </div>
                </div>
            </div>
            <div style="font-size:11.5px;color:#666;">
                ${noChange
                    ? '此情境下風險無顯著變化，建議搭配其他措施。'
                    : Math.abs(delta) >= 5
                        ? `介入效果顯著，離職風險預期從 ${res.original_prob}% ${delta < 0 ? '降至' : '升至'} ${res.new_prob}%。`
                        : '有輕微改善，建議配合其他留才措施以強化效果。'
                }
            </div>
        `;
    })
    .catch(err => {
        el.className = 'negative';
        el.innerHTML = '連線失敗：' + err.message;
    });
}