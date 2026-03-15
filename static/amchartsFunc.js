
var Green='#23A094'
var Orange='#FE6F50'
var Yellow='#FFC900'
var Brown='#98282A'
var Blue='#90A8ED'
var Pink='#FF90E8' 
var Gray='#D6D3D1'
var Gold='#F1F333'

/*DonutChart Begin*/
function createPieChart(divId, data, valueField, categoryField, colors) {
var chart = am4core.create(divId, am4charts.PieChart);
 chart.data = data;

// Add and configure Series
var pieSeries = chart.series.push(new am4charts.PieSeries());
pieSeries.dataFields.value = valueField;
pieSeries.dataFields.category = categoryField;
if(colors) {
        pieSeries.colors.list = colors.map(c => am4core.color(c));
}
pieSeries.slices.template.stroke = am4core.color("#fff");
pieSeries.slices.template.strokeOpacity = 1;

// This creates initial animation
pieSeries.hiddenState.properties.opacity = 1;
pieSeries.hiddenState.properties.endAngle = -90;
pieSeries.hiddenState.properties.startAngle = -90;

chart.hiddenState.properties.radius = am4core.percent(0);
}

/*DonutChart Begin*/
function createDonutChart(chartType, divId, data, valueField, categoryField, colors) {
    var chart = am4core.create(divId, am4charts.PieChart);
    chart.data = data;
    if(chartType[0]=="Donut"){
      chart.innerRadius = am4core.percent(50);//空心
    }
    
    var pieSeries = chart.series.push(new am4charts.PieSeries());
    pieSeries.dataFields.value = valueField;       // 改為參數化
    pieSeries.dataFields.category = categoryField; // 改為參數化
    
    // 設定顏色清單
    if(colors) {
        pieSeries.colors.list = colors.map(c => am4core.color(c));
    }

     if(chartType[0]=="Donut"){
        // --- 在中間加入 Label ---
        var label = chart.seriesContainer.createChild(am4core.Label);
        // 計算百分比 (假設你的資料 category 有一個叫 "離職")
        chart.events.on("datavalidated", function() {
            var total = 0;
            var overtimeValue = 0;
            
            chart.data.forEach(function(item) {
                total += item[valueField];
                if (item[categoryField] === chartType[1]) { // 這裡判斷離職的關鍵字
                    overtimeValue = item[valueField];
                    console.log('加班',overtimeValue);
                }
            });
            console.log("後"+total ,overtimeValue);
            var percent = ((overtimeValue / total) * 100).toFixed(1); // 取小數點一位
            
            // 設定文字內容與樣式
            label.text = "[font-size: 14px; opacity: 0.7]"+chartType[2]+"[/]\n[bold font-size: 30px; fill:#000]" + percent + "%[/]";
            label.horizontalCenter = "middle";
            label.verticalCenter = "middle";
            label.textAlign = "middle";
        });
        // ----------------------
    }

    pieSeries.slices.template.stroke = am4core.color("#000");
    pieSeries.slices.template.strokeWidth = 1;
    pieSeries.slices.template.strokeOpacity = 1;

    pieSeries.labels.template.disabled = true;
    pieSeries.ticks.template.disabled = true;
    pieSeries.slices.template.tooltipText = "{category}: {value}";

        // This creates initial animation
    pieSeries.hiddenState.properties.opacity = 1;
    pieSeries.hiddenState.properties.endAngle = -90;
    pieSeries.hiddenState.properties.startAngle = -90;

    // chart.legend = new am4charts.Legend();
    // chart.legend.position = "right";
}
/*DonutChart END*/


/*XYChart Begin*/
function createXYChart(divId,myData, mySeriesConfig){
    var chart = am4core.create(divId, am4charts.XYChart)
    chart.colors.step = 2;
 
    chart.legend = new am4charts.Legend()
    chart.legend.position = 'bottom'
    chart.legend.paddingBottom = 20
    chart.legend.labels.template.maxWidth = 95

    chart.data = myData

    var xAxis = chart.xAxes.push(new am4charts.CategoryAxis())
    xAxis.dataFields.category = 'category'
    xAxis.renderer.cellStartLocation = 0.1
    xAxis.renderer.cellEndLocation = 0.9
    xAxis.renderer.grid.template.location = 0;
    xAxis.cursorTooltipEnabled = false;

    var yAxis = chart.yAxes.push(new am4charts.ValueAxis());
    yAxis.min = 0;
    yAxis.cursorTooltipEnabled = false;

    // --- 關鍵 1：Cursor 設定 ---
    chart.cursor = new am4charts.XYCursor();
    chart.cursor.behavior = "none";
    chart.cursor.lineY.disabled = true;
    
    // 設定 Tooltip 在同一垂直位置顯示時，會自動排列（不重疊）
    chart.cursor.maxTooltipDistance = -1;

  // --- 關鍵模組化路段：使用迴圈產生所有 Series ---
    mySeriesConfig.forEach(function(config) {
        createColumnSeries(chart, xAxis, config.field, config.name, config.color);
    });

   // 在 createXYChart 函數最後面 (所有 Series 建立完之後)
var infoSeries = chart.series.push(new am4charts.ColumnSeries());
infoSeries.dataFields.valueY = mySeriesConfig[0].field; // 這裡改用數值欄位
infoSeries.dataFields.categoryX = "category";

// 關鍵修正：給予一個隱形的 tooltipHTML 觸發器
infoSeries.tooltipHTML = " "; 

// 關鍵修正：將 opacity 設為極小值 (0.0001) 而非 0，有助於觸發事件
infoSeries.columns.template.fillOpacity = 0.0001;
infoSeries.columns.template.strokeOpacity = 0;

// 讓這個隱形柱子撐滿整個繪圖區，滑鼠移到該區間就觸發
infoSeries.columns.template.width = am4core.percent(100);


infoSeries.tooltip.fixedLayout = true; // 啟用固定佈局
infoSeries.tooltip.y = 0; // 固定在 Y 軸的最頂端
infoSeries.tooltip.x = -10

// 強制黑框樣式
infoSeries.tooltip.getFillFromObject = false;
infoSeries.tooltip.background.cornerRadius = 8; // 圓角
infoSeries.tooltip.background.strokeOpacity = 0.5;
infoSeries.tooltip.background.fill = am4core.color("#000000e1");
infoSeries.tooltip.background.fillOpacity = 0.9;
infoSeries.tooltip.pointerOrientation = "vertical"; // 讓它跟隨滑鼠 "down"; // 箭頭朝下


infoSeries.adapter.add("tooltipHTML", function(text, target) {
    // 關鍵修正：改從 target.tooltipDataItem 抓取，這更準確
    var dataContext = target.tooltipDataItem ? target.tooltipDataItem.dataContext : null;
    
    if (dataContext) {
        var d = dataContext;
        // console.log("Current Data:", d); // <-- 取消註解這行來檢查 F12

        var total = (Number(d.lv1) || 0) + (Number(d.lv2) || 0) + (Number(d.lv3) || 0) + (Number(d.lv4) || 0) + (Number(d.lv5) || 0);
        
        var h = `<div style='text-align:center; border-bottom:1px solid #fff; margin-bottom:5px; font-weight:bold; padding:5px;'>年齡層: ${d.category}</div>`;
        h += `<table style='margin:5px; color:#fff; font-size:13px; min-width:150px;'>`;
        h += `<tr><td>Lv1:</td><td style='text-align:right; font-weight:bold; padding-left:15px;'>${d.lv1 || 0}</td></tr>`;
        h += `<tr><td>Lv2:</td><td style='text-align:right; font-weight:bold; padding-left:15px;'>${d.lv2 || 0}</td></tr>`;
        h += `<tr><td>Lv3:</td><td style='text-align:right; font-weight:bold; padding-left:15px;'>${d.lv3 || 0}</td></tr>`;
        h += `<tr><td>Lv4:</td><td style='text-align:right; font-weight:bold; padding-left:15px;'>${d.lv4 || 0}</td></tr>`;
        h += `<tr><td>Lv5:</td><td style='text-align:right; font-weight:bold; padding-left:15px;'>${d.lv5 || 0}</td></tr>`;
        h += `<tr style='border-top:1px dotted #fff;'><td style='padding-top:5px;'>總計:</td><td style='text-align:right; font-weight:bold; padding-top:5px;'>${total}</td></tr>`;
        h += `</table>`;
        return h;
    }
    return "無資料"; // 如果抓不到，黑框會顯示這個
});
}
function createColumnSeries(chart,xAxis,value, name, color) {
    var series = chart.series.push(new am4charts.ColumnSeries())
    series.dataFields.valueY = value
    series.dataFields.categoryX = 'category'
    series.name = name

    series.columns.template.stroke = am4core.color('#000'); // 設定邊框顏色 
    series.columns.template.fill = am4core.color(color); // 設定填滿顏色
    series.tooltipText = "";

    series.events.on("hidden", arrangeColumns(chart,xAxis));
    series.events.on("shown", arrangeColumns(chart,xAxis));

    var bullet = series.bullets.push(new am4charts.LabelBullet())
    bullet.interactionsEnabled = false
    bullet.dy = 30;
    bullet.label.text = '{valueY}'
    bullet.label.fill = am4core.color('#000')

    return series;
}

function arrangeColumns(chart,xAxis) {

    var series = chart.series.getIndex(0);

    var w = 1 - xAxis.renderer.cellStartLocation - (1 - xAxis.renderer.cellEndLocation);
    if (series.dataItems.length > 1) {
        var x0 = xAxis.getX(series.dataItems.getIndex(0), "categoryX");
        var x1 = xAxis.getX(series.dataItems.getIndex(1), "categoryX");
        var delta = ((x1 - x0) / chart.series.length) * w;
        if (am4core.isNumber(delta)) {
            var middle = chart.series.length / 2;

            var newIndex = 0;
            chart.series.each(function(series) {
                if (!series.isHidden && !series.isHiding) {
                    series.dummyData = newIndex;
                    newIndex++;
                }
                else {
                    series.dummyData = chart.series.indexOf(series);
                }
            })
            var visibleCount = newIndex;
            var newMiddle = visibleCount / 2;

            chart.series.each(function(series) {
                var trueIndex = chart.series.indexOf(series);
                var newIndex = series.dummyData;

                var dx = (newIndex - trueIndex + middle - newMiddle) * delta
                series.animate({ property: "dx", to: dx }, series.interpolationDuration, series.interpolationEasing);
                series.bulletsContainer.animate({ property: "dx", to: dx }, series.interpolationDuration, series.interpolationEasing);
            })
        }
    }
}
/*XYChart END*/
