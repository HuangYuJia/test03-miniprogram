const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function requireAdmin(openid) {
  if (openid) {
    const resByOpenid = await db
      .collection("admins")
      .where({ openid })
      .limit(1)
      .get();
    if (resByOpenid.data && resByOpenid.data.length) return;
  }

  const err = new Error("forbidden");
  err.code = "FORBIDDEN";
  throw err;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid =
    wxContext.OPENID || wxContext.openid || wxContext.wxopenid || null;
  await requireAdmin(openid);

  const { id, enabled } = event || {};
  if (!id) throw new Error("missing id");

  await db.collection("products").doc(id).update({
    data: { enabled: Boolean(enabled), updatedAt: Date.now() }
  });
  return { id };
};

