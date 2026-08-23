# dsh-balance

在 DeepSeek Harness 网页版侧边栏底部，实时显示 DeepSeek 账户余额，点击可展开最近 5 天消费柱状图。

> DeepSeek account balance + 5-day spending chart widget for the DeepSeek Harness (dsh) web UI.

## 功能 Features

- **实时余额**：通过官方 `GET /user/balance` 接口读取账户总余额 / 赠送余额 / 充值余额，约 60 秒自动刷新。
- **5 天消费趋势**：按每日余额变动绘制的柱状图，从安装后开始累计。
- **零额外配置**：复用 `DEEPSEEK_API_KEY` 凭证（与模型共用同一密钥，经 `~/.dsh/.credentials.yaml` 或环境变量解析）。
- 侧边栏收起时只显示硬币图标，展开时显示金额。

## 安装 Install

```sh
dsh plugin --profile web add dsh-balance
```

重启 `dsh web`，刷新页面后，侧边栏底部（「设置」旁）即出现 💰 余额。

## 说明 Notes

- 余额为官方接口实时数据。
- 消费柱状图按「每日余额差」估算，从插件安装当天开始累积，随使用天数增加逐步填满 5 天。
- 若余额显示为「未配置 DEEPSEEK_API_KEY」，请在 设置 → 模型 中配置密钥，或设置 `DEEPSEEK_API_KEY` 环境变量。

## 开发 Develop

- 宿主端：`lib/index.js`（挂载 `GET /dsh-balance/status` 路由，仅用 Node 内置模块）。
- 客户端：`client/client.js`（注册 `sidebar.footer.action` 与 `shell.overlay` 两个插槽）。

## 许可 License

MIT
