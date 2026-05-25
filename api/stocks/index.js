function strategy(basic,ks,fin){
  const closes=ks.map(x=>x.close).filter(Boolean);
  const amounts=ks.map(x=>x.amount).filter(Boolean);
  const highs=ks.map(x=>x.high).filter(Boolean);
  const lows=ks.map(x=>x.low).filter(Boolean);

  const ma5=sma(closes,5);
  const ma10=sma(closes,10);
  const ma20=sma(closes,20);
  const ma30=sma(closes,30);
  const ma60=sma(closes,60);
  const avgAmount5=sma(amounts,5);
  const price=basic.price;

  let trendScore=0;
  let volumeScore=0;
  let macdScore=0;
  let klineScore=0;
  let financeScore=0;
  let riskScore=0;
  let chanceScore=0;

  const pos=[];
  const risk=[];
  const buy=[];
  const sell=[];

  if(ma5&&price>ma5){trendScore+=15;chanceScore+=10;pos.push("站上5日线，短线偏强");}
  else if(ma5){riskScore+=15;risk.push("跌破5日线，短线转弱");sell.push("跌破5日线，短线需减仓");}

  if(ma10&&price>ma10){trendScore+=10;pos.push("站上10日线，短线趋势保持");}
  else if(ma10){riskScore+=8;risk.push("跌破10日线，短线动能减弱");}

  if(ma20&&price>ma20){trendScore+=20;chanceScore+=15;pos.push("站上20日线，中短趋势较好");}
  else if(ma20){riskScore+=25;risk.push("跌破20日线，趋势防守位失守");sell.push("跌破20日线，退出观察");}

  if(ma30&&price>ma30){trendScore+=15;chanceScore+=10;pos.push("站上30日线，趋势结构未破坏");}
  else if(ma30){riskScore+=15;risk.push("跌破30日线，趋势偏弱");}

  if(ma60&&price>ma60){trendScore+=15;chanceScore+=10;pos.push("站上季度线，波段结构较强");}
  else if(ma60){riskScore+=20;risk.push("跌破季度线，波段偏弱");sell.push("跌破季度线，波段风险加大");}

  if(ma5&&ma20&&ma30&&ma5>ma20&&ma20>ma30){
    trendScore+=15;
    chanceScore+=10;
    pos.push("MA5>MA20>MA30，多头排列");
    buy.push("均线多头排列，趋势结构较好");
  }

  let ma5Distance=null;
  if(ma5){
    ma5Distance=+(((price-ma5)/ma5)*100).toFixed(2);

    if(ma5Distance>10){
      riskScore+=25;
      risk.push("偏离5日线超过10%，短线追高风险较大");
      sell.push("偏离5日线过大，不适合追高");
    }else if(ma5Distance>6){
      riskScore+=15;
      risk.push("偏离5日线较大，追高性价比下降");
      sell.push("短线偏离较大，适合等回踩");
    }else if(ma5Distance>=-1&&ma5Distance<=3&&ma20&&price>ma20){
      chanceScore+=15;
      buy.push("靠近5日线且仍在20日线上方，适合观察分歧低吸");
    }
  }

  let volumeSignal="量能中性";
  if(avgAmount5&&basic.amount>avgAmount5*1.8&&basic.pct>0){
    volumeScore+=25;
    trendScore+=15;
    chanceScore+=15;
    volumeSignal="强放量上涨，资金参与度高";
    buy.push("强放量上涨，资金关注度明显提升");
  }else if(avgAmount5&&basic.amount>avgAmount5*1.5&&basic.pct>0){
    volumeScore+=18;
    trendScore+=10;
    chanceScore+=10;
    volumeSignal="放量上涨，资金活跃";
    buy.push("放量上涨，短线活跃度提升");
  }else if(avgAmount5&&basic.amount>avgAmount5*1.5&&basic.pct<0){
    riskScore+=25;
    volumeScore-=10;
    volumeSignal="放量下跌，抛压较重";
    sell.push("放量下跌，优先控制风险");
  }else if(avgAmount5&&basic.amount<avgAmount5*0.65){
    riskScore+=8;
    volumeSignal="缩量，资金参与度下降";
  }

  let macdData={dif:null,dea:null,macd:null,signal:"简版未计算MACD"};
  if(typeof calcMacd==="function"){
    macdData=calcMacd(closes);
  }else if(typeof macd==="function"){
    macdData=macd(closes);
  }

  if(macdData.signal&&macdData.signal.includes("金叉")){
    macdScore+=20;
    trendScore+=10;
    chanceScore+=15;
    buy.push(macdData.signal);
  }else if(macdData.signal&&macdData.signal.includes("多头")){
    macdScore+=12;
    chanceScore+=8;
    buy.push(macdData.signal);
  }else if(macdData.signal&&macdData.signal.includes("死叉")){
    macdScore-=15;
    riskScore+=18;
    sell.push(macdData.signal);
  }else if(macdData.signal&&macdData.signal.includes("空头")){
    macdScore-=10;
    riskScore+=12;
    sell.push(macdData.signal);
  }

  const recentHigh=highs.length?sma(highs.slice(-20),1):null;
  const recentLow=lows.length?sma(lows.slice(-20),1):null;
  const lastClose=closes[closes.length-1];
  const prevClose=closes[closes.length-2];

  if(lastClose&&prevClose&&lastClose>prevClose&&basic.pct>0){
    klineScore+=8;
  }

  if(recentHigh&&price>=recentHigh*0.98&&basic.pct>0){
    klineScore+=15;
    chanceScore+=10;
    buy.push("接近20日新高，短线强度提升");
  }

  if(recentLow&&price<=recentLow*1.03){
    riskScore+=10;
    risk.push("接近20日低位，趋势仍需修复");
  }

  if(basic.high&&basic.low&&basic.open&&basic.price){
    const range=basic.high-basic.low;
    const upperShadow=basic.high-Math.max(basic.open,basic.price);
    if(range>0&&upperShadow/range>0.45&&basic.amount>0){
      riskScore+=15;
      sell.push("上影线较长，高位抛压需要注意");
    }
  }

  if(fin&&fin.available){
    if(fin.profitYoy>50&&fin.revenueYoy>20){
      financeScore+=25;
      chanceScore+=15;
      trendScore+=5;
      buy.push("季度业绩高增长，基本面有较强支撑");
    }else if(fin.profitYoy>30&&fin.revenueYoy>10){
      financeScore+=18;
      chanceScore+=10;
      buy.push("季度业绩增长较强");
    }else if(fin.profitYoy>0&&fin.revenueYoy>0){
      financeScore+=10;
    }else if(fin.profitYoy<-20){
      financeScore-=15;
      riskScore+=12;
      risk.push("季度净利润明显下滑，基本面承压");
    }
  }

  if(basic.pct>=9){
    chanceScore+=12;
    trendScore+=10;
    klineScore+=10;
    buy.push("涨停或接近涨停，短线辨识度提升");
  }

  if(basic.pct<=-5){
    riskScore+=20;
    sell.push("跌幅较大，短线风险上升");
  }

  const opportunityScore=Math.max(0,Math.min(100,trendScore+volumeScore+macdScore+klineScore+financeScore));
  riskScore=Math.max(0,Math.min(100,riskScore));

  let level="没机会";
  let levelClass="neutral";
  let positionAdvice="0%—15%，观察为主";
  let actionAdvice="暂时观察，等待重新放量或站上关键均线。";

  if(riskScore>=65){
    level="风险大";
    levelClass="danger";
    positionAdvice="0%—10%，已有仓位优先减仓或止损";
    actionAdvice="风险偏高，不建议新开仓；已有仓位以5日线、20日线为防守，破位严格减仓。";
  }else if(opportunityScore>=80&&trendScore>=65&&riskScore<=35){
    level="大机会";
    levelClass="great";
    positionAdvice="40%—70%，只适合分歧低吸或确认后持有，不建议无脑满仓";
    actionAdvice="趋势、量能、动能或基本面共振较强；已有仓位可持有，无仓不要追高，等回踩5日线或分歧转一致。";
  }else if(opportunityScore>=55&&trendScore>=45&&riskScore<=55){
    level="有机会";
    levelClass="chance";
    positionAdvice="20%—40%，适合小仓试错";
    actionAdvice="有一定机会，可小仓试错；跌破5日线先减仓，跌破20日线退出观察。";
  }

  if(basic.pct>=9&&ma5Distance!==null&&ma5Distance>6){
    actionAdvice="强势但短线偏离较大，不建议追高；已有仓位用5日线防守，炸板或放量滞涨先减仓。";
    positionAdvice="已有仓位持有观察；无仓谨慎，等待分歧低吸";
  }

  const stopLoss=ma20||ma30||ma5||null;
  const defenseLine=ma5||ma20||null;

  return {
    ma5,ma10,ma20,ma30,ma60,
    ma5Distance,
    avgAmount5,
    volumeSignal,
    macd:macdData,
    trendScore,
    volumeScore,
    macdScore,
    klineScore,
    financeScore,
    chanceScore:opportunityScore,
    riskScore,
    opportunityScore,
    level,
    levelClass,
    shortPressure:riskScore>=60?"高":riskScore>=35?"中":"低",
    positionText:pos.join("；")||"均线位置暂无明显优势",
    riskText:risk.join("；")||"暂未出现明显破位风险",
    buyPoint:buy.join("；")||"暂未出现高质量买点",
    sellPoint:sell.join("；")||"暂未出现强卖出信号",
    actionAdvice,
    positionAdvice,
    stopLoss:stopLoss?Number(stopLoss.toFixed(2)):null,
    defenseLine:defenseLine?Number(defenseLine.toFixed(2)):null
  };
}
