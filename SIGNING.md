# Windows 代码签名（可选）

Social Archiver 默认**不签名**。未签名时 Windows SmartScreen 可能拦截，处理方式见 [README.md](README.md)。

## 何时需要

- 长期发给他人 / 企业内部分发
- 希望减少 SmartScreen「更多信息 → 仍要运行」步骤

## 准备证书

1. 向 CA 购买 **Authenticode** 代码签名证书（个人或组织）
2. 导出为 `.pfx`，记住密码
3. **不要**把 `.pfx` 提交进 git

## 打包时签名

在运行 `npm.cmd run release:pack` 前设置环境变量（PowerShell 示例）：

```powershell
$env:CSC_LINK = "D:\certs\social-archiver.pfx"
$env:CSC_KEY_PASSWORD = "你的证书密码"
npm.cmd run release:pack
```

`electron-builder` 会对 `Social Archiver.exe`、安装包及捆绑的 `backend.exe` 尝试签名。

## 验证

```powershell
Get-AuthenticodeSignature "dist-electron\win-unpacked\Social Archiver.exe"
```

`Status` 应为 `Valid`（或受信任发布者）。

## 无证书时

继续使用便携 zip；收件人按 README 的 SmartScreen 说明操作即可。

## 与「检查更新」的关系

签名解决**信任**；**检查更新**（设置页 + `update_manifest_url`）解决**版本告知**。二者独立，可只做一个。

详见 [RELEASE.md](RELEASE.md)。
