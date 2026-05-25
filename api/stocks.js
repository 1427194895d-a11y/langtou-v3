const https = require("https");

function marketCode(code) {
  if (code.startsWith("6")) return "sh" + code;
  if (code.startsWith("0") || code.startsWith("3")) return "sz" + code;
  if (code.startsWith("8") || code.startsWith("4")) return "bj" + code;
  return code;
}

function getText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      },
      timeout: 8000
    }, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function parseTencent(text, rawCode) {
  const match = text.match(/="([^"]+)"/);
  if (!match) return null;

  const arr = match[1].split("~");

  const name = arr[1] || rawCode;
  const code = arr[2] || rawCode;
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

  const codes = q
    ? [q]
    : ["300750", "600519", "002594", "000858", "601318", "000001"];

  try {
    const results = [];

    for (const code of codes) {
      const realCode = marketCode(code);
      const url = "https://qt.gtimg.cn/q=" + realCode;
      const text = await getText(url);
      const item = parseTencent(text, code);
      if (item && item.price) results.push(item);
    }

    return res.status(200).json({
      success: true,
      updateTime: new Date().toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai"
      }),
      data: results
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "腾讯行情接口失败",
      error: String(error)
    });
  }
};
