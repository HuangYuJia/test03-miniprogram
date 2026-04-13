const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  // openid 字段在不同基础库/环境下可能大小写不一致，这里做兼容输出
  const openid =
    wxContext.OPENID ||
    wxContext.openid ||
    wxContext.wxopenid ||
    process.env.WX_OPENID ||
    null;

  return {
    openid,
    appid: wxContext.APPID || wxContext.appid || null,
    unionid: wxContext.UNIONID || wxContext.unionid || null,
    debug: {
      OPENID: wxContext.OPENID,
      openid: wxContext.openid,
      APPID: wxContext.APPID,
      UNIONID: wxContext.UNIONID,
      ENV_WX_OPENID: process.env.WX_OPENID
    }
  };
};

