window.__ModuleLoader__.load({ id: "dsh-balance", factory: (require) => {

  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

  const React = require("react");
  const h = React.createElement;
  const useState = React.useState;
  const useEffect = React.useEffect;

  const name = "dsh-balance";

  // ---------------------------------------------------------------------
  // Shared store: one polling loop serves both the footer chip and the
  // overlay popover, so the balance stays in sync without duplicate fetches.
  // ---------------------------------------------------------------------
  let state = { balance: null, daily: [], error: null, configured: true, open: false };
  const listeners = new Set();
  let polling = false;

  function getState() { return state; }
  function subscribe(fn) {
    listeners.add(fn);
    ensurePolling();
    return () => listeners.delete(fn);
  }
  function patch(part) {
    state = Object.assign({}, state, part);
    for (const fn of listeners) fn();
  }
  function toggleOpen() { patch({ open: !state.open }); }

  async function refresh() {
    try {
      const res = await fetch("/dsh-balance/status", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      patch({
        balance: data && data.balance ? data.balance : null,
        daily: Array.isArray(data && data.daily) ? data.daily : [],
        error: (data && data.error) || null,
        configured: !(data && data.configured === false),
      });
    } catch (err) {
      patch({ error: String((err && err.message) || err) });
    }
  }

  function ensurePolling() {
    if (polling) return;
    polling = true;
    refresh();
    setInterval(refresh, 60000);
  }

  function fmtMoney(n) {
    if (n === null || n === undefined || !Number.isFinite(Number(n))) return "--";
    return "¥" + Number(n).toFixed(2);
  }

  function useExternalState() {
    const [s, setS] = useState(getState());
    useEffect(() => subscribe(() => setS(getState())), []);
    return s;
  }

  // ---------------------------------------------------------------------
  // Sidebar footer chip: always-visible balance (wide) / coin icon (rail).
  // ---------------------------------------------------------------------
  function FooterAction(props) {
    const s = useExternalState();
    const wide = !!props.wide;
    const balance = s.balance;
    const label = balance ? fmtMoney(balance.total_balance) : (s.error ? "!" : "…");
    return h("button", {
      type: "button",
      title: "DeepSeek 余额与消费趋势",
      onClick: toggleOpen,
      style: {
        boxSizing: "border-box",
        cursor: "pointer",
        background: "transparent",
        border: "none",
        color: "var(--dsw-alias-label-primary)",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontFamily: "inherit",
        fontSize: "13px",
        lineHeight: "20px",
        padding: "4px 6px",
        borderRadius: "8px",
      },
    },
      h("span", { style: { fontSize: "14px", lineHeight: 1 } }, "💰"),
      wide ? h("span", { style: { fontWeight: 600, whiteSpace: "nowrap" } }, label) : null
    );
  }

  // ---------------------------------------------------------------------
  // 5-day bar chart.
  // ---------------------------------------------------------------------
  function BarChart(props) {
    const bars = (props.daily || []).map((d) => {
      const spend = d && typeof d.spend === "number" ? d.spend : null;
      const label = d && typeof d.day === "string" ? d.day.slice(5) : "";
      return { label, spend };
    });
    const max = Math.max(0, ...bars.map((b) => b.spend || 0));
    return h("div", {
      style: {
        display: "flex",
        alignItems: "flex-end",
        gap: "10px",
        height: "96px",
        padding: "0 4px",
        marginTop: "8px",
      },
    },
      bars.map((b, i) => {
        const hpx = max > 0 && b.spend !== null ? Math.max(3, Math.round((b.spend / max) * 72)) : 2;
        return h("div", {
          key: i,
          style: {
            flex: "1",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "4px",
            justifyContent: "flex-end",
            height: "100%",
          },
        },
          h("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)" } },
            b.spend !== null ? (b.spend >= 0.005 ? "¥" + b.spend.toFixed(2) : "0") : "—"),
          h("div", {
            style: {
              width: "100%",
              maxWidth: "34px",
              height: hpx + "px",
              borderRadius: "4px 4px 0 0",
              background: "var(--dsw-alias-state-business-primary, #4176e6)",
              opacity: b.spend !== null ? 1 : 0.15,
            },
          }),
          h("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-tertiary)" } }, b.label)
        );
      })
    );
  }

  // ---------------------------------------------------------------------
  // Overlay popover: balance details + 5-day chart.
  // ---------------------------------------------------------------------
  function Popover() {
    const s = useExternalState();
    useEffect(() => {
      if (s.open) refresh();
    }, [s.open]);
    if (!s.open) return null;
    const b = s.balance;
    return h("div", {
      style: {
        position: "fixed",
        left: "12px",
        bottom: "12px",
        zIndex: 2000,
        width: "264px",
        background: "var(--dsw-alias-bg-layer-2)",
        color: "var(--dsw-alias-label-primary)",
        border: "1px solid var(--dsw-alias-border-l2)",
        borderRadius: "14px",
        boxShadow: "var(--dsw-shadow-lv3)",
        padding: "14px",
        fontFamily: "inherit",
      },
    },
      h("div", {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        },
      },
        h("span", { style: { fontSize: "14px", fontWeight: 600 } }, "DeepSeek 账户"),
        h("button", {
          type: "button",
          onClick: () => patch({ open: false }),
          style: {
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "inherit",
            fontSize: "18px",
            lineHeight: 1,
          },
        }, "×")
      ),
      s.error
        ? h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)", marginBottom: "6px" } }, "错误：" + s.error)
        : s.configured === false
          ? h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } }, "未配置 DEEPSEEK_API_KEY")
          : null,
      b
        ? h("div", { style: { marginBottom: "6px" } },
          h("div", { style: { fontSize: "22px", fontWeight: 700, lineHeight: 1.2 } }, fmtMoney(b.total_balance)),
          h("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)", marginTop: "2px" } },
            "赠送 " + fmtMoney(b.granted_balance) + " · 充值 " + fmtMoney(b.topped_up_balance)))
        : h("div", { style: { fontSize: "14px", color: "var(--dsw-alias-label-secondary)" } }, "加载中…"),
      h("div", {
        style: {
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--dsw-alias-label-secondary)",
          marginTop: "10px",
        },
      }, "最近 5 天消费（按余额变动估算）"),
      h(BarChart, { daily: s.daily }),
      h("div", {
        style: {
          fontSize: "10px",
          color: "var(--dsw-alias-label-tertiary)",
          marginTop: "8px",
          lineHeight: 1.5,
        },
      }, "余额为官方接口实时数据；消费柱状图按每日余额差估算，从安装后开始累计。")
    );
  }

  function apply(ctx) {
    const slots = ctx.get("slots");
    if (slots === undefined) return;
    slots.inject("sidebar.footer.action", () => slots.register(
      { name: "sidebar.footer.action", id: "dsh-balance", order: 100, label: () => "余额" },
      (props) => h(FooterAction, props)
    ));
    slots.inject("shell.overlay", () => slots.register(
      { name: "shell.overlay", id: "dsh-balance-popover", order: 100, label: () => "余额面板" },
      () => h(Popover)
    ));
  }

  exports.inject = [];
  exports.name = name;
  exports.apply = apply;
  return module.exports;
}});
