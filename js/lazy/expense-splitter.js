(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.ExpenseSplitter = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  const DEFAULT_RATES_TO_CNY = {
    CNY: 1, RMB: 1,
    USD: 7.25, EUR: 7.75, JPY: 0.0474, GBP: 9.17,
    HKD: 0.926, TWD: 0.225, CHF: 8.20, AUD: 4.72,
    CAD: 5.18, SGD: 5.40, KRW: 0.0052, THB: 0.209
  };

  function toCents(val) {
    return Math.round((Number(val) || 0) * 100);
  }

  function fromCents(cents) {
    return Number((cents / 100).toFixed(2));
  }

  function csvSafeCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[\s\t\r]*[=+\-@]/.test(s) || /^[\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  }

  function resolveCentsInBase(exp, fxToCny) {
    if (exp && Number.isFinite(Number(exp.amountCny))) return toCents(exp.amountCny);
    if (exp && Number.isFinite(Number(exp.amountRmb))) return toCents(exp.amountRmb);
    const amt = Number(exp && exp.amount) || 0;
    const cur = String((exp && exp.currency) || 'CNY').toUpperCase();
    const rate = (fxToCny && fxToCny[cur]) || DEFAULT_RATES_TO_CNY[cur] || 1;
    return toCents(amt * rate);
  }

  /**
   * Allocate `totalCents` across `weights` deterministically using largest-remainder
   * so the integer sum equals `totalCents` identically (zero cent conservation drift).
   */
  function allocateIntegerShares(totalCents, ids, rawSharesMap) {
    const n = ids.length;
    const out = new Map();
    if (!n) return out;
    const sign = totalCents < 0 ? -1 : 1;
    const absTotal = Math.abs(totalCents);

    let weights = ids.map((id) => Math.max(0, Number(rawSharesMap ? rawSharesMap[id] : 1) || 0));
    let wSum = weights.reduce((s, w) => s + w, 0);
    if (wSum <= 0) {
      weights = ids.map(() => 1);
      wSum = n;
    }

    const floors = weights.map((w, idx) => {
      const exact = (absTotal * w) / wSum;
      const fl = Math.floor(exact);
      return { id: ids[idx], floor: fl, rem: exact - fl, idx };
    });
    const used = floors.reduce((s, x) => s + x.floor, 0);
    let left = absTotal - used;
    const byRem = floors.slice().sort((a, b) => (b.rem - a.rem) || String(a.id).localeCompare(String(b.id)));
    for (let k = 0; k < byRem.length && left > 0; k++) {
      byRem[k].floor += 1;
      left--;
    }
    floors.forEach((f) => out.set(f.id, f.floor * sign));
    return out;
  }

  /**
   * Exact minimum-transfer settlement via bitmask DP subset partitioning (for N <= 12 non-zero balances),
   * falling back to greedy matching for larger groups.
   */
  function solveMinTransfers(debtors, creditors) {
    const items = [
      ...debtors.map((d) => ({ id: d.userId, name: d.name, cents: -d.cents })),
      ...creditors.map((c) => ({ id: c.userId, name: c.name, cents: c.cents }))
    ].filter((x) => x.cents !== 0);

    const n = items.length;
    if (n === 0) return { transfers: [], method: 'exact_optimal' };

    if (n <= 12) {
      const fullMask = (1 << n) - 1;
      const maskSum = new Int32Array(1 << n);
      for (let m = 1; m <= fullMask; m++) {
        const lsb = m & -m;
        const bit = Math.clz32(lsb) ^ 31;
        maskSum[m] = maskSum[m ^ lsb] + items[bit].cents;
      }

      const zeroMasks = [];
      for (let m = 1; m <= fullMask; m++) {
        if (maskSum[m] === 0) zeroMasks.push(m);
      }

      // dp[m] = max number of zero-sum disjoint subsets inside mask m
      const dp = new Int16Array(1 << n).fill(-1);
      const choice = new Int32Array(1 << n);
      dp[0] = 0;
      for (let m = 1; m <= fullMask; m++) {
        if (maskSum[m] !== 0) continue;
        dp[m] = 1;
        choice[m] = m;
        for (let s = (m - 1) & m; s > 0; s = (s - 1) & m) {
          if (maskSum[s] === 0 && dp[s] > 0 && dp[m ^ s] > 0 && dp[s] + dp[m ^ s] > dp[m]) {
            dp[m] = dp[s] + dp[m ^ s];
            choice[m] = s;
          }
        }
      }

      const groups = [];
      const extractGroups = (m) => {
        if (m === 0) return;
        const c = choice[m];
        if (!c || c === m) {
          groups.push(m);
          return;
        }
        extractGroups(c);
        extractGroups(m ^ c);
      };
      extractGroups(fullMask);

      const transfers = [];
      for (const gMask of groups) {
        const gDebtors = [];
        const gCreditors = [];
        for (let b = 0; b < n; b++) {
          if (!(gMask & (1 << b))) continue;
          if (items[b].cents < 0) gDebtors.push({ userId: items[b].id, name: items[b].name, cents: -items[b].cents });
          else gCreditors.push({ userId: items[b].id, name: items[b].name, cents: items[b].cents });
        }
        let i = 0, j = 0;
        while (i < gDebtors.length && j < gCreditors.length) {
          const d = gDebtors[i];
          const c = gCreditors[j];
          const pay = Math.min(d.cents, c.cents);
          if (pay > 0) {
            transfers.push({ fromId: d.userId, fromName: d.name, toId: c.userId, toName: c.name, amount: fromCents(pay) });
          }
          d.cents -= pay;
          c.cents -= pay;
          if (d.cents === 0) i++;
          if (c.cents === 0) j++;
        }
      }
      return { transfers, method: 'exact_optimal' };
    }

    // Greedy fallback for N > 12 active participants
    const dCopy = debtors.map((d) => Object.assign({}, d)).sort((a, b) => b.cents - a.cents);
    const cCopy = creditors.map((c) => Object.assign({}, c)).sort((a, b) => b.cents - a.cents);
    const transfers = [];
    let i = 0, j = 0;
    while (i < dCopy.length && j < cCopy.length) {
      const d = dCopy[i];
      const c = cCopy[j];
      const pay = Math.min(d.cents, c.cents);
      if (pay > 0) {
        transfers.push({ fromId: d.userId, fromName: d.name, toId: c.userId, toName: c.name, amount: fromCents(pay) });
      }
      d.cents -= pay;
      c.cents -= pay;
      if (d.cents === 0) i++;
      if (c.cents === 0) j++;
    }
    return { transfers, method: 'greedy_simplified' };
  }

  /**
   * Compute exact integer-cent balances and optimal/simplified settlements.
   */
  function computeSettlements(members, expenses, opts) {
    const rawList = Array.isArray(members) && members.length ? members : [{ id: 'self', name: 'Me' }];
    const dedupMap = new Map();
    rawList.forEach((m) => {
      if (m && m.id && !dedupMap.has(m.id)) dedupMap.set(m.id, m);
    });
    const list = [...dedupMap.values()];
    if (!list.length) list.push({ id: 'self', name: 'Me' });

    const fxToCny = (opts && opts.fxToCny) || DEFAULT_RATES_TO_CNY;
    const balCents = new Map();
    list.forEach((m) => balCents.set(m.id, 0));

    let totalCents = 0;
    const warnings = [];

    (expenses || []).forEach((exp) => {
      if (!exp || exp.settled) return;
      const amtCents = resolveCentsInBase(exp, fxToCny);
      if (amtCents === 0) return;

      totalCents += amtCents;
      const payer = exp.payerId || list[0].id;
      if (!balCents.has(payer)) balCents.set(payer, 0);
      balCents.set(payer, balCents.get(payer) + amtCents);

      if (exp.splitType === 'custom' && exp.customShares && typeof exp.customShares === 'object') {
        const shareIds = Object.keys(exp.customShares).filter((uid) => uid);
        const rawTotal = shareIds.reduce((s, uid) => s + Math.max(0, Number(exp.customShares[uid]) || 0), 0);
        const expectedAmt = Math.abs(amtCents) / 100;
        if (shareIds.length && Math.abs(rawTotal - expectedAmt) > 0.02) {
          warnings.push(`Expense ${exp.id || exp.note || ''} custom shares (${rawTotal.toFixed(2)}) scaled proportionally to match ${expectedAmt.toFixed(2)}`);
        }
        const alloc = allocateIntegerShares(amtCents, shareIds, exp.customShares);
        alloc.forEach((cents, uid) => {
          if (!balCents.has(uid)) balCents.set(uid, 0);
          balCents.set(uid, balCents.get(uid) - cents);
        });
      } else {
        const rawPool = Array.isArray(exp.participants) && exp.participants.length
          ? exp.participants
          : list.map((m) => m.id);
        const pool = [...new Set(rawPool.filter(Boolean))];
        const alloc = allocateIntegerShares(amtCents, pool, null);
        alloc.forEach((cents, uid) => {
          if (!balCents.has(uid)) balCents.set(uid, 0);
          balCents.set(uid, balCents.get(uid) - cents);
        });
      }
    });

    const netRows = [];
    const debtors = [];
    const creditors = [];
    const nameMap = new Map(list.map((m) => [m.id, m.name || m.id]));

    balCents.forEach((cents, uid) => {
      netRows.push({ userId: uid, name: nameMap.get(uid) || uid, netBalance: fromCents(cents) });
      if (cents < 0) debtors.push({ userId: uid, name: nameMap.get(uid) || uid, cents: -cents });
      else if (cents > 0) creditors.push({ userId: uid, name: nameMap.get(uid) || uid, cents });
    });

    const solved = solveMinTransfers(debtors, creditors);
    return {
      totalAmount: fromCents(totalCents),
      balances: netRows,
      transfers: solved.transfers,
      method: solved.method,
      warnings
    };
  }

  function settlementsToCsv(settlement, currency) {
    const cur = currency || 'CNY';
    const rows = [['From', 'To', `Amount (${cur})`]];
    (settlement.transfers || []).forEach((tr) => rows.push([tr.fromName, tr.toName, tr.amount]));
    return '\uFEFF' + rows.map((r) => r.map(csvSafeCell).join(',')).join('\r\n');
  }

  return { computeSettlements, settlementsToCsv };
});
