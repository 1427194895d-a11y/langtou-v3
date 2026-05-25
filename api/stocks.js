
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
        timeout: 10000
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

function eastMoneySecid(code) {
  if (code.startsWith("6")) return "1." + code;
  if (code.startsWith("0") || code.startsWith("3")) return "0." + code;
  if (code.startsWith("8") || code.startsWith("4")) return "0." + code;
  return "0." + code;
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

  const item =
    list.find(x => {
      return x.Code && x.Name && /^\d{6}$/.test(x.Code);
    }) || list[0];

  if (!item) return null;

  return {
    code: item.Code,
    name: item.Name
  };
}

function sma(values, n) {
  if (!values || values.length < n) return null;
  const arr = values.slice(values.length - n);
  const sum = arr.reduce((a, b) => a + b, 0);
  return Number((sum / n).toFixed(2));
}

function ema(values, n) {
  if (!values || values.length === 0) return [];
  const k = 2 / (n + 1);
  const result = [];
  let prev = values[0];
  result.push(prev);
  for (let i = 1; i < values.length; i++) {
    const current = values[i] * k + prev * (1 - k);
    result.push(current);
    prev = current;
  }
  return result;
}

function calcMacd(closes) {
  if (!closes || closes.length < 35) {
    return {
      dif: null,
      dea: null,
      macd: null,
      signal: "历史数据不足，暂不判断"
    };
  }

  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const difArr = closes.map((_, i) => ema12[i] - ema26[i]);
  const deaArr = ema(difArr, 9);
  const macdArr = difArr.map((v, i) => (v - deaArr[i]) * 2);

  const dif = difArr[difArr.length - 1];
  const dea = deaArr[deaArr.length - 1];
  const macd = macdArr[macdArr.length - 1];
  const prevMacd = macdArr[macdArr.length - 2];

  let signal = "MACD 中性";
  if (dif > dea && macd > 0 && macd > prevMacd) signal = "MACD 金叉偏强，红柱放大";
  else if (dif > dea && macd > 0 && macd < prevMacd) signal = "MACD 多头但红柱缩短，动能减弱";
  else if (dif < dea && macd < 0) signal = "MACD 死叉偏弱";
  else if (dif > dea) signal = "MACD 多头修复中";
  else if (dif < dea) signal = "MACD 空头压制中";

  return {
    dif: Number(dif.toFixed(3)),
    dea: Number(dea.toFixed(3)),
    macd: Number(macd.toFixed(3)),
    signal
  };
}

async function getKline(code) {
  const secid = eastMoneySecid(code);
  const url =
    "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=" +
    secid +
    "&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&end=20500101&lmt=120";

  const text = await getText(url);
  const json = JSON.parse(text);

  const klines =
    json &&
    json.data &&
    json.data.klines
      ? json.data.klines
      : [];

  return klines.map(line => {
    const arr = line.split(",");
    return {
      date: arr[0],
      open: Number(arr[1]),
      close: Number(arr[2]),
      high: Number(arr[3]),
      low: Number(arr[4]),
      volume: Number(arr[5]),
      amount: Number(arr[6])
    };
  });
}

function calcPosition(stock, klines) {
  const closes = klines.map(x => x.close).filter(x => x > 0);
  const amounts = klines.map(x => x.amount).filter(x => x > 0);

  const price = Number(stock.price || closes[closes.length - 1] || 0);

  const ma5 = sma(closes, 5);
  const ma20 = sma(closes, 20);
  const ma30 = sma(closes, 30);
  const ma60 = sma(closes, 60);

  const avgAmount5 = sma(amounts, 5);
  const latestAmount = stock.amount || (amounts.length ? amounts[amounts.length - 1] : 0);

  let trendScore = 0;
  let riskScore = 0;
  const positionReasons = [];
  const riskReasons = [];

  if (ma5 && price > ma5) {
    trendScore += 15;
    positionReasons.push("站上5日线，短线偏强");
  } else if (ma5) {
    riskScore += 15;
    riskReasons.push("跌破5日线，短线转弱");
  }

  if (ma20 && price > ma20) {
    trendScore += 20;
    positionReasons.push("站上20日线，中短趋势较好");
  } else if (ma20) {
    riskScore += 20;
    riskReasons.push("跌破20日线，趋势防守位失守");
  }

  if (ma30 && price > ma30) {
    trendScore += 15;
    positionReasons.push("站上30日线，趋势未破坏");
  } else if (ma30) {
    riskScore += 15;
    riskReasons.push("跌破30日线，趋势偏弱");
  }

  if (ma60 && price > ma60) {
    trendScore += 15;
    positionReasons.push("站上季度线，波段趋势较强");
  } else if (ma60) {
    riskScore += 15;
    riskReasons.push("跌破季度线，波段偏弱");
  }

  let ma5Distance = null;
  if (ma5) {
    ma5Distance = Number((((price - ma5) / ma5) * 100).toFixed(2));
    if (ma5Distance > 8) {
      riskScore += 20;
      riskReasons.push("偏离5日线过大，追高风险上升");
    }
    if (ma5Distance < -3) {
      riskScore += 10;
      riskReasons.push("明显低于5日线，短线承压");
    }
  }

  let volumeSignal = "量能中性";
  if (avgAmount5 && latestAmount > avgAmount5 * 1.5) {
    trendScore += 15;
    volumeSignal = "明显放量，资金活跃";
  } else if (avgAmount5 && latestAmount < avgAmount5 * 0.7) {
    riskScore += 10;
    volumeSignal = "缩量，资金参与度下降";
  }

  const macd = calcMacd(closes);
  if (macd.signal.includes("金叉") || macd.signal.includes("多头")) trendScore += 15;
  if (macd.signal.includes("死叉") || macd.signal.includes("空头")) riskScore += 15;

  let shortPressure = "低";
  if (riskScore >= 45) shortPressure = "高";
  else if (riskScore >= 25) shortPressure = "中";

  let actionAdvice = "观察为主";
  if (trendScore >= 80 && riskScore <= 25) {
    actionAdvice = "趋势较强，可持有；无仓不追高，等分歧低吸";
  } else if (trendScore >= 60 && riskScore <= 35) {
    actionAdvice = "可小仓试错或持有，跌破5日线减仓";
  } else if (riskScore >= 55) {
    actionAdvice = "风险偏高，建议减仓或等待重新站回均线";
  } else if (ma20 && price < ma20) {
    actionAdvice = "20日线下方，不宜重仓，先等趋势修复";
  }

  if (stock.pct >= 9 && ma5Distance !== null && ma5Distance > 6) {
    actionAdvice = "涨停或接近涨停且偏离较大，不建议追高；已有仓位看5日线防守";
  }

  return {
    ma5,
    ma20,
    ma30,
    ma60,
    ma5Distance,
    avgAmount5,
    volumeSignal,
    macd,
    trendScore,
    riskScore,
    shortPressure,
    positionText: positionReasons.join("；") || "均线位置暂无明显优势",
    riskText: riskReasons.join("；") || "暂未出现明显破位风险",
    actionAdvice
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

  return {
    code,
    name,
    price,
    pct,
    amount,
    high,
    low,
    open,
    preClose
  };
}

async function getStock(stock) {
  const realCode = marketCode(stock.code);
  const url = "https://qt.gtimg.cn/q=" + realCode;
  const text = await getText(url);
  const basic = parseTencent(text, stock);

  if (!basic || !basic.price) return null;

  let tech = {};
  try {
    const klines = await getKline(stock.code);
    tech = calcPosition(basic, klines);
  } catch (e) {
    tech = {
      ma5: null,
      ma20: null,
      ma30: null,
      ma60: null,
      ma5Distance: null,
      avgAmount5: null,
      volumeSignal: "K线接口暂不可用",
      macd: { signal: "K线接口暂不可用" },
      trendScore: 0,
      riskScore: 0,
      shortPressure: "未知",
      positionText: "K线接口暂不可用",
      riskText: "K线接口暂不可用",
      actionAdvice: "行情不完整，先观察"
    };
  }

  return {
    ...basic,
    ...tech
  };
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
