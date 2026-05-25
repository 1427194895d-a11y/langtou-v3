module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const q = (req.query.q || "300750").trim();

  return res.status(200).json({
    success: true,
    updateTime: new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai"
    }),
    data: [
      {
        code: q,
        name: q === "300750" ? "宁德时代" : q,
        price: 0,
        pct: 0,
        amount: 0,
        level: "没机会",
        levelClass: "neutral",
        trendScore: 0,
        riskScore: 0,
        chanceScore: 0,
        opportunityScore: 0,
        volumeScore: 0,
        macdScore: 0,
        klineScore: 0,
        financeScore: 0,
        volumeSignal: "接口恢复成功，行情增强版待重新接入",
        macd: {
          dif: null,
          dea: null,
          macd: null,
          signal: "接口恢复成功"
        },
        positionText: "接口恢复成功",
        riskText: "接口恢复成功",
        buyPoint: "暂不建议操作",
        sellPoint: "等待完整行情恢复",
        actionAdvice: "先恢复网站，再接入完整指标。",
        positionAdvice: "0%—15%，观察为主",
        finance: {
          available: false,
          summary: "接口恢复版"
        },
        kline: {
          day: []
        }
      }
    ]
  });
};
