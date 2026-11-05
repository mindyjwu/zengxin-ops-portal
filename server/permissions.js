/**
 * 伺服器端權限：權限規則放在伺服器，不是只靠網頁畫面把按鈕藏起來。
 * 規則來源是網站的 ROLES（server/roles.json，測試會檢查兩邊一致）。
 */
const { roles, pages } = require('./roles.json');

const capsOf = role => (roles[role] && roles[role].perms) || {};
const can = (role, cap) => !!capsOf(role)[cap];

/** Express 中介層：沒有這個權限就回 403（並記在稽核紀錄） */
function requireCap(cap, audit) {
  return async (req, res, next) => {
    if (req.user && can(req.user.role, cap)) return next();
    if (audit) await audit(req, 'denied', req.originalUrl, { need: cap });
    res.status(403).json({ error: 'forbidden' });
  };
}

/** 頁面權限：不可／可檢視／可／可編輯（網站的職稱權限對照表） */
const pageCode = (role, key) => ((pages[key] || {})[role]) || '不可';
const canViewPage = (role, key) => pageCode(role, key) !== '不可';
const canEditPage = (role, key) => ['可', '可編輯'].includes(pageCode(role, key));

module.exports = { capsOf, can, requireCap, pageCode, canViewPage, canEditPage, roleKeys: Object.keys(roles) };
