window.__ModuleLoader__.load({ id: 'dsh-chinese', factory: (require) => { var module = { exports: {} }; var exports = module.exports;

/* dsh-chinese client half: one enable switch in the Settings page (top area,
   order 5), bound to the `chinese` settings namespace the host registers.
   Hand-written ModuleLoader bundle; React comes from the host module system. */
"use strict";

var React = require("react");

var NS = "dsh-chinese";
var CHINESE_NAMESPACE = "chinese";
var CHINESE_SECTION_ORDER = 5;

var zh = {
  "section.label": "\u4E2D\u6587\u56DE\u590D",
  "section.description": "\u8BA9 DeepSeek Harness \u7528\u4E2D\u6587\u8DDF\u4F60\u4EA4\u6D41\uFF08\u4EE3\u7801\u3001\u547D\u4EE4\u3001\u62A5\u9519\u539F\u6587\u4E0D\u53D8\uFF09\u3002\u968F\u65F6\u53EF\u5173\uFF1A",
  "section.enabled": "\u5F00\u542F\u4E2D\u6587\u56DE\u590D"
};
var en = {
  "section.label": "Chinese replies",
  "section.description": "Make every reply communicate in Chinese (code, commands and error text stay as-is). Toggle any time:",
  "section.enabled": "Enable Chinese replies"
};

var inject = ["slots", "settingsScope", "locale"];

function ChineseSection(props) {
  var scope = props.scope;
  var getEnabled = function () { return !!((scope && scope.getSnapshot && scope.getSnapshot().value) ? scope.getSnapshot().value.enabled : true); };
  var state = React.useState(getEnabled());
  var checked = state[0];
  var setChecked = state[1];

  React.useEffect(function () {
    if (!scope || typeof scope.subscribe !== "function") return undefined;
    return scope.subscribe(function () {
      var v = scope.getSnapshot().value;
      if (v !== undefined) setChecked(!!v.enabled);
    });
  }, [scope]);

  return React.createElement("section", { className: "dsh-chinese-section" },
    React.createElement("label", { className: "dsh-chinese-row", style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" } },
      React.createElement("input", {
        type: "checkbox",
        checked: checked,
        onChange: function (e) { setChecked(e.target.checked); if (scope) scope.set("enabled", e.target.checked); }
      }),
      React.createElement("span", null, props.t ? props.t("section.enabled") : "\u5F00\u542F\u4E2D\u6587\u56DE\u590D")
    ),
    React.createElement("p", { className: "dsh-chinese-desc", style: { color: "var(--dsw-alias-label-secondary)", margin: "4px 0 0 0", fontSize: 13 } },
      props.t ? props.t("section.description") : "\u8BA9 DeepSeek Harness \u7528\u4E2D\u6587\u8DDF\u4F60\u4EA4\u6D41\uFF08\u4EE3\u7801\u3001\u547D\u4EE4\u3001\u62A5\u9519\u539F\u6587\u4E0D\u53D8\uFF09\u3002"
    )
  );
}

function apply(ctx) {
  // Graceful degrade: without settings/slots services this client is a no-op
  // (no switch rendered); the host half keeps Chinese on regardless.
  if (!ctx || !ctx.settingsScope || !ctx.slots) { return; }
  var t = ctx.locale ? ctx.locale.bind(NS) : undefined;
  if (ctx.effect && ctx.locale) {
    ctx.effect(function () { t = ctx.locale.bind(NS); return ctx.locale.register(NS, { zh: zh, en: en }); }, "dsh-chinese: dictionaries");
  }

  var scope = ctx.settingsScope.bind({ namespace: CHINESE_NAMESPACE });

  ctx.slots.inject("settings.section", function () {
    return ctx.slots.register({
      name: "settings.section",
      id: "dsh-chinese",
      order: CHINESE_SECTION_ORDER,
      label: function () { return t ? t("section.label") : "\u4E2D\u6587\u56DE\u590D"; },
      locale: NS,
      inject: function () { return { scope: scope }; }
    }, ChineseSection);
  });
}

exports.inject = inject;
exports.apply = apply;
module.exports = exports;

return module.exports; } });
