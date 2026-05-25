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
        timeout: 12000
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
  if (/^\d{6}$/.test(keyword)) return { code: keyword, name: keyword };

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
    list.find(x => x.Code && x.Name && /^\d{6}$/.test(x.Code)) || list[0];

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
      signal: "历史数据不足"
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
  else if (dif > dea && macd > 0 && macd < prevMacd) signal = "MACD 多头但红柱缩短，注意动能减弱";
  else if (dif < dea && macd < 0 && macd < prevMacd) signal = "MACD 死叉偏弱，绿柱放大";
  else if (dif < dea && macd < 0) signal = "MACD 空头压制";
  else if (dif > dea) signal = "MACD 多头修复中";
  else if (dif < dea) signal = "MACD 偏弱修复中";

  return {
    dif: Number(dif.toFixed(3)),
    dea: Number(dea.toFixed(3)),
    macd: Number(macd.toFixed(3)),
    signal
  };
}

async function getKline(code, type) {
  const secid = eastMoneySecid(code);
  const kltMap = {
    day: 101,
    week: 102,
    month: 103
  };

  const url =
    "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=" +
    secid +
    "&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=" +
    kltMap[type] +
    "&fqt=1&end=20500101&lmt=160";

  const text = await getText(url);
  const json = JSON.parse(text);

  const klines =
    json && json.data && json.data.klines
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

function calcCore(stock, klines) {
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
  let chanceScore = 0;

  const positionReasons = [];
  const riskReasons = [];
  const buyReasons = [];
  const sellReasons = [];

  if (ma5 && price > ma5) {
    trendScore += 15;
    chanceScore += 10;
    positionReasons.push("站上5日线，短线偏强");
  } else if (ma5) {
    riskScore += 15;
    sellReasons.push("跌破5日线，短线需要减仓防守");
    riskReasons.push("跌破5日线，短线转弱");
  }

  if (ma20 && price > ma20) {
    trendScore += 20;
    chanceScore += 15;
    positionReasons.push("站上20日线，中短趋势较好");
  } else if (ma20) {
    riskScore += 25;
    sellReasons.push("跌破20日线，趋势防守位失守");
    riskReasons.push("跌破20日线，趋势防守位失守");
  }

  if (ma30 && price > ma30) {
    trendScore += 15;
    chanceScore += 10;
    positionReasons.push("站上30日线，趋势结构未破坏");
  } else if (ma30) {
    riskScore += 15;
    riskReasons.push("跌破30日线，趋势偏弱");
  }

  if (ma60 && price > ma60) {
    trendScore += 15;
    chanceScore += 10;
    positionReasons.push("站上季度线，波段结构较强");
  } else if (ma60) {
    riskScore += 20;
    sellReasons.push("跌破季度线，波段趋势偏弱");
    riskReasons.push("跌破季度线，波段偏弱");
  }

  let ma5Distance = null;
  if (ma5) {
    ma5Distance = Number((((price - ma5) / ma5) * 100).toFixed(2));
    if (ma5Distance > 8) {
      riskScore += 20;
      riskReasons.push("偏离5日线过大，追高风险上升");
      sellReasons.push("偏离5日线过大，不适合追高");
    } else if (ma5Distance >= -1 && ma5Distance <= 3 && price > ma20) {
      chanceScore += 15;
      buyReasons.push("靠近5日线且仍在20日线上方，适合观察分歧低吸");
    }
  }

  let volumeSignal = "量能中性";
  if (avgAmount5 && latestAmount > avgAmount5 * 1.6 && stock.pct > 0) {
    trendScore += 15;
    chanceScore += 15;
    volumeSignal = "明显放量上涨，资金活跃";
    buyReasons.push("放量上涨，资金关注度提高");
  } else if (avgAmount5 && latestAmount > avgAmount5 * 1.6 && stock.pct < 0) {
    riskScore += 25;
    volumeSignal = "放量下跌，抛压较重";
    sellReasons.push("放量下跌，优先控制风险");
  } else if (avgAmount5 && latestAmount < avgAmount5 * 0.7) {
    riskScore += 8;
    volumeSignal = "缩量，资金参与度下降";
  }

  const macd = calcMacd(closes);

  if (macd.signal.includes("金叉") || macd.signal.includes("多头")) {
    trendScore += 15;
    chanceScore += 15;
    buyReasons.push(macd.signal);
  }

  if (macd.signal.includes("死叉") || macd.signal.includes("空头")) {
    riskScore += 18;
    sellReasons.push(macd.signal);
  }

  if (stock.pct >= 9) {
    chanceScore += 10;
    trendScore += 10;
    buyReasons.push("涨停或接近涨停，短线辨识度提升");
  }

  let level = "没机会";
  let levelClass = "neutral";
  let positionAdvice = "0%—15%，观察为主";
  let actionAdvice = "暂时观察，等待重新放量或站上关键均线。";

  if (riskScore >= 65) {
    level = "风险大";
    levelClass = "danger";
    positionAdvice = "0%—10%，已有仓位优先减仓或止损";
    actionAdvice = "风险偏高，不建议新开仓；已有仓位以5日线、20日线为防守，破位严格减仓。";
  } else if (chanceScore >= 80 && trendScore >= 75 && riskScore <= 40) {
    level = "大机会";
    levelClass = "great";
    positionAdvice = "40%—70%，只适合分歧低吸或确认后持有，不建议无脑满仓";
    actionAdvice = "趋势和动能较强，已有仓位可持有；无仓不要追高，等回踩5日线或分歧转一致。";
  } else if (chanceScore >= 55 && trendScore >= 50 && riskScore <= 55) {
    level = "有机会";
    levelClass = "chance";
    positionAdvice = "20%—40%，适合小仓试错";
    actionAdvice = "有一定机会，可小仓试错；跌破5日线先减仓，跌破20日线退出观察。";
  }

  if (stock.pct >= 9 && ma5Distance !== null && ma5Distance > 6) {
    actionAdvice = "强势但短线偏离较大，不建议追高；已有仓位用5日线防守，炸板或放量滞涨先减仓。";
    positionAdvice = "已有仓位持有观察；无仓谨慎，等待分歧低吸";
  }

  let shortPressure = "低";
  if (riskScore >= 60) shortPressure = "高";
  else if (riskScore >= 35) shortPressure = "中";

  const stopLoss = ma20 || ma30 || ma5 || null;
  const defenseLine = ma5 || ma20 || null;

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
    chanceScore,
    level,
    levelClass,
    shortPressure,
    positionText: positionReasons.join("；") || "均线位置暂无明显优势",
    riskText: riskReasons.join("；") || "暂未出现明显破位风险",
    buyPoint: buyReasons.join("；") || "暂未出现高质量买点",
    sellPoint: sellReasons.join("；") || "暂未出现强卖出信号",
    actionAdvice,
    positionAdvice,
    stopLoss: stopLoss ? Number(stopLoss.toFixed(2)) : null,
    defenseLine: defenseLine ? Number(defenseLine.toFixed(2)) : null
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

function enrichKline(klines) {
  const closes = klines.map(x => x.close);
  return klines.map((x, i) => {
    const sub = closes.slice(0, i + 1);
    return {
      ...x,
      ma5: sma(sub, 5),
      ma20: sma(sub, 20),
      ma30: sma(sub, 30),
      ma60: sma(sub, 60)
    };
  });
}

async function getStock(stock) {
  const realCode = marketCode(stock.code);
  const url = "https://qt.gtimg.cn/q=" + realCode;
  const text = await getText(url);
  const basic = parseTencent(text, stock);

  if (!basic || !basic.price) return null;

  let day = [];
  let week = [];
  let month = [];
  let tech = {};

  try {
    day = await getKline(stock.code, "day");
    week = await getKline(stock.code, "week");
    month = await getKline(stock.code, "month");
    tech = calcCore(basic, day);
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
      chanceScore: 0,
      level: "没机会",
      levelClass: "neutral",
      shortPressure: "未知",
      positionText: "K线接口暂不可用",
      riskText: "K线接口暂不可用",
      buyPoint: "K线接口暂不可用",
      sellPoint: "K线接口暂不可用",
      actionAdvice: "行情不完整，先观察",
      positionAdvice: "0%—10%",
      stopLoss: null,
      defenseLine: null
    };
  }

  return {
    ...basic,
    ...tech,
    kline: {
      day: enrichKline(day).slice(-80),
      week: enrichKline(week).slice(-80),
      month: enrichKline(month).slice(-80)
    }
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
        { code: "002938", name: "鹏鼎控股" }
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
