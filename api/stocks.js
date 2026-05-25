const https = require("https");

const STOCKS = [
  { code: "300750", name: "宁德时代" },
  { code: "600519", name: "贵州茅台" },
  { code: "002594", name: "比亚迪" },
  { code: "000858", name: "五粮液" },
  { code: "601318", name: "中国平安" },
  { code: "000001", name: "平安银行" },
  { code: "000333", name: "美的集团" },
  { code: "300059", name: "东方财富" },
  { code: "601899", name: "紫金矿业" },
  { code: "300760", name: "迈瑞医疗" }
];

function marketCode(code) {
  if (code.startsWith("6")) return "sh" + code;
  if (code.startsWith("0") || code.startsWith("3")) return "sz" + code;
  if (code.startsWith("8") || code.startsWith("4")) return "bj" + code;
  return code;
}

function getText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 8000
    }, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function findStock(q) {
  if (!q) return null;
  return STOCKS.find(s => s.code === q || s.name.includes(q) || q.includes(s.name));
}

function parseTencent(text, stock) {
  const match = text.match(/="([^"]+)"/);
  if (!match) return null;

  const arr = match[1].split("~");

  const code = stock.code;
  const name = stock.name;
  const price = Number(arr[3] || 0);
  const preClose = Number(arr[4] || 0);
  const open = Number(arr[5] || 0);
  const high = Number(arr[33] || 0);
  const low = Number(arr[34] || 0);
  const amount = Number(arr[37] || 0) * 10000;

  const pct = preClose ? Number(((price - preClose) / preClose * 100).toFixed(2)) : 0;

  let score = 0;
  const reasons = [];

  if (pct >= 7) {
    score += 25;
    reasons.push("涨幅强，接近涨停区");
  }
  if (amount >= 1000000000) {
    score += 25;
    reasons.push("成交额大，资金关注度高");
  }
  if (pct > 0) {
    score += 10;
    reasons.push("红盘强于市场");
  }

  let signal = "观察";
  if (score >= 50) signal = "短线强势，等确认买点";
  if (pct < -3) signal = "走弱，谨慎参与";

  return {
    code,
    name,
    price,
    pct,
    amount,
    turnover: "-",
    volumeRatio: "-",
    high,
    low,
    open,
    preClose,
    score,
    signal,
    reason: reasons.join("；") || "暂无明显短线异动"
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const q = (req.query.q || "").trim();

  try {
    let targets = [];

    if (q) {
      const stock = findStock(q);
      if (!stock) {
        return res.status(200).json({
          success: true,
          updateTime: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
          data: []
        });
      }
      targets = [stock];
    } else {
      targets = STOCKS.slice(0, 10);
    }

    const results = [];

    for (const stock of targets) {
      const realCode = marketCode(stock.code);
      const url = "https://qt.gtimg.cn/q=" + realCode;
      const text = await getText(url);
      const item = parseTencent(text, stock);
      if (item && item.price) results.push(item);
    }

    return res.status(200).json({
      success: true,
      updateTime: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
      data: results
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "行情接口失败",
      error: String(error)
    });
  }
};
