
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const keyword = (req.query.q || "").trim();

  try {
    const url =
      "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=200&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14,f2,f3,f4,f5,f6,f7,f8,f9,f10,f15,f16,f17,f18";

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const json = await response.json();
    let list = json && json.data && json.data.diff ? json.data.diff : [];

    let data = list.map(function(item) {
      const price = Number(item.f2 || 0);
      const pct = Number(item.f3 || 0);
      const amount = Number(item.f6 || 0);
      const turnover = Number(item.f8 || 0);
      const volumeRatio = Number(item.f10 || 0);

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
      if (volumeRatio >= 2) {
        score += 20;
        reasons.push("量比放大，盘中有资金异动");
      }
      if (turnover >= 8) {
        score += 15;
        reasons.push("换手充分，短线活跃");
      }
      if (pct > 0) {
        score += 10;
        reasons.push("红盘强于市场");
      }

      let signal = "观察";
      if (score >= 75) signal = "强势观察，等确认买点";
      else if (score >= 55) signal = "短线活跃，谨慎跟踪";
      else if (score <= 25) signal = "弱势，不建议参与";

      return {
        code: item.f12,
        name: item.f14,
        price: price,
        pct: pct,
        change: item.f4,
        volume: item.f5,
        amount: amount,
        amplitude: item.f7,
        turnover: turnover,
        pe: item.f9,
        volumeRatio: volumeRatio,
        high: item.f15,
        low: item.f16,
        open: item.f17,
        preClose: item.f18,
        score: score,
        signal: signal,
        reason: reasons.join("；") || "暂无明显短线异动"
      };
    });

    if (keyword) {
      data = data.filter(function(x) {
        return x.code.includes(keyword) || x.name.includes(keyword);
      });
    }

    res.status(200).json({
      success: true,
      updateTime: new Date().toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai"
      }),
      data: data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "行情接口失败",
      error: String(error)
    });
  }
};
