const https = require("https");

function getText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://quote.eastmoney.com/"
      },
      timeout: 10000
    }, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    });

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
  return "0." + code;
}

async function searchCodeByName(keyword) {
  if (!keyword) return null;

  try {
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
      list.find(x => x.Code && x.Name && /^\d{6}$/.test(x.Code)) ||
      list.find(x => x.Code === keyword && x.Name);

    if (item) {
      return {
        code: item.Code,
        name: item.Name
      };
    }
  } catch (e) {}

  if (/^\d{6}$/.test(keyword)) {
    return {
      code: keyword,
      name: keyword
    };
  }

  return null;
}

async function getFinanceReport(code) {
  try {
    const url =
      "https://datacenter-web.eastmoney.com/api/data/v1/get?sortColumns=REPORT_DATE&sortTypes=-1&pageSize=1&pageNumber=1&reportName=RPT_LICO_FN_CPD&columns=ALL&filter=(SECURITY_CODE=\"" +
      code +
      "\")";

    const text = await getText(url);
    const json = JSON.parse(text);

    const row =
      json &&
      json.result &&
      json.result.data &&
      json.result.data.length
        ? json.result.data[0]
        : null;

    if (!row) {
      return {
        available: false,
        summary: "暂无季度业绩数据，可能是新股、北交所数据缺失，或财报接口暂未收录。"
      };
    }

    const revenue = Number(row.TOTAL_OPERATE_INCOME || row.OPERATE_INCOME || 0);
    const netProfit = Number(row.PARENT_NETPROFIT || row.NETPROFIT || row.DEDUCT_PARENT_NETPROFIT || 0);
    const revenueYoy = Number(row.TOTAL_OPERATE_INCOME_YOY || row.OPERATE_INCOME_YOY || 0);
    const profitYoy = Number(row.PARENT_NETPROFIT_YOY || row.NETPROFIT_YOY || row.DEDUCT_PARENT_NETPROFIT_YOY || 0);

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
      summary: "季度业绩接口暂时不可用，请稍后刷新。"
    };
  }
}

async function getKline(code) {
  try {
    const secid = eastMoneySecid(code);
    const url =
      "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=" +
      secid +
      "&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&end=20500101&lmt=80";

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
  } catch (e) {
    return [];
  }
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

  if (dif > dea && macd > 0 && macd > prevMacd) {
    signal = "MACD 金叉偏强，红柱放大";
  } else if (dif > dea && macd > 0 && macd < prevMacd) {
    signal = "MACD 多头但红柱缩短，注意动能减弱";
  } else if (dif < dea && macd < 0) {
    signal = "MACD 死叉偏弱";
  } else if (dif > dea) {
    signal = "MACD 多头修复中";
  } else if (dif < dea) {
    signal = "MACD 空头压制中";
  }

  return {
    dif: Number(dif.toFixed(3)),
    dea: Number(dea.toFixed(3)),
    macd: Number(macd.toFixed(3)),
    signal
  };
}

function parseTencent(text, stock) {
  const match = text.match(/="([^"]+)"/);
  if (!match) return null;

  const arr = match[1].split("~");

  const code = stock.code;
  const name = stock.name || code;
  const price = Number(arr[3] || 0);
  const preClose = Number(arr[4] || 0);
  const open = Number(arr[5] || 0);
  const high =
