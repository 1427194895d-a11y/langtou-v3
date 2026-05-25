<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <title>浪投 A股实时版 V8</title>
  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #050607;
      color: #f5f5f5;
      padding: 22px;
    }

    .app {
      max-width: 860px;
      margin: 0 auto;
    }

    h1 {
      margin: 22px 0 8px;
      font-size: 30px;
      letter-spacing: 1px;
    }

    .sub {
      color: #9ca3af;
      line-height: 1.6;
      font-size: 14px;
    }

    .warn {
      color: #d6b36a;
      font-size: 14px;
      line-height: 1.6;
      margin: 14px 0 18px;
    }

    .search {
      display: flex;
      gap: 10px;
      margin: 22px 0 12px;
    }

    input {
      flex: 1;
      padding: 15px 16px;
      border-radius: 14px;
      border: 1px solid #242830;
      background: #0c0f12;
      color: #fff;
      font-size: 16px;
      outline: none;
    }

    button {
      border: 0;
      border-radius: 14px;
      padding: 14px 18px;
      color: #fff;
      font-size: 16px;
      font-weight: 700;
      background: #e11d48;
      cursor: pointer;
    }

    .rank-btn {
      width: 100%;
      margin: 8px 0 18px;
      background: linear-gradient(135deg, #ef4444, #f59e0b);
      color: #111827;
    }

    .time {
      text-align: center;
      color: #9ca3af;
      margin: 22px 0;
      font-size: 15px;
    }

    .loading {
      text-align: center;
      padding: 28px 0;
      color: #d1d5db;
    }

    .card {
      background: #0b0e11;
      border: 1px solid #242830;
      border-radius: 20px;
      padding: 20px;
      margin: 18px 0;
      box-shadow: 0 12px 30px rgba(0,0,0,.25);
    }

    .top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }

    .name {
      font-size: 24px;
      font-weight: 800;
    }

    .code {
      color: #9ca3af;
      margin-top: 6px;
      font-size: 14px;
    }

    .price {
      text-align: right;
      font-size: 28px;
      color: #22c55e;
      font-weight: 800;
    }

    .down {
      color: #ef4444;
    }

    .pct {
      font-size: 15px;
      margin-top: 4px;
    }

    .tag {
      display: inline-block;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      margin-top: 10px;
      background: #1f2937;
      color: #e5e7eb;
    }

    .great {
      background: #fbbf24;
      color: #111827;
    }

    .chance {
      background: #22c55e;
      color: #052e16;
    }

    .danger {
      background: #ef4444;
      color: #fff;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 18px;
    }

    .box {
      background: #050708;
      border-radius: 14px;
      padding: 13px 14px;
      min-height: 70px;
    }

    .label {
      color: #9ca3af;
      font-size: 13px;
      margin-bottom: 7px;
    }

    .value {
      font-size: 17px;
      color: #f3f4f6;
      word-break: break-word;
    }

    .section {
      margin-top: 14px;
      background: #050708;
      border-radius: 14px;
      padding: 14px;
      line-height: 1.7;
      color: #d1d5db;
      font-size: 14px;
    }

    .section b {
      color: #fff;
    }

    .rank-title {
      font-size: 20px;
      margin: 20px 0 10px;
      font-weight: 800;
      color: #fbbf24;
    }

    .small {
      color: #9ca3af;
      font-size: 13px;
    }

    @media (max-width: 520px) {
      body {
        padding: 18px;
      }

      h1 {
        font-size: 27px;
      }

      .grid {
        grid-template-columns: 1fr 1fr;
      }

      .name {
        font-size: 22px;
      }

      .price {
        font-size: 25px;
      }

      button {
        padding: 14px 15px;
      }
    }
  </style>
</head>

<body>
  <div class="app">
    <h1>浪投 A股实时版 V8</h1>
    <div class="sub">实时行情 + 全市场机会榜 + 均线位置 + MACD + 量能 + 风险评分 + 仓位建议</div>
    <div class="warn">辅助决策，不保证盈利；高位股严格控制仓位和止损。</div>

    <div class="search">
      <input id="keyword" placeholder="搜索股票代码/名称，如 300750 宁德时代" />
      <button onclick="searchStock()">搜索</button>
    </div>

    <button class="rank-btn" onclick="loadRank()">查看全市场每日机会榜</button>

    <div id="time" class="time"></div>
    <div id="result"></div>
  </div>

  <script>
    const API = "/api/stocks";

    function money(n) {
      if (n === null || n === undefined || isNaN(Number(n))) return "-";
      n = Number(n);
      if (n >= 100000000) return (n / 100000000).toFixed(2) + "亿";
      if (n >= 10000) return (n / 10000).toFixed(2) + "万";
      return n.toFixed(2);
    }

    function val(x) {
      if (x === null || x === undefined || x === "") return "-";
      return x;
    }

    function pctClass(x) {
      return Number(x) < 0 ? "down" : "";
    }

    function levelClass(item) {
      if (item.levelClass === "great") return "tag great";
      if (item.levelClass === "chance") return "tag chance";
      if (item.levelClass === "danger") return "tag danger";
      return "tag";
    }

    function renderStock(item, index) {
      const priceClass = pctClass(item.pct);

      return `
        <div class="card">
          <div class="top">
            <div>
              <div class="name">${index ? index + ". " : ""}${val(item.name)}</div>
              <div class="code">${val(item.code)}</div>
              <div class="${levelClass(item)}">${val(item.level)}</div>
            </div>
            <div>
              <div class="price ${priceClass}">${val(item.price)}</div>
              <div class="pct ${priceClass}">${val(item.pct)}%</div>
            </div>
          </div>

          <div class="grid">
            <div class="box">
              <div class="label">机会分</div>
              <div class="value">${val(item.opportunityScore)}</div>
            </div>
            <div class="box">
              <div class="label">风险分</div>
              <div class="value">${val(item.riskScore)}</div>
            </div>
            <div class="box">
              <div class="label">成交额</div>
              <div class="value">${money(item.amount)}</div>
            </div>
            <div class="box">
              <div class="label">换手率</div>
              <div class="value">${val(item.turnover)}%</div>
            </div>
            <div class="box">
              <div class="label">MA5</div>
              <div class="value">${val(item.ma5)}</div>
            </div>
            <div class="box">
              <div class="label">MA20</div>
              <div class="value">${val(item.ma20)}</div>
            </div>
            <div class="box">
              <div class="label">MA30</div>
              <div class="value">${val(item.ma30)}</div>
            </div>
            <div class="box">
              <div class="label">MA60</div>
              <div class="value">${val(item.ma60)}</div>
            </div>
            <div class="box">
              <div class="label">支撑位</div>
              <div class="value">${val(item.support)}</div>
            </div>
            <div class="box">
              <div class="label">压力位</div>
              <div class="value">${val(item.pressure)}</div>
            </div>
          </div>

          <div class="section">
            <b>位置判断：</b><br />
            ${val(item.positionText)}
          </div>

          <div class="section">
            <b>量能：</b><br />
            ${val(item.volumeSignal)}
          </div>

          <div class="section">
            <b>MACD：</b><br />
            ${item.macd ? val(item.macd.signal) : "-"}
          </div>

          <div class="section">
            <b>买点观察：</b><br />
            ${val(item.buyPoint)}
          </div>

          <div class="section">
            <b>风险提示：</b><br />
            ${val(item.riskText)}
          </div>

          <div class="section">
            <b>卖点/减仓：</b><br />
            ${val(item.sellPoint)}
          </div>

          <div class="section">
            <b>仓位建议：</b><br />
            ${val(item.positionAdvice)}
          </div>

          <div class="section">
            <b>操作建议：</b><br />
            ${val(item.actionAdvice)}
          </div>

          <div class="small" style="margin-top:12px;">
            止损参考：${val(item.stopLoss)}　防守线：${val(item.defenseLine)}
          </div>
        </div>
      `;
    }

    function renderList(data, title) {
      const result = document.getElementById("result");

      if (!data || !data.length) {
        result.innerHTML = `
          <div class="loading">
            暂时没有筛选到股票。盘前/休市时数据可能较少，开盘后再看更准。
          </div>
        `;
        return;
      }

      let html = "";
      if (title) {
        html += `<div class="rank-title">${title}</div>`;
      }

      html += data.map((item, i) => renderStock(item, title ? i + 1 : 0)).join("");
      result.innerHTML = html;
    }

    async function request(url) {
      const result = document.getElementById("result");
      result.innerHTML = `<div class="loading">正在加载数据，请稍等...</div>`;

      try {
        const res = await fetch(url + "&t=" + Date.now());
        const json = await res.json();

        document.getElementById("time").innerText =
          json.updateTime ? "更新时间：" + json.updateTime : "";

        if (!json.success) {
          result.innerHTML = `<div class="loading">数据暂时不可用，请稍后再试。</div>`;
          return;
        }

        renderList(json.data || [], json.title || "");
      } catch (e) {
        result.innerHTML = `<div class="loading">加载失败，请刷新重试。</div>`;
      }
    }

    function searchStock() {
      const q = document.getElementById("keyword").value.trim();
      if (!q) {
        request(API + "?q=300750");
        return;
      }
      request(API + "?q=" + encodeURIComponent(q));
    }

    function loadRank() {
      request(API + "?rank=1");
    }

    document.getElementById("keyword").addEventListener("keydown", function(e) {
      if (e.key === "Enter") searchStock();
    });

    request(API + "?q=300750");
  </script>
</body>
</html>
