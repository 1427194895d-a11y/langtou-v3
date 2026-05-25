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
        summary: "暂无季度业绩数据，可能是新股、退市股、北交所数据缺失，或财报接口暂未收录。"
      };
    }

    const revenue = Number(
      row.TOTAL_OPERATE_INCOME ||
      row.OPERATE_INCOME ||
      row.TOTAL_OPERATE_INCOME_YOY_VALUE ||
      0
    );

    const netProfit = Number(
      row.PARENT_NETPROFIT ||
      row.NETPROFIT ||
      row.DEDUCT_PARENT_NETPROFIT ||
      0
    );

    const revenueYoy = Number(
      row.TOTAL_OPERATE_INCOME_YOY ||
      row.OPERATE_INCOME_YOY ||
      0
    );

    const profitYoy = Number(
      row.PARENT_NETPROFIT_YOY ||
      row.NETPROFIT_YOY ||
      row.DEDUCT_PARENT_NETPROFIT_YOY ||
      0
    );

    const eps =
      row.BASIC_EPS ||
      row.EPSJB ||
      "-";

    const roe =
      row.WEIGHTAVG_ROE ||
      row.ROE ||
      row.JROE ||
      "-";

    const grossMargin =
      row.GROSS_PROFIT_RATIO ||
      row.XSMLL ||
      "-";

    const netMargin =
      row.NETPROFIT_RATIO ||
      row.XSJLL ||
      "-";

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
      reportName: row.REPORT_TYPE || row.REPORT_NAME || "最近季度",
      revenue,
      netProfit,
      revenueYoy,
      profitYoy,
      eps,
      roe,
      grossMargin,
      netMargin,
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
