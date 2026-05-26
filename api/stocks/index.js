const https = require("https");

const CACHE = new Map();
const CACHE_TTL = 30000;

function nowCn() {
  return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function cacheGet(key) {
  const item = CACHE.get(key);
  if (!item) return null;
  if (Date.now() - item.time > CACHE_TTL) {
    CACHE.delete(key);
    return null;
  }
  return item.value;
}

function cacheSet(key, value) {
  CACHE.set(key, { time: Date.now(), value });
}

function getText(url, timeout = 9000) {
  const cached = cacheGet(url);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: "https://quote.eastmoney.com/"
        },
        timeout
      },
      res => {
        let data = "";
        res.on("data", chunk => {
          data += chunk;
        });
        res.on("end", () => {
          cacheSet(url, data);
          resolve(data);
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });

    req.on("error", reject);
  });
}

async function getJson(url, timeout) {
  const text = await getText(url, timeout);
  return JSON.parse(text);
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function round(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return null;
  return Number(x.toFixed(2));
}

function secid(code) {
  code = String(code || "");
  if (code.startsWith("6")) return "1." + code;
  return "0." + code;
}

function marketPrefix(code) {
  code = String(code || "");
  if (code.startsWith("6")) return "sh" + code;
  if (code.startsWith("0") || code.startsWith("3")) return "sz" + code;
  if (code.startsWith("8") || code.startsWith("4")) return "bj" + code;
  return code;
}

function fallbackStocks() {
  return [
    { code: "300750", name: "宁德时代" },
    { code: "688981", name: "中芯国际" },
    { code: "603501", name: "韦尔股份" },
    { code: "300308", name: "中际旭创" },
    { code: "300502", name: "新易盛" },
    { code: "300394", name: "天孚通信" },
    { code: "002463", name: "沪电股份" },
    { code: "601138", name: "工业富联" },
    { code: "002371", name: "北方华创" },
    { code: "600584", name: "长电科技" },
    { code: "002156", name: "通富微电" },
    { code: "000977", name: "浪潮信息" },
    { code: "600309", name: "万华化学" },
    { code: "002594", name: "比亚迪" },
    { code: "600519", name: "贵州茅台" },
    { code: "000858", name: "五粮液" },
    { code: "601318", name: "中国平安" },
    { code: "600036", name: "招商银行" }
  ];
}

function sma(arr, len) {
  if (!arr || arr.length < len) return null;
  const part = arr.slice(arr.length - len);
  return round(part.reduce((a, b) => a + b, 0) / len);
}

function ema(arr, len) {
  if (!arr || !arr.length) return [];
  const k = 2 / (len + 1);
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
  const dea = deas[difs.length - 1];
  const bar = bars[bars.length - 1];
  const prev = bars[bars.length - 2];

  let signal = "MACD中性";

  if (dif > dea && bar > 0 && bar > prev) {
    signal = "MACD金叉偏强，红柱放大";
  } else if (dif > dea && bar > 0) {
    signal = "MACD多头，但动能需要继续观察";
  } else if (dif < dea && bar < 0 && bar < prev) {
    signal = "MACD死叉偏弱，绿柱放大";
  } else if (dif < dea) {
    signal = "MACD偏弱";
  }

  return {
    dif: Number(dif.toFixed(3)),
    dea: Number(dea.toFixed(3)),
    macd: Number(bar.toFixed(3)),
    signal
  };
}

async function searchStock(q) {
  const keyword = String(q || "").trim();

  if (!keyword) {
    return { code: "300750", name: "宁德时代" };
  }

  if (/^\d{6}$/.test(keyword)) {
    return {
      code: keyword,
      name: await getStockName(keyword, keyword)
    };
  }

  try {
    const url =
      "https://searchapi.eastmoney.com/api/suggest/get?input=" +
      encodeURIComponent(keyword) +
      "&type=14&token=04840f2bd59f45d2bf7eff7e30d1a2a7";

    const json = await getJson(url, 8000);

    const list =
      json && json.QuotationCodeTable && json.QuotationCodeTable.Data
        ? json.QuotationCodeTable.Data
        : [];

    const item = list.find(x => x.Code && /^\d{6}$/.test(x.Code));

    if (item) {
      return {
        code: item.Code,
        name: item.Name || item.Code
      };
    }
  } catch (e) {}

  return null;
}

async function getStockName(code, fallback) {
  if (fallback && fallback !== code && !String(fallback).includes("�")) {
    return fallback;
  }

  try {
    const url =
      "https://searchapi.eastmoney.com/api/suggest/get?input=" +
      encodeURIComponent(code) +
      "&type=14&token=04840f2bd59f45d2bf7eff7e30d1a2a7";

    const json = await getJson(url, 8000);

    const list =
      json && json.QuotationCodeTable && json.QuotationCodeTable.Data
        ? json.QuotationCodeTable.Data
        : [];

    const item = list.find(x => x.Code === code);

    if (item && item.Name) return item.Name;
  } catch (e) {}

  return fallback || code;
}

async function getQuote(stock) {
  try {
    const url =
      "https://push2.eastmoney.com/api/qt/stock/get?secid=" +
      secid(stock.code) +
      "&fields=f43,f44,f45,f46,f48,f57,f58,f60,f162,f167,f168,f170";

    const json = await getJson(url, 8000);
    const d = json && json.data ? json.data : null;

    if (d) {
      return {
        code: stock.code,
        name: stock.name && stock.name !== stock.code ? stock.name : d.f58 || stock.code,
        price: n(d.f43) / 100,
        pct: n(d.f170) / 100,
        open: n(d.f46) / 100,
        high: n(d.f44) / 100,
        low: n(d.f45) / 100,
        preClose: n(d.f60) / 100,
        amount: n(d.f48),
        turnover: n(d.f168) / 100,
        pe: n(d.f162) / 100,
        pb: n(d.f167) / 100
      };
    }
  } catch (e) {}

  try {
    const text = await getText("https://qt.gtimg.cn/q=" + marketPrefix(stock.code), 8000);
    const m = String(text || "").match(/="([^"]+)"/);

    if (m) {
      const a = m[1].split("~");
      const price = n(a[3]);
      const preClose = n(a[4]);
      const pct =
        preClose && price
          ? Number((((price - preClose) / preClose) * 100).toFixed(2))
          : n(a[32]);

      return {
        code: stock.code,
        name: stock.name || a[1] || stock.code,
        price,
        pct,
        open: n(a[5]),
        high: n(a[33]),
        low: n(a[34]),
        preClose,
        amount: n(a[37]) * 10000,
        turnover: n(a[38]),
        pe: n(a[39]),
        pb: n(a[46])
      };
    }
  } catch (e) {}

  return {
    code: stock.code,
    name: stock.name || stock.code,
    price: 0,
    pct: 0,
    open: 0,
    high: 0,
    low: 0,
    preClose: 0,
    amount: 0,
    turnover: 0,
    pe: 0,
    pb: 0
  };
}

async function getKline(code, klt, limit) {
  try {
    const url =
      "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=" +
      secid(code) +
      "&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=" +
      klt +
      "&fqt=1&end=20500101&lmt=" +
      limit;

    const json = await getJson(url, 8000);

    const rows =
      json && json.data && json.data.klines
        ? json.data.klines
        : [];

    return rows.map(line => {
      const a = String(line).split(",");
      return {
        date: a[0],
        open: n(a[1]),
        close: n(a[2]),
        high: n(a[3]),
        low: n(a[4]),
        volume: n(a[5]),
        amount: n(a[6]),
        pct: n(a[8]),
        turnover: n(a[10])
      };
    });
  } catch (e) {
    return [];
  }
}

function recentHigh(rows, len) {
  if (!rows || rows.length < 2) return null;

  const part = rows.slice(Math.max(0, rows.length - len - 1), rows.length - 1);
  if (!part.length) return null;

  return round(Math.max(...part.map(x => x.high || 0)));
}

function recentLow(rows, len) {
  if (!rows || rows.length < 2) return null;

  const part = rows.slice(Math.max(0, rows.length - len - 1), rows.length - 1);
  const lows = part.map(x => x.low || 0).filter(Boolean);

  if (!lows.length) return null;

  return round(Math.min(...lows));
}

function analyze(basic, dayK) {
  const closes = dayK.map(x => x.close).filter(Boolean);
  const amounts = dayK.map(x => x.amount).filter(Boolean);

  const price = basic.price;

  const ma5 = sma(closes, 5);
  const ma10 = sma(closes, 10);
  const ma20 = sma(closes, 20);
  const ma30 = sma(closes, 30);
  const ma60 = sma(closes, 60);

  const avgAmount5 = sma(amounts, 5);
  const macd = calcMacd(closes);

  const high20 = recentHigh(dayK, 20);
  const high60 = recentHigh(dayK, 60);
  const low20 = recentLow(dayK, 20);
  const low60 = recentLow(dayK, 60);

  const supports = [ma5, ma10, ma20, ma30, ma60, low20, low60, basic.low]
    .filter(x => x && price && x < price)
    .sort((a, b) => b - a);

  const pressures = [ma5, ma10, ma20, ma30, ma60, high20, high60, basic.high]
    .filter(x => x && price && x > price)
    .sort((a, b) => a - b);

  const support = supports.length ? round(supports[0]) : null;
  const pressure = pressures.length ? round(pressures[0]) : null;

  let trendScore = 0;
  let volumeScore = 0;
  let macdScore = 0;
  let klineScore = 0;
  let riskScore = 0;

  const pos = [];
  const buy = [];
  const risk = [];
  const sell = [];

  if (ma5 && price > ma5) {
    trendScore += 12;
    pos.push("站上5日线，短线偏强");
  } else if (ma5) {
    riskScore += 10;
    risk.push("跌破5日线，短线转弱");
  }

  if (ma20 && price > ma20) {
    trendScore += 18;
    pos.push("站上20日线，中短趋势较好");
  } else if (ma20) {
    riskScore += 20;
    risk.push("跌破20日线，趋势防守位失守");
    sell.push("跌破20日线，退出观察");
  }

  if (ma30 && price > ma30) {
    trendScore += 10;
    pos.push("站上30日线，趋势结构未破坏");
  } else if (ma30) {
    riskScore += 10;
    risk.push("跌破30日线，趋势偏弱");
  }

  if (ma60 && price > ma60) {
    trendScore += 15;
    pos.push("站上60日线，波段结构较强");
  } else if (ma60) {
    riskScore += 15;
    risk.push("跌破60日线，波段偏弱");
  }

  if (ma5 && ma20 && ma30 && ma5 > ma20 && ma20 > ma30) {
    trendScore += 15;
    buy.push("均线多头排列，趋势结构较好");
  }

  if (basic.amount > 10000000000) {
    volumeScore += 20;
    buy.push("成交额超过100亿，资金关注度高");
  } else if (basic.amount > 3000000000) {
    volumeScore += 15;
    buy.push("成交额超过30亿，资金较活跃");
  } else if (basic.amount > 1000000000) {
    volumeScore += 10;
    buy.push("成交额超过10亿，有资金关注");
  }

  if (avgAmount5 && basic.amount > avgAmount5 * 1.5 && basic.pct > 0) {
    volumeScore += 15;
    buy.push("相对5日均额放量上涨");
  }

  if (basic.turnover >= 3 && basic.turnover <= 15 && basic.pct > 0) {
    klineScore += 12;
    buy.push("换手活跃，短线辨识度提升");
  } else if (basic.turnover > 20) {
    riskScore += 15;
    risk.push("换手过高，短线分歧较大");
  }

  if (basic.pct > 0 && basic.pct < 5) {
    klineScore += 10;
    buy.push("上涨但未明显过热");
  } else if (basic.pct >= 5 && basic.pct < 9.8) {
    klineScore += 15;
    buy.push("涨幅较强，短线资金进攻明显");
  } else if (basic.pct >= 9.8) {
    klineScore += 15;
    riskScore += 8;
    buy.push("涨停或接近涨停，短线辨识度高");
    risk.push("涨幅过大，追高风险增加");
  } else if (basic.pct <= -5) {
    riskScore += 20;
    sell.push("跌幅较大，短线风险上升");
  }

  if (macd.signal.includes("金叉")) {
    macdScore += 18;
    buy.push(macd.signal);
  } else if (macd.signal.includes("多头")) {
    macdScore += 10;
    buy.push(macd.signal);
  } else if (macd.signal.includes("死叉") || macd.signal.includes("偏弱")) {
    macdScore -= 10;
    riskScore += 12;
    risk.push(macd.signal);
  }

  const opportunityScore = Math.max(
    0,
    Math.min(100, trendScore + volumeScore + macdScore + klineScore)
  );

  riskScore = Math.max(0, Math.min(100, riskScore));

  let level = "观察中";
  let levelClass = "neutral";

  if (riskScore >= 65) {
    level = "风险大";
    levelClass = "danger";
  } else if (opportunityScore >= 75 && riskScore <= 40) {
    level = "大机会";
    levelClass = "great";
  } else if (opportunityScore >= 45 && riskScore <= 55) {
    level = "有机会";
    levelClass = "chance";
  } else if (opportunityScore >= 25 && riskScore <= 60) {
    level = "活跃观察";
    levelClass = "chance";
  }

  return {
    ma5,
    ma10,
    ma20,
    ma30,
    ma60,

    high20,
    high60,
    low20,
    low60,

    support,
    pressure,
    strongSupport: supports.length ? round(supports[supports.length - 1]) : support,
    strongPressure: pressures.length ? round(pressures[pressures.length - 1]) : pressure,

    avgAmount5,
    macd,

    trendScore,
    volumeScore,
    macdScore,
    klineScore,
    financeScore: 0,

    opportunityScore,
    chanceScore: opportunityScore,
    riskScore,

    level,
    levelClass,
    shortPressure: riskScore >= 60 ? "高" : riskScore >= 35 ? "中" : "低",

    positionText: pos.join("；") || "均线位置暂无明显优势",
    volumeSignal:
      volumeScore >= 25
        ? "量能明显活跃"
        : volumeScore >= 10
        ? "量能偏活跃"
        : "量能中性",
    buyPoint: buy.join("；") || "暂未出现高质量买点",
    riskText: risk.join("；") || "暂未出现明显破位风险",
    sellPoint: sell.join("；") || "暂未出现强卖出信号",

    stopLoss: ma20 || ma30 || ma5 || support || basic.low || null,
    defenseLine: ma5 || ma20 || support || basic.low || null,

    positionAdvice:
      level === "大机会"
        ? "30%—50%，只适合分批参与，不能无脑满仓"
        : level === "有机会"
        ? "15%—30%，小仓试错"
        : level === "活跃观察"
        ? "0%—20%，先观察分歧和回踩"
        : level === "风险大"
        ? "0%—10%，已有仓位优先减仓或止损"
        : "0%—15%，观察为主",

    actionAdvice:
      level === "大机会"
        ? "趋势和资金较强，但仍要等回踩或确认，不建议追高满仓。"
        : level === "有机会"
        ? "有一定机会，可小仓试错，跌破关键均线要控制风险。"
        : level === "活跃观察"
        ? "资金活跃但确认度不够，适合加入观察，不适合重仓追高。"
        : level === "风险大"
        ? "风险偏高，不建议新开仓。"
        : "暂时观察，等待重新放量或站上关键均线。"
  };
}

async function getStock(stock) {
  const name = await getStockName(stock.code, stock.name);

  const base = {
    code: stock.code,
    name
  };

  const [basic, dayK] = await Promise.all([
    getQuote(base),
    getKline(stock.code, 101, 120)
  ]);

  basic.name = name;

  const strategy = analyze(basic, dayK);

  return {
    ...basic,
    ...strategy,
    finance: {
      available: false,
      level: "暂不读取",
      summary: "V8.6稳定版暂时关闭复杂财务接口，优先保证均线、MACD、支撑压力和全市场大机会榜"
    },
    kline: {
      day: dayK.slice(-80),
      week: [],
      month: []
    }
  };
}

async function getMarketCandidates() {
  const all = [];

  try {
    const pages = [1, 2, 3, 4, 5, 6, 7, 8];

    for (const page of pages) {
      try {
        const url =
          "https://push2.eastmoney.com/api/qt/clist/get?pn=" +
          page +
          "&pz=500&po=1&np=1&fltt=2&invt=2&fid=f6&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14,f2,f3,f6,f8";

        const json = await getJson(url, 8000);

        const list =
          json && json.data && json.data.diff
            ? json.data.diff
            : [];

        for (const x of list) {
          all.push({
            code: String(x.f12 || ""),
            name: String(x.f14 || ""),
            price: n(x.f2),
            pct: n(x.f3),
            amount: n(x.f6),
            turnover: n(x.f8)
          });
        }
      } catch (e) {}
    }

    const arr = all
      .filter(x => {
        if (!/^\d{6}$/.test(x.code)) return false;
        if (!x.name) return false;
        if (x.name.includes("ST")) return false;
        if (x.name.includes("*ST")) return false;
        if (x.name.includes("退")) return false;
        if (x.price <= 2) return false;
        if (x.amount < 300000000) return false;
        return true;
      })
      .map(x => {
        let fastScore = 0;

        if (x.amount >= 10000000000) fastScore += 35;
        else if (x.amount >= 5000000000) fastScore += 28;
        else if (x.amount >= 3000000000) fastScore += 22;
        else if (x.amount >= 1000000000) fastScore += 15;

        if (x.pct >= 3 && x.pct < 9.8) fastScore += 25;
        else if (x.pct > 0 && x.pct < 3) fastScore += 12;
        else if (x.pct >= 9.8) fastScore += 18;
        else if (x.pct < 0) fastScore -= 10;

        if (x.turnover >= 3 && x.turnover <= 15) fastScore += 20;
        else if (x.turnover > 15 && x.turnover <= 25) fastScore += 8;
        else if (x.turnover > 25) fastScore -= 10;

        return {
          ...x,
          fastScore
        };
      })
      .sort((a, b) => b.fastScore - a.fastScore);

    if (arr.length) return arr;
  } catch (e) {}

  return fallbackStocks();
}

async function handleRank() {
  let candidates = [];

  try {
    candidates = await getMarketCandidates();
  } catch (e) {
    candidates = fallbackStocks();
  }

  if (!candidates || !candidates.length) {
    candidates = fallbackStocks();
  }

  const deepList = candidates.slice(0, 30);
  const ranked = [];

  for (const stock of deepList) {
    try {
      const item = await getStock(stock);
      if (item) ranked.push(item);
    } catch (e) {}
  }

  if (!ranked.length) {
    for (const stock of fallbackStocks()) {
      try {
        const item = await getStock(stock);
        if (item) ranked.push(item);
      } catch (e) {}
    }
  }

  ranked.sort((a, b) => {
    const sa =
      (a.opportunityScore || 0) -
      (a.riskScore || 0) * 0.8 +
      (a.trendScore || 0) * 0.35 +
      (a.volumeScore || 0) * 0.35 +
      (a.klineScore || 0) * 0.25 +
      (a.macdScore || 0) * 0.2;

    const sb =
      (b.opportunityScore || 0) -
      (b.riskScore || 0) * 0.8 +
      (b.trendScore || 0) * 0.35 +
      (b.volumeScore || 0) * 0.35 +
      (b.klineScore || 0) * 0.25 +
      (b.macdScore || 0) * 0.2;

    return sb - sa;
  });

  const bigChanceList = ranked.filter(x => {
    const opportunity = x.opportunityScore || 0;
    const risk = x.riskScore || 0;
    const trend = x.trendScore || 0;
    const volume = x.volumeScore || 0;
    const kline = x.klineScore || 0;

    return (
      opportunity >= 70 &&
      risk <= 40 &&
      trend >= 30 &&
      volume >= 15 &&
      kline >= 10
    );
  });

  const output = bigChanceList.map(x => ({
    ...x,
    level: "大机会",
    levelClass: "great",
    positionAdvice: "30%—50%，只适合分批参与；不建议单票满仓",
    actionAdvice:
      "全市场大机会筛选通过，但仍要分批买入，跌破防守线及时减仓，不能无脑满仓。"
  }));

  return {
    success: true,
    mode: "rank",
    title: "全市场大机会榜",
    updateTime: nowCn(),
    scanInfo: {
      market: "全市场扫描：沪深A股 + 创业板 + 科创板",
      candidateCount: candidates.length,
      deepAnalyzeCount: deepList.length,
      finalCount: output.length,
      rule: "只显示大机会：机会分≥70，风险分≤40，趋势分≥30，量能分≥15，K线分≥10"
    },
    data: output
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    const q = String((req.query && req.query.q) || "").trim();
    const rank = String((req.query && req.query.rank) || "").trim();

    if (rank === "1") {
      const result = await handleRank();
      return res.status(200).json(result);
    }

    const found = await searchStock(q || "300750");

    if (!found || !found.code) {
      return res.status(200).json({
        success: true,
        updateTime: nowCn(),
        data: []
      });
    }

    const item = await getStock(found);

    return res.status(200).json({
      success: true,
      updateTime: nowCn(),
      data: item ? [item] : []
    });
  } catch (e) {
    return res.status(200).json({
      success: false,
      updateTime: nowCn(),
      message: "后端异常",
      error: String(e),
      data: []
    });
  }
};
