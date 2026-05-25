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
        res.on("data", c => (data += c));
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

function secid(code) {
  if (code.startsWith("6")) return "1." + code;
  return "0." + code;
}

async function searchStock(q) {
  if (!q) return null;

  try {
    const url =
      "https://searchapi.eastmoney.com/api/suggest/get?input=" +
      encodeURIComponent(q) +
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

  if (/^\d{6}$/.test(q)) {
    return {
      code: q,
      name: q
    };
  }

  return null;
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
    let summary = "业绩表现中性，需结合股价位置、行业景气和资金面判断。";

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
      summary = "净利润同比下滑明显，需警惕业绩压力。";
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
      summary: "季度业绩接口暂时不可用"
    };
  }
}

async function getKline(code) {
  try {
    const url =
      "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=" +
      secid(code) +
      "&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&end=20500101&lmt=120";

    const json = JSON.parse(await getText(url));

    const rows =
      json && json.data && json.data.klines ? json.data.klines : [];

    return rows.map(line => {
      const a = line.split(",");
      return {
        date: a[0],
        open: Number(a[1]),
        close: Number(a[2]),
        high: Number(a[3]),
        low: Number(a[4]),
        volume: Number(a[5]),
        amount: Number(a[6])
      };
    });
  } catch (e) {
    return [];
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
      signal: "历史数据不足"
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

  let signal = "MACD 中性";

  if (dif > dea && bar > 0 && bar > prev) {
    signal = "MACD 金叉偏强，红柱放大";
  } else if (dif > dea && bar > 0 && bar < prev) {
    signal = "MACD 多头但红柱缩短，注意动能减弱";
  } else if (dif < dea && bar < 0) {
    signal = "MACD 死叉偏弱";
  } else if (dif > dea) {
    signal = "MACD 多头修复中";
  } else if (dif < dea) {
    signal = "MACD 空头压制中";
  }

  return {
    dif: Number(dif.toFixed(3)),
    dea: Number(dea.toFixed(3)),
    macd: Number(bar.toFixed(3)),
    signal
  };
}

function parseQuote(text, stock) {
  const m = text.match(/="([^"]+)"/);
  if (!m) return null;

  const a = m[1].split("~");

  const price = Number(a[3] || 0);
  const preClose = Number(a[4] || 0);
  const pct = preClose
    ? Number((((price - preClose) / preClose) * 100).toFixed(2))
    : 0;

  return {
    code: stock.code,
    name: stock.name || stock.code,
    price,
    pct,
    amount: Number(a[37] || 0) * 10000,
    high: Number(a[33] || 0),
    low: Number(a[34] || 0),
    open: Number(a[5] || 0),
    preClose
  };
}

function makeStrategy(basic, klines, finance) {
  const closes = klines.map(x => x.close).filter(x => x > 0);
  const amounts = klines.map(x => x.amount).filter(x => x > 0);

  const price = basic.price;

  const ma5 = sma(closes, 5);
  const ma20 = sma(closes, 20);
  const ma30 = sma(closes, 30);
  const ma60 = sma(closes, 60);
  const avgAmount5 = sma(amounts, 5);
  const macd = calcMacd(closes);

  let trendScore = 0;
  let riskScore = 0;
  let chanceScore = 0;

  const pos = [];
  const risk = [];
  const buy = [];
  const sell = [];

  if (ma5 && price > ma5) {
    trendScore += 15;
    chanceScore += 10;
    pos.push("站上5日线，短线偏强");
  } else if (ma5) {
    riskScore += 15;
    risk.push("跌破5日线，短线转弱");
    sell.push("跌破5日线，短线需要减仓防守");
  }

  if (ma20 && price > ma20) {
    trendScore += 20;
    chanceScore += 15;
    pos.push("站上20日线，中短趋势较好");
  } else if (ma20) {
    riskScore += 25;
    risk.push("跌破20日线，趋势防守位失守");
    sell.push("跌破20日线，退出观察");
  }

  if (ma30 && price > ma30) {
    trendScore += 15;
    chanceScore += 10;
    pos.push("站上30日线，趋势结构未破坏");
  } else if (ma30) {
    riskScore += 15;
    risk.push("跌破30日线，趋势偏弱");
  }

  if (ma60 && price > ma60) {
    trendScore += 15;
    chanceScore += 10;
    pos.push("站上季度线，波段结构较强");
  } else if (ma60) {
    riskScore += 20;
    risk.push("跌破季度线，波段偏弱");
    sell.push("跌破季度线，波段趋势偏弱");
  }

  let ma5Distance = null;

  if (ma5) {
    ma5Distance = Number((((price - ma5) / ma5) * 100).toFixed(2));

    if (ma5Distance > 8) {
      riskScore += 20;
      risk.push("偏离5日线过大，追高风险上升");
      sell.push("偏离5日线过大，不适合追高");
    } else if (ma5Distance >= -1 && ma5Distance <= 3 && ma20 && price > ma20) {
      chanceScore += 15;
      buy.push("靠近5日线且仍在20日线上方，适合观察分歧低吸");
    }
  }

  let volumeSignal = "量能中性";

  if (avgAmount5 && basic.amount > avgAmount5 * 1.6 && basic.pct > 0) {
    trendScore += 15;
    chanceScore += 15;
    volumeSignal = "明显放量上涨，资金活跃";
    buy.push("放量上涨，资金关注度提高");
  } else if (avgAmount5 && basic.amount > avgAmount5 * 1.6 && basic.pct < 0) {
    riskScore += 25;
    volumeSignal = "放量下跌，抛压较重";
    sell.push("放量下跌，优先控制风险");
  } else if (avgAmount5 && basic.amount < avgAmount5 * 0.7) {
    riskScore += 8;
    volumeSignal = "缩量，资金参与度下降";
  }

  if (macd.signal.includes("金叉") || macd.signal.includes("多头")) {
    trendScore += 15;
    chanceScore += 15;
    buy.push(macd.signal);
  }

  if (macd.signal.includes("死叉") || macd.signal.includes("空头")) {
    riskScore += 18;
    sell.push(macd.signal);
  }

  if (finance && finance.available) {
    if (finance.profitYoy > 30 && finance.revenueYoy > 10) {
      chanceScore += 10;
      trendScore += 5;
      buy.push("季度业绩增长较强，基本面有支撑");
    } else if (finance.profitYoy < -20) {
      riskScore += 10;
      risk.push("季度净利润同比下滑，基本面承压");
    }
  }

  if (basic.pct >= 9) {
    chanceScore += 10;
    trendScore += 10;
    buy.push("涨停或接近涨停，短线辨识度提升");
  }

  let level = "没机会";
  let levelClass = "neutral";
  let positionAdvice = "0%—15%，观察为主";
  let actionAdvice = "暂时观察，等待重新放量或站上关键均线。";

  if (riskScore >= 65) {
    level = "风险大";
    levelClass = "danger";
    positionAdvice = "0%—10%，已有仓位优先减仓或止损";
    actionAdvice =
      "风险偏高，不建议新开仓；已有仓位以5日线、20日线为防守，破位严格减仓。";
  } else if (chanceScore >= 80 && trendScore >= 75 && riskScore <= 40) {
    level = "大机会";
    levelClass = "great";
    positionAdvice = "40%—70%，只适合分歧低吸或确认后持有，不建议无脑满仓";
    actionAdvice =
      "趋势、动能和基本面共振较强，已有仓位可持有；无仓不要追高，等回踩5日线或分歧转一致。";
  } else if (chanceScore >= 55 && trendScore >= 50 && riskScore <= 55) {
    level = "有机会";
    levelClass = "chance";
    positionAdvice = "20%—40%，适合小仓试错";
    actionAdvice =
      "有一定机会，可小仓试错；跌破5日线先减仓，跌破20日线退出观察。";
  }

  if (basic.pct >= 9 && ma5Distance !== null && ma5Distance > 6) {
    actionAdvice =
      "强势但短线偏离较大，不建议追高；已有仓位用5日线防守，炸板或放量滞涨先减仓。";
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
    positionText: pos.join("；") || "均线位置暂无明显优势",
    riskText: risk.join("；") || "暂未出现明显破位风险",
    buyPoint: buy.join("；") || "暂未出现高质量买点",
    sellPoint: sell.join("；") || "暂未出现强卖出信号",
    actionAdvice,
    positionAdvice,
    stopLoss: stopLoss ? Number(stopLoss.toFixed(2)) : null,
    defenseLine: defenseLine ? Number(defenseLine.toFixed(2)) : null
  };
}

async function getStock(stock) {
  const quote = await getText("https://qt.gtimg.cn/q=" + marketCode(stock.code));
  const basic = parseQuote(quote, stock);

  if (!basic || !basic.price) return null;

  const finance = await getFinance(stock.code);
  const klines = await getKline(stock.code);
  const strategy = makeStrategy(basic, klines, finance);

  return {
    ...basic,
    ...strategy,
    finance,
    kline: {
      day: klines.slice(-80)
    }
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const q = (req.query.q || "").trim();

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

    for (const s of targets) {
      const item = await getStock(s);
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
