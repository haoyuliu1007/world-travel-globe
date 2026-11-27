(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.ExpenseSplitter = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  /**
   * Compute net balances and minimum-transfer settlement plan for multi-user trip expenses.
   * Each expense: { id, payerId, amount, splitType: 'equal'|'custom'|'exclude', participants: [ids], customShares: { [id]: amount } }
   */
  function computeSettlements(members, expenses) {
    const list = Array.isArray(members) && members.length ? members : [{ id: 'self', name: 'Me' }];
    const balances = new Map();
    list.forEach((m) => balances.set(m.id, 0));

    let totalAmount = 0;
    (expenses || []).forEach((exp) => {
      const amt = Number(exp && exp.amount) || 0;
      if (amt <= 0) return;
      totalAmount += amt;
      const payer = exp.payerId || list[0].id;
      if (!balances.has(payer)) balances.set(payer, 0);
      balances.set(payer, balances.get(payer) + amt);

      if (exp.splitType === 'custom' && exp.customShares && typeof exp.customShares === 'object') {
        Object.keys(exp.customShares).forEach((uid) => {
          const share = Number(exp.customShares[uid]) || 0;
          if (!balances.has(uid)) balances.set(uid, 0);
          balances.set(uid, balances.get(uid) - share);
        });
      } else {
        const pool = Array.isArray(exp.participants) && exp.participants.length
          ? exp.participants
          : list.map((m) => m.id);
        const perHead = amt / pool.length;
        pool.forEach((uid) => {
          if (!balances.has(uid)) balances.set(uid, 0);
          balances.set(uid, balances.get(uid) - perHead);
        });
      }
    });

    const netRows = [];
    const debtors = [];
    const creditors = [];
    const nameMap = new Map(list.map((m) => [m.id, m.name || m.id]));

    balances.forEach((rawBal, uid) => {
      const bal = Math.round(rawBal * 100) / 100;
      netRows.push({ userId: uid, name: nameMap.get(uid) || uid, netBalance: bal });
      if (bal < -0.01) debtors.push({ userId: uid, name: nameMap.get(uid) || uid, amt: -bal });
      else if (bal > 0.01) creditors.push({ userId: uid, name: nameMap.get(uid) || uid, amt: bal });
    });

    debtors.sort((a, b) => b.amt - a.amt);
    creditors.sort((a, b) => b.amt - a.amt);

    const transfers = [];
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const d = debtors[i];
      const c = creditors[j];
      const pay = Math.round(Math.min(d.amt, c.amt) * 100) / 100;
      if (pay > 0.01) {
        transfers.push({ fromId: d.userId, fromName: d.name, toId: c.userId, toName: c.name, amount: pay });
      }
      d.amt -= pay;
      c.amt -= pay;
      if (d.amt <= 0.01) i++;
      if (c.amt <= 0.01) j++;
    }

    return {
      totalAmount: Math.round(totalAmount * 100) / 100,
      balances: netRows,
      transfers
    };
  }

  function settlementsToCsv(settlement, currency) {
    const cur = currency || 'CNY';
    const rows = [['From', 'To', `Amount (${cur})`]];
    (settlement.transfers || []).forEach((tr) => rows.push([tr.fromName, tr.toName, tr.amount]));
    return '\uFEFF' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  }

  return { computeSettlements, settlementsToCsv };
});
