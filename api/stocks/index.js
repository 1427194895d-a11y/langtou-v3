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
        res.on("data", chunk => (data += chunk));
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

function eastmoneySecid(code) {
  if (code.startsWith("6")) return "1." + code;
  return "0." + code;
}

async function searchStock(q) {
  const keyword = String(q || "").trim();
  if (!keyword) return null;

  if (/^\d{6}$/.test(keyword)) {
    return { code: keyword, name: keyword };
  }

  try {
    const url =
      "https://searchapi.eastmoney.com/api/suggest/get?input=" +
      encodeURIComponent(keyword) +
      "&type=14&token=04840f2bd59f45d2bf7eff7e30d1a2a7";

    const json = JSON.parse(await getText(url));
    const list =
      json && json.QuotationCodeTable && json.QuotationCodeTable.Data
        ? json.QuotationCodeTable.Data
        : [];

    const item =
      list.find(x => x.Code && x.Name && /^\d{6}$/.test(x.Code)) || list[0];

    if (item && item.Code) {
      return {
        code: item.Code,
        name: item.Name || item.Code
      };
    }
  } catch (e) {}

  return null;
}

async function getStockName(code, fallbackName) {
  if (fallbackName && fallbackName !== code) return fallbackName;

  try {
    const url =
      "https://searchapi.eastmoney.com/api/suggest/get?input=" +
      encodeURIComponent(code) +
      "&type=14&token=04840f2bd59f45d2bf7eff7e30d1a2a7";

    const json = JSON.parse(await getText(url));
    const list =
      json && json.QuotationCodeTable && json.QuotationCodeTable.Data
        ? json.QuotationCodeTable.Data
        : [];

    const item = list.find(x => x.Code === code);
    if (item && item.Name) return item.Name;
  } catch (e) {}

  return fallbackName || code;
}

function parseQuote(text, stock) {
  const m = String(text || "").match(/="([^"]+)"/);
  if (!m) return null;

  const a = m[1].split("~");

  const code = a[2] || stock.code;
  const price = Number(a[3] || 0);
  const preClose = Number(a[4] || 0);
  const open = Number(a[5] || 0);
  const volumeHand = Number(a[6] || 0);
  const high = Number(a[33] || 0);
  const low = Number(a[34] || 0);
  const amountWan = Number(a[37] || 0);
  const turnover = Number(a[38] || 0);
  const pe = Number(a[39] || 0);
  const pb = Number(a[46] || 0);

  const pct = preClose
    ? Number((((price - preClose) / preClose) * 100).toFixed(2))
    : 0;

  return {
    code,
    name: stock.name || code,
    price,
    pct,
    open,
    high,
    low,
    preClose,
    volume: volumeHand * 100,
    amount: amountWan * 10000,
    turnover,
    pe,
    pb
  };
}

async function getKline(code, klt, limit) {
  try {
    const url =
      "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=" +
      eastmoneySecid(code) +
      "&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=" +
      klt +
      "&fqt=1&end=20500101&lmt=" +
      limit;

    const json = JSON.parse(await getText(url));
    const rows = json && json.data && json.data.klines ? json.data.klines : [];

    return rows.map(line => {
      const a = line.split(",");
      return {
        date: a[0],
        open: Number(a[1]),
        close: Number(a[2]),
        high: Number(a[3]),
        low: Number(a[4]),
        volume: Number(a[5]),
        amount: Number(a[6]),
        amplitude: Number(a[7]),
        pct: Number(a[8]),
        change: Number(a[9]),
        turnover: Number(a[10])
      };
    });
  } catch (e) {
    return [];
  }
}

async function getFinance(code) {
  try {
    const url =
      'https://datacenter-web.eastmoney.com/api/data/v1/get?sortColumns=REPORT_DATE&sortTypes=-1&pageSize=1&pageNumber=1&reportName=RPT_LICO_FN_CPD&columns=ALL&filter=(SECURITY_CODE="' +
      code +
      '")';

    const json = JSON.parse(await getText(url));
    const row =
      json && json.result && json.result.data && json.result.data.length
        ? json.result.data[0]
        : null;

    if (!row) {
      return {
        available: false,
        level: "暂无",
        summary: "暂无季度业绩数据"
      };
    }

    const revenue = Number(row.TOTAL_OPERATE_INCOME || row.OPERATE_INCOME || 0);
    const netProfit = Number(
      row.PARENT_NETPROFIT || row.NETPROFIT || row.DEDUCT_PARENT_NETPROFIT || 0
    );
    const revenueYoy = Number(
      row.TOTAL_OPERATE_INCOME_YOY || row.OPERATE_INCOME_YOY || 0
    );
    const profitYoy = Number(
      row.PARENT_NETPROFIT_YOY ||
        row.NETPROFIT_YOY ||
        row.DEDUCT_PARENT_NETPROFIT_YOY ||
        0
    );

    let level = "中性";
    let summary = "业绩表现中性，需要结合股价趋势、行业景气和资金面判断。";

    if (profitYoy > 50 && revenueYoy > 20) {
      level = "高增长";
      summary = "营收和净利润高速增长，基本面表现强。";
    } else if (profitYoy > 30 && revenueYoy > 10) {
      level = "优秀";
      summary = "营收和净利润同步增长，基本面较强。";
    } else if (profitYoy > 0 && revenueYoy > 0) {
      level = "稳健";
      summary = "营收和净利润保持增长，基本面相对稳健。";
    } else if (profitYoy < -30 && revenueYoy < 0) {
      level = "承压";
      summary = "营收和净利润双降，基本面短期承压。";
    } else if (profitYoy < -20) {
      level = "偏弱";
      summary = "净利润同比下滑明显，需要警惕业绩压力。";
    }

    return {
      available: true,
      reportDate: row.REPORT_DATE || row.REPORTDATE || "-",
      revenue,
      netProfit,
      revenueYoy,
      profitYoy,
      eps: row.BASIC_EPS || "-",
      roe: row.WEIGHTAVG_ROE || row.ROE || "-",
      grossMargin: row.GROSS_PROFIT_RATIO || "-",
      netMargin: row.NETPROFIT_RATIO || "-",
      level,
      summary
    };
  } catch (e) {
    return {
      available: false,
      level: "不可用",
      summary: "季度业绩接口暂时不可用"
    };
  }
}

function sma(arr, n) {
  if (!arr || arr.length < n) return null;
  const part = arr.slice(arr.length - n);
  return Number((part.reduce((a, b) => a + b, 0) / n).toFixed(2));
}

function ema(arr, n) {
  if (!arr || !arr.length) return [];
  const k = 2 / (n + 1);
  const out = [];
  let prev = arr[0];
  out.push(prev);

  for (let i = 1; i < arr.length; i++) {
    const cur = arr[i] * k + prev * (1 - k);
    out.push(cur);
    prev = cur;
  }

  return out;
}

function calcMacd(closes) {
  if (!closes || closes.length < 35) {
    return {
      dif: null,
      dea: null,
      macd: null,
      signal: "历史数据不足，暂不能判断MACD"
    };
  }

  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const difs = closes.map((_, i) => e12[i] - e26[i]);
  const deas = ema(difs, 9);
  const bars = difs.map((v, i) => (v - deas[i]) * 2);

  const dif = difs[difs.length - 1];
  const dea = deas[deas.length - 1];
  const bar = bars[bars.length - 1];
  const prev = bars[bars.length - 2];

  let signal = "MACD中性";
  if (dif > dea && bar > 0 && bar > prev) {
    signal = "MACD金叉偏强，红柱放大";
  } else if (dif > dea && bar > 0 && bar < prev) {
    signal = "MACD多头但红柱缩短，注意动能减弱";
  } else if (dif < dea && bar < 0 && bar < prev) {
    signal = "MACD死叉偏弱，绿柱放大";
  } else if (dif < dea && bar < 0) {
    signal = "MACD空头压制中";
  } else if (dif > dea) {
    signal = "MACD多头修复中";
  } else if (dif < dea) {
    signal = "MACD死叉偏弱";
  }

  return {
    dif: Number(dif.toFixed(3)),
    dea: Number(dea.toFixed(3)),
    macd: Number(bar.toFixed(3)),
    signal
  };
}

function recentHigh(rows, n) {
  if (!rows || rows.length < 2) return null;
  const part = rows.slice(Math.max(0, rows.length - n - 1), rows.length - 1);
  if (!part.length) return null;
  return Math.max(...part.map(x => x.high || 0));
}

function recentLow(rows, n) {
  if (!rows || rows.length < 2) return null;
  const part = rows.slice(Math.max(0, rows.length - n - 1), rows.length - 1);
  const lows = part.map(x => x.low || 0).filter(Boolean);
  if (!lows.length) return null;
  return Math.min(...lows);
}

function calcSupportResistance(price, dayK, ma5, ma10, ma20, ma30, ma60) {
  const h20 = recentHigh(dayK, 20);
  const h60 = recentHigh(dayK, 60);
  const l20 = recentLow(dayK, 20);
  const l60 = recentLow(dayK, 60);

  const supports = [ma5, ma10, ma20, ma30, ma60, l20, l60]
    .filter(x => x && x < price)
    .sort((a, b) => b - a);

  const pressures = [ma5, ma10, ma20, ma30, ma60, h20, h60]
    .filter(x => x && x > price)
    .sort((a, b) => a - b);

  const support = supports.length ? Number(supports[0].toFixed(2)) : null;
  const strongSupport = supports.length > 1 ? Number(supports[supports.length - 1].toFixed(2)) : support;

  const pressure = pressures.length ? Number(pressures[0].toFixed(2)) : null;
  const strongPressure = pressures.length > 1 ? Number(pressures[pressures.length - 1].toFixed(2)) : pressure;

  return {
    support,
    strongSupport,
    pressure,
    strongPressure,
    high20: h20 ? Number(h20.toFixed(2)) : null,
    high60: h60 ? Number(h60.toFixed(2)) : null,
    low20: l20 ? Number(l20.toFixed(2)) : null,
    low60: l60 ? Number(l60.toFixed(2)) : null
  };
}

function makeStrategy(basic, dayK, finance) {
  const closes = dayK.map(x => x.close).filter(x => x > 0);
  const amounts = dayK.map(x => x.amount).filter(x => x > 0);

  const price = basic.price;
  const ma5 = sma(closes, 5);
  const ma10 = sma(closes, 10);
  const ma20 = sma(closes, 20);
  const ma30 = sma(closes, 30);
  const ma60 = sma(closes, 60);
  const avgAmount5 = sma(amounts, 5);
  const avgAmount20 = sma(amounts, 20);
  const macd = calcMacd(closes);
  const sr = calcSupportResistance(price, dayK, ma5, ma10, ma20, ma30, ma60);

  let trendScore = 0;
  let volumeScore = 0;
  let macdScore = 0;
  let klineScore = 0;
  let financeScore = 0;
  let riskScore = 0;

  const pos = [];
  const risk = [];
  const buy = [];
  const sell = [];

  if (ma5 && price > ma5) {
    trendScore += 12;
    pos.push("站上5日线，短线偏强");
  } else if (ma5) {
    riskScore += 15;
    risk.push("跌破5日线，短线转弱");
    sell.push("跌破5日线，短线需要减仓防守");
  }

  if (ma10 && price > ma10) {
    trendScore += 8;
    pos.push("站上10日线，短线趋势保持");
  } else if (ma10) {
    riskScore += 8;
    risk.push("跌破10日线，短线动能减弱");
  }

  if (ma20 && price > ma20) {
    trendScore += 18;
    pos.push("站上20日线，中短趋势较好");
  } else if (ma20) {
    riskScore += 25;
    risk.push("跌破20日线，趋势防守位失守");
    sell.push("跌破20日线，退出观察");
  }

  if (ma30 && price > ma30) {
    trendScore += 12;
    pos.push("站上30日线，趋势结构未破坏");
  } else if (ma30) {
    riskScore += 14;
    risk.push("跌破30日线，趋势偏弱");
  }

  if (ma60 && price > ma60) {
    trendScore += 15;
    pos.push("站上季度线，波段结构较强");
  } else if (ma60) {
    riskScore += 20;
    risk.push("跌破季度线，波段偏弱");
    sell.push("跌破季度线，波段风险加大");
  }

  if (ma5 && ma20 && ma30 && ma5 > ma20 && ma20 > ma30) {
    trendScore += 15;
    pos.push("MA5>MA20>MA30，多头排列");
    buy.push("均线多头排列，趋势结构较好");
  }

  let ma5Distance = null;
  if (ma5) {
    ma5Distance = Number((((price - ma5) / ma5) * 100).toFixed(2));
    if (ma5Distance > 10) {
      riskScore += 25;
      risk.push("偏离5日线超过10%，短线追高风险较大");
      sell.push("偏离5日线过大，不适合追高");
    } else if (ma5Distance > 6) {
      riskScore += 15;
      risk.push("偏离5日线较大，追高性价比下降");
      sell.push("短线偏离较大，适合等回踩");
    } else if (ma5Distance >= -1 && ma5Distance <= 3 && ma20 && price > ma20) {
      klineScore += 12;
      buy.push("靠近5日线且仍在20日线上方，适合观察分歧低吸");
    }
  }

  let volumeSignal = "量能中性";
  if (avgAmount5 && basic.amount > avgAmount5 * 1.8 && basic.pct > 0) {
    volumeScore += 25;
    volumeSignal = "强放量上涨，资金参与度高";
    buy.push("强放量上涨，资金关注度明显提升");
  } else if (avgAmount5 && basic.amount > avgAmount5 * 1.5 && basic.pct > 0) {
    volumeScore += 18;
    volumeSignal = "放量上涨，资金活跃";
    buy.push("放量上涨，短线活跃度提升");
  } else if (avgAmount5 && basic.amount > avgAmount5 * 1.5 && basic.pct < 0) {
    volumeScore -= 10;
    riskScore += 25;
    volumeSignal = "放量下跌，抛压较重";
    sell.push("放量下跌，优先控制风险");
  } else if (avgAmount5 && basic.amount < avgAmount5 * 0.65) {
    riskScore += 8;
    volumeSignal = "缩量，资金参与度下降";
  }

  if (macd.signal.includes("金叉")) {
    macdScore += 20;
    buy.push(macd.signal);
  } else if (macd.signal.includes("多头")) {
    macdScore += 12;
    buy.push(macd.signal);
  } else if (macd.signal.includes("死叉")) {
    macdScore -= 15;
    riskScore += 18;
    sell.push(macd.signal);
  } else if (macd.signal.includes("空头")) {
    macdScore -= 10;
    riskScore += 12;
    sell.push(macd.signal);
  }

  if (sr.high20 && price > sr.high20 && basic.pct > 0) {
    klineScore += 20;
    buy.push("突破20日新高，短线强度提升");
  } else if (sr.high20 && price >= sr.high20 * 0.97 && basic.pct > 0) {
    klineScore += 12;
    buy.push("接近20日新高，短线强度较好");
  }

  if (sr.low20 && price <= sr.low20 * 1.03) {
    riskScore += 10;
    risk.push("接近20日低位，趋势仍需修复");
  }

  if (basic.high && basic.low && basic.open && basic.price) {
    const range = basic.high - basic.low;
    const upperShadow = basic.high - Math.max(basic.open, basic.price);
    if (range > 0 && upperShadow / range > 0.45 && basic.pct > 0) {
      riskScore += 15;
      sell.push("上影线较长，高位抛压需要注意");
    }
  }

  if (finance && finance.available) {
    if (finance.profitYoy > 50 && finance.revenueYoy > 20) {
      financeScore += 25;
      buy.push("季度业绩高增长，基本面有较强支撑");
    } else if (finance.profitYoy > 30 && finance.revenueYoy > 10) {
      financeScore += 18;
      buy.push("季度业绩增长较强");
    } else if (finance.profitYoy > 0 && finance.revenueYoy > 0) {
      financeScore += 10;
    } else if (finance.profitYoy < -20) {
      financeScore -= 15;
      riskScore += 12;
      risk.push("季度净利润明显下滑，基本面承压");
    }
  }

  if (basic.pct >= 9) {
    trendScore += 8;
    klineScore += 10;
    buy.push("涨停或接近涨停，短线辨识度提升");
  }

  if (basic.pct <= -5) {
    riskScore += 20;
    sell.push("跌幅较大，短线风险上升");
  }

  const opportunityScore = Math.max(
    0,
    Math.min(100, trendScore + volumeScore + macdScore + klineScore + financeScore)
  );

  riskScore = Math.max(0, Math.min(100, riskScore));

  let level = "没机会";
  let levelClass = "neutral";
  let positionAdvice = "0%—15%，观察为主";
  let actionAdvice = "暂时观察，等待重新放量或站上关键均线。";
  let addPositionAdvice = "暂不适合加仓";
  let reducePositionAdvice = "暂不需要主动减仓";

  const isBreakMA5 = !!(ma5 && price < ma5);
  const isBreakMA20 = !!(ma20 && price < ma20);
  const isBreakMA30 = !!(ma30 && price < ma30);
  const isBreakMA60 = !!(ma60 && price < ma60);
  const isBroken = isBreakMA20 || isBreakMA30 || isBreakMA60;

  if (riskScore >= 65) {
    level = "风险大";
    levelClass = "danger";
    positionAdvice = "0%—10%，已有仓位优先减仓或止损";
    actionAdvice = "风险偏高，不建议新开仓；已有仓位以5日线、20日线为防守，破位严格减仓。";
    reducePositionAdvice = "适合减仓或严格防守";
  } else if (opportunityScore >= 80 && trendScore >= 60 && riskScore <= 35) {
    level = "大机会";
    levelClass = "great";
    positionAdvice = "40%—70%，只适合分歧低吸或确认后持有，不建议无脑满仓";
    actionAdvice = "趋势、量能、动能或基本面共振较强；已有仓位可持有，无仓不要追高，等回踩5日线或分歧转一致。";
    addPositionAdvice = "可在回踩不破5日线或突破压力位后分批加仓";
  } else if (opportunityScore >= 55 && trendScore >= 40 && riskScore <= 55) {
    level = "有机会";
    levelClass = "chance";
    positionAdvice = "20%—40%，适合小仓试错";
    actionAdvice = "有一定机会，可小仓试错；跌破5日线先减仓，跌破20日线退出观察。";
    addPositionAdvice = "只能小仓试错，不适合重仓";
  }

  if (basic.pct >= 9 && ma5Distance !== null && ma5Distance > 6) {
    actionAdvice = "强势但短线偏离较大，不建议追高；已有仓位用5日线防守，炸板或放量滞涨先减仓。";
    positionAdvice = "已有仓位持有观察；无仓谨慎，等待分歧低吸";
  }

  const stopLoss = ma20 || ma30 || ma5 || sr.support || null;
  const defenseLine = ma5 || ma20 || sr.support || null;

  return {
    ma5,
    ma10,
    ma20,
    ma30,
    ma60,
    ma5Distance,
    avgAmount5,
    avgAmount20,
    volumeSignal,
    macd,

    support: sr.support,
    strongSupport: sr.strongSupport,
    pressure: sr.pressure,
    strongPressure: sr.strongPressure,
    high20: sr.high20,
    high60: sr.high60,
    low20: sr.low20,
    low60: sr.low60,

    isBreakMA5,
    isBreakMA20,
    isBreakMA30,
    isBreakMA60,
    isBroken,

    trendScore: Math.max(0, Math.min(100, trendScore)),
    volumeScore: Math.max(-20, Math.min(100, volumeScore)),
    macdScore: Math.max(-20, Math.min(100, macdScore)),
    klineScore: Math.max(0, Math.min(100, klineScore)),
    financeScore: Math.max(-20, Math.min(100, financeScore)),
    chanceScore: opportunityScore,
    opportunityScore,
    riskScore,

    level,
    levelClass,
    shortPressure: riskScore >= 60 ? "高" : riskScore >= 35 ? "中" : "低",

    positionText: pos.join("；") || "均线位置暂无明显优势",
    riskText: risk.join("；") || "暂未出现明显破位风险",
    buyPoint: buy.join("；") || "暂未出现高质量买点",
    sellPoint: sell.join("；") || "暂未出现强卖出信号",

    actionAdvice,
    positionAdvice,
    addPositionAdvice,
    reducePositionAdvice,

    stopLoss: stopLoss ? Number(stopLoss.toFixed(2)) : null,
    defenseLine: defenseLine ? Number(defenseLine.toFixed(2)) : null
  };
}

async function getStock(stock) {
  const realName = await getStockName(stock.code, stock.name);
  stock.name = realName;

  const quoteText = await getText("https://qt.gtimg.cn/q=" + marketCode(stock.code));
  const basic = parseQuote(quoteText, stock);

  if (!basic || !basic.price) return null;

  basic.name = realName;

  const dayK = await getKline(stock.code, 101, 120);
  const weekK = await getKline(stock.code, 102, 80);
  const monthK = await getKline(stock.code, 103, 60);
  const finance = await getFinance(stock.code);
  const strategy = makeStrategy(basic, dayK, finance);

  return {
    ...basic,
    ...strategy,
    finance,
    kline: {
      day: dayK.slice(-80),
      week: weekK.slice(-60),
      month: monthK.slice(-40)
    }
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const q = String(req.query.q || "").trim();

  try {
    let targets = [];

    if (q) {
      const found = await searchStock(q);

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
        { code: "002938", name: "鹏鼎控股" }
      ];
    }

    const data = [];

    for (const stock of targets) {
      const item = await getStock(stock);
      if (item) data.push(item);
    }

    return res.status(200).json({
      success: true,
      updateTime: new Date().toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai"
      }),
      data
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: "行情源暂时不可用，请稍后重试",
      error: String(e)
    });
  }
};
