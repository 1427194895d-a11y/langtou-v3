const https = require("https");

function getText(url){
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{headers:{"User-Agent":"Mozilla/5.0"}},res=>{
      let d="";
      res.on("data",c=>d+=c);
      res.on("end",()=>resolve(d));
    });
    req.on("error",reject);
  });
}

function market(code){
  if(code.startsWith("6")) return "sh"+code;
  if(code.startsWith("0")||code.startsWith("3")) return "sz"+code;
  if(code.startsWith("8")||code.startsWith("4")) return "bj"+code;
  return code;
}

async function searchStock(q){
  if(!q) return null;
  if(/^\d{6}$/.test(q)) return {code:q,name:q};

  try{
    const url="https://searchapi.eastmoney.com/api/suggest/get?input="+encodeURIComponent(q)+"&type=14&token=04840f2bd59f45d2bf7eff7e30d1a2a7";
    const json=JSON.parse(await getText(url));
    const list=json&&json.QuotationCodeTable&&json.QuotationCodeTable.Data?json.QuotationCodeTable.Data:[];
    const item=list.find(x=>x.Code&&x.Name&&/^\d{6}$/.test(x.Code))||list[0];
    if(item) return {code:item.Code,name:item.Name};
  }catch(e){}

  return null;
}

async function finance(code){
  try{
    const url='https://datacenter-web.eastmoney.com/api/data/v1/get?sortColumns=REPORT_DATE&sortTypes=-1&pageSize=1&pageNumber=1&reportName=RPT_LICO_FN_CPD&columns=ALL&filter=(SECURITY_CODE="'+code+'")';
    const json=JSON.parse(await getText(url));
    const row=json&&json.result&&json.result.data&&json.result.data[0];
    if(!row) return {available:false,summary:"暂无季度业绩数据"};
    const revenue=Number(row.TOTAL_OPERATE_INCOME||row.OPERATE_INCOME||0);
    const netProfit=Number(row.PARENT_NETPROFIT||row.NETPROFIT||0);
    const revenueYoy=Number(row.TOTAL_OPERATE_INCOME_YOY||row.OPERATE_INCOME_YOY||0);
    const profitYoy=Number(row.PARENT_NETPROFIT_YOY||row.NETPROFIT_YOY||0);
    return {
      available:true,
      reportDate:row.REPORT_DATE||"-",
      revenue,
      netProfit,
      revenueYoy,
      profitYoy,
      eps:row.BASIC_EPS||"-",
      roe:row.WEIGHTAVG_ROE||"-",
      level:profitYoy>30?"优秀":profitYoy>0?"稳健":profitYoy<-20?"偏弱":"中性",
      summary:"季度业绩已读取，仅供辅助参考。"
    };
  }catch(e){
    return {available:false,summary:"季度业绩接口暂时不可用"};
  }
}

function parseQuote(text,stock){
  const m=text.match(/="([^"]+)"/);
  if(!m) return null;
  const a=m[1].split("~");
  const price=Number(a[3]||0);
  const preClose=Number(a[4]||0);
  const pct=preClose?Number((((price-preClose)/preClose)*100).toFixed(2)):0;
  return {
    code:stock.code,
    name:stock.name||stock.code,
    price,
    pct,
    amount:Number(a[37]||0)*10000,
    high:Number(a[33]||0),
    low:Number(a[34]||0),
    open:Number(a[5]||0),
    preClose
  };
}

async function getStock(stock){
  const text=await getText("https://qt.gtimg.cn/q="+market(stock.code));
  const basic=parseQuote(text,stock);
  if(!basic||!basic.price) return null;

  const fin=await finance(stock.code);

  let level="没机会";
  let levelClass="neutral";
  let riskScore=30;
  let chanceScore=30;
  let trendScore=30;

  if(basic.pct>=9){
    level="有机会";
    levelClass="chance";
    chanceScore=70;
    trendScore=70;
  }else if(basic.pct<=-5){
    level="风险大";
    levelClass="danger";
    riskScore=80;
  }

  return {
    ...basic,
    ma5:null,
    ma20:null,
    ma30:null,
    ma60:null,
    ma5Distance:null,
    avgAmount5:null,
    volumeSignal:"简版接口已恢复，量能详情后续升级",
    macd:{dif:null,dea:null,macd:null,signal:"简版暂未计算MACD"},
    trendScore,
    riskScore,
    chanceScore,
    level,
    levelClass,
    shortPressure:riskScore>=60?"高":"低",
    positionText:"简版接口已恢复，均线详情后续升级",
    riskText:level==="风险大"?"跌幅较大，注意风险":"暂无明显破位风险",
    buyPoint:level==="有机会"?"短线强势，等待分歧低吸":"暂未出现高质量买点",
    sellPoint:level==="风险大"?"优先控制风险":"暂未出现强卖出信号",
    actionAdvice:level==="风险大"?"风险偏高，不建议新开仓。":"观察为主，不追高。",
    positionAdvice:level==="有机会"?"20%—40%，小仓试错":"0%—15%，观察为主",
    stopLoss:null,
    defenseLine:null,
    finance:fin,
    kline:{day:[]}
  };
}

module.exports=async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin","*");
  const q=(req.query.q||"").trim();

  try{
    let targets=[];
    if(q){
      const found=await searchStock(q);
      if(!found){
        return res.status(200).json({success:true,updateTime:new Date().toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"}),data:[]});
      }
      targets=[found];
    }else{
      targets=[
        {code:"300750",name:"宁德时代"},
        {code:"600519",name:"贵州茅台"},
        {code:"002594",name:"比亚迪"},
        {code:"002938",name:"鹏鼎控股"}
      ];
    }

    const data=[];
    for(const s of targets){
      const item=await getStock(s);
      if(item) data.push(item);
    }

    return res.status(200).json({
      success:true,
      updateTime:new Date().toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"}),
      data
    });
  }catch(e){
    return res.status(500).json({success:false,message:"接口错误",error:String(e)});
  }
};
