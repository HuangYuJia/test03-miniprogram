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

  const { id, doc } = event || {};
  if (!doc || !doc.name) throw new Error("invalid doc");

  const payload = {
    name: String(doc.name).trim(),
    enabled: doc.enabled !== false,
    sort: Number(doc.sort || 0),
    updatedAt: Date.now()
  };

  if (id) {
    await db.collection("categories").doc(id).update({ data: payload });
    return { id };
  }

  const createdAt = Date.now();
  const addRes = await db.collection("categories").add({
    data: { ...payload, createdAt }
  });
  return { id: addRes._id };
};

