const https = require("https");

function getText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Referer": "https://quote.eastmoney.com/"
        },
        timeout: 8000
      },
      res => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => resolve(data));
      }
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("request timeout"));
    });

    req.on("error", reject);
  });
}

function marketCode(code) {
  if (code.startsWith("6")) return "sh" + code;
  if (code.startsWith("0") || code.startsWith("3")) return "sz" + code;
  if (code.startsWith("8") || code.startsWith("4")) return "bj" + code;
  return code;
}

async function searchCodeByName(keyword) {
  if (/^\d{6}$/.test(keyword)) {
    return { code: keyword, name: keyword };
  }

  const url =
    "https://searchapi.eastmoney.com/api/suggest/get?input=" +
    encodeURIComponent(keyword) +
    "&type=14&token=04840f2bd59f45d2bf7eff7e30d1a2a7";

  const text = await getText(url);
  const json = JSON.parse(text);

  const list =
    json &&
    json.QuotationCodeTable &&
    json.QuotationCodeTable.Data
      ? json.QuotationCodeTable.Data
      : [];

  const item = list.find(x => {
    return (
      x.Code &&
      x.Name &&
      /^\d{6}$/.test(x.Code) &&
      (x.MktNum === "0" || x.MktNum === "1" || x.MktNum === 0 || x.MktNum === 1)
    );
  }) || list[0];

  if (!item) return null;

  return {
    code: item.Code,
    name: item.Name
  };
}

function parseTencent(text, stock) {
  const match = text.match(/="([^"]+)"/);
  if (!match) return null;

  const arr = match[1].split("~");

  const code = stock.code;
  const name = stock.name || arr[1] || code;
  const price = Number(arr[3] || 0);
  const preClose = Number(arr[4] || 0);
  const open = Number(arr[5] || 0);
  const high = Number(arr[33] || 0);
  const low = Number(arr[34] || 0);
  const amount = Number(arr[37] || 0) * 10000;

  const pct = preClose
    ? Number((((price - preClose) / preClose) * 100).toFixed(2))
    : 0;

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

async function getStock(stock) {
  const realCode = marketCode(stock.code);
  const url = "https://qt.gtimg.cn/q=" + realCode;
  const text = await getText(url);
  return parseTencent(text, stock);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const q = (req.query.q || "").trim();

  try {
    let targets = [];

    if (q) {
      const found = await searchCodeByName(q);

      if (!found || !found.code) {
        return res.status(200).json({
          success: true,
          updateTime: new Date().toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai"
          }),
          data: []
        });
      }

      targets = [found];
    } else {
      targets = [
        { code: "300750", name: "宁德时代" },
        { code: "600519", name: "贵州茅台" },
        { code: "002594", name: "比亚迪" },
        { code: "300308", name: "中际旭创" },
        { code: "300502", name: "新易盛" },
        { code: "300394", name: "天孚通信" },
        { code: "688981", name: "中芯国际" },
        { code: "002371", name: "北方华创" }
      ];
    }

    const results = [];

    for (const stock of targets) {
      const item = await getStock(stock);
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
      message: "行情源暂时不可用，请稍后重试",
      error: String(error)
    });
  }
};
