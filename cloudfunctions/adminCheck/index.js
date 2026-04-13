const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid =
    wxContext.OPENID ||
    wxContext.openid ||
    wxContext.wxopenid ||
    process.env.WX_OPENID ||
    null;

  const isAdmin = Boolean(openid)
    ? (await db.collection("admins").where({ openid }).limit(1).get()).data
        .length > 0
    : false;

  return {
    isAdmin,
    openid
  };
};

