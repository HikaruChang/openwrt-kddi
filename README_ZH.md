# KDDI au ひかり OpenWrt 插件

[日本語](README.md) | **简体中文**

面向 OpenWrt / ImmortalWrt **25.12 及以后（apk 包管理）** 的 KDDI 上网插件：让路由器以被替换掉的
KDDI 家庭网关（HGW）的身份直接接入 KDDI 线路，并提供 LuCI 图形界面。

* `kddi-hgw` —— 后端：netifd 协议处理程序、配置生成器、802.1X、rpcd 接口
* `luci-app-kddi` —— LuCI 界面（JS 版，附中文／日文翻译）

所有行为都来自对一次真实 KDDI 线路抓包的逐字节分析，结论如下。
抓包文件本身包含线路持有者的设备信息，**未包含在本仓库中**。

---

## 一、抓包分析结论

抓包环境：MacBook 串在 HGW 与光猫之间，2024-05-07，共 113 帧，
**只有上行方向、没有任何来自网络侧的应答**。

HGW 型号 `RT5770VW`（由 DHCPv6 FQDN 得知）；下文中 HGW 的 MAC 记为 `4c:ab:f8:xx:xx:xx`（已脱敏）。

### 1. IEEE 802.1X（EAPOL）

```
4c:ab:f8:xx:xx:xx → 01:80:c2:00:00:03   EAPOL, version 1 (802.1X-2001), type Start
```

HGW 在取地址之前反复发送 EAPOL-Start（约每 30 秒一次）。抓包中没有任何 EAP-Request，
因此**无法确定 EAP 方式（MD5 / TLS / TTLS…）与凭据**——认证凭据不可能从抓包中还原。

### 2. DHCPv4 DISCOVER（指纹核心）

| 字段 | 值 |
| --- | --- |
| IP TOS | `0xa0`（DSCP CS5） |
| bootp flags | `0x0000`（单播回应，未置广播位） |
| 选项 53 | Discover |
| 选项 51 | 请求租期 3600 秒 |
| 选项 57 | 最大报文 576 |
| 选项 55 | `1, 3, 6, 12, 15, 28, 43`（**没有 121**） |
| 选项 60 | `kddi-hgw1.1` ← KDDI 服务器据此识别 HGW |
| 选项 61 | **不发送** |
| 选项 12 | **不发送** |

原始字节（选项区）：

```
35 01 01                                  op53 Discover
33 04 00 00 0e 10                         op51 3600
39 02 02 40                               op57 576
37 07 01 03 06 0c 0f 1c 2b                op55 1,3,6,12,15,28,43
3c 0b 6b 64 64 69 2d 68 67 77 31 2e 31    op60 "kddi-hgw1.1"
ff                                        end
```

### 3. DHCPv6 SOLICIT

```
Client ID   DUID-LL  00030001 4cabf8xxxxxx     ← 由 WAN MAC 直接生成
ORO         23,24,56,67,82,95                   ← DNS / search / NTP / prefix-exclude /
                                                  SOL_MAX_RT / S46 MAP-T container
IA_PD       IAID 00000001, T1=0, T2=0           ← 只要前缀委派
IA_NA       无                                  ← 不申请地址
Option 20   Reconfigure Accept
Option 39   FQDN, flags 0x00, "RT5770VW"
```

另外 HGW 以 MAC 的 EUI-64 链路本地地址发送 Router Solicitation，
说明链路本地地址必须保持 EUI-64 生成方式。

### 4. 结论：换成第三方路由器需要满足

1. WAN 口 MAC 克隆为 HGW 的 WAN MAC；
2. DHCPv4 携带 option 60 = `kddi-hgw1.1`，且不带 option 61 / option 12；
3. DHCPv6 使用同一 MAC 生成的 DUID-LL、只申请 IA_PD；
4. 线路若强制 802.1X，需要有对应的账号／证书（抓包中不含这些信息）。

本插件把 1–3 做成一键配置，4 做成可选功能。

---

## 二、仓库结构

```
.
├── kddi-hgw/                     后端
│   ├── files/lib/netifd/proto/kddi.sh           netifd 协议：带 HGW 指纹的 DHCPv4 客户端
│   ├── files/usr/libexec/kddi/kddi-common.sh    指纹编码 helpers（DUID / FQDN / hex）
│   ├── files/usr/libexec/kddi/kddi-apply        生成 /etc/config/network（含备份／恢复）
│   ├── files/usr/libexec/kddi/kddi-dot1x-action wpa_cli 事件脚本，认证成功后重拨
│   ├── files/usr/libexec/rpcd/kddi              ubus 对象 kddi（status / action / log）
│   ├── files/etc/init.d/kddi                    procd 服务：wpa_supplicant + DSCP 规则
│   └── files/etc/config/kddi                    UCI 配置
├── luci-app-kddi/                LuCI 界面
│   ├── .../view/kddi/overview.js                状态总览 + 操作按钮 + 日志
│   ├── .../view/kddi/settings.js                设置（基本 / IPv6 / 高级 / 802.1X）
│   ├── .../protocol/kddi.js                     「接口」页面里的 kddi 协议表单
│   └── po/{zh_Hans,ja}/kddi.po                  中文／日文翻译
└── .github/workflows/build.yml   自动编译 apk 并发布 Release
```

### 各部分做了什么

**`proto kddi`（IPv4）** —— 直接控制 udhcpc 命令行，复刻抓包里的每一个选项：

```
udhcpc -p /var/run/udhcpc-<dev>.pid -s /lib/netifd/dhcp.script -f -t 0 -o -V "" -i <dev> \
       -O 1 -O 3 -O 6 -O 12 -O 15 -O 28 -O 43 \
       -x 0x3c:6b6464692d686777312e31 \
       -x lease:3600 \
       -C -R
```

* `-o` 去掉 udhcpc 自带的请求列表，再用 `-O` 精确重建 KDDI 的 option 55；
* `-V ""` 抑制 udhcpc 默认的 `udhcp 1.37.0` 厂商串，改由 `-x 0x3c:` 提供精确字节；
* `-C` 抑制 option 61（OpenWrt 自带的 `proto dhcp` **做不到**这一点，
  尤其在 `network.globals.dhcp_default_duid` 存在时一定会带上 option 61 —— 这也是本插件
  自带协议处理程序的主要原因）；
* 租约、路由、DNS 等仍由官方 `/lib/netifd/dhcp.script` 处理，不重复造轮子。

**IPv6** 使用官方 `proto dhcpv6`，由 `kddi-apply` 写入等价参数：

```
option reqaddress 'none'        →  -Nnone         只要前缀，不要地址
option reqprefix '0:00000001'   →  -P0:00000001   IA_PD，IAID 与 HGW 一致
option clientid '00030001…'     →  -c…            DUID-LL
option defaultreqopts '0'       →  -R             只请求下面这些
list reqopts 23 24 56 67 82 95  →  -r23 -r24 …
option noclientfqdn '1'         →  -f             关掉 odhcp6c 用主机名生成的 FQDN
list sendopts '39:0008…5700'    →  -x39:…         改为发送 "RT5770VW"
option ip6ifaceid 'eui64'                          链路本地地址保持 EUI-64
```

**MAP-E / MAP-T**：ORO 里带 95（S46 MAP-T container）。装了 `map` 包后，
odhcp6c 收到 S46 规则会自动创建 `wan6_4` 接口，本插件负责把它放进 wan 防火墙区域。

**802.1X**：以 `wpa_supplicant -D wired` 运行在 WAN 口，`eapol_version=1`、`ap_scan=0`、
`eapol_flags=0`，与抓包中的 802.1X-2001 一致；装了 `wpa-cli` 时还会在认证成功后自动 `ifup`。

---

## 三、安装

### 方式一：下载 Release（推荐）

在 [Releases](../../releases) 下载 `.apk`（`PKGARCH:=all`，与 CPU 架构无关）：

```sh
apk add --allow-untrusted ./kddi-hgw-*.apk ./luci-app-kddi-*.apk
apk add --allow-untrusted ./luci-i18n-kddi-zh-cn-*.apk        # 可选：中文界面
apk add map wpad-openssl wpa-cli                              # 可选：MAP-T / 802.1X
/etc/init.d/network restart      # 让 netifd 加载新的 kddi 协议（安装后仅需一次）
```

### 方式二：自行编译

```sh
cp -r kddi-hgw luci-app-kddi <openwrt>/package/kddi/

cd <openwrt>
./scripts/feeds update -a && ./scripts/feeds install -a      # 需要 luci feed
make menuconfig      # Network → WAN → kddi-hgw
                     # LuCI → Applications → luci-app-kddi
                     # LuCI → Translations → luci-i18n-kddi-zh-cn / -ja
make package/kddi-hgw/compile V=s
make package/luci-app-kddi/compile V=s
```

产物在 `bin/packages/<arch>/…`，25.12 之后是 `.apk` 文件。

apk 相关注意点（已在 Makefile 中处理）：

* `PKG_VERSION:=1.0.0` + `PKG_RELEASE:=1` → apk 版本 `1.0.0-r1`，符合 apk 的版本规则
  （不要用 `2024-05-07` 这类日期版本，apk 会拒绝）；
* `postinst` / `prerm` / `postrm` 会被转换成 apk 的 `post-install` / `pre-deinstall` /
  `post-deinstall`，脚本里仍需 `[ -n "$IPKG_INSTROOT" ] || …` 保护；
* `Package/kddi-hgw/conffiles` 声明了 `/etc/config/kddi`，由构建系统转换为对应包格式的
  配置文件标记，升级时保留用户配置；
* LuCI 包通过 `luci.mk` 构建，Makefile 里做了「在 luci feed 内 / 独立目录」两种路径的自适应，
  并固定了 `PKG_PO_VERSION`，避免 i18n 子包拿到由 git／文件时间推导出来的版本号。

---

## 四、使用

1. 记下 HGW 的 **WAN 侧 MAC**（机身标签或 HGW Web 界面），把 HGW 撤下、光猫直连路由器 WAN 口；
2. LuCI → 网络 → **KDDI au HIKARI** → 设置：
   * 启用；
   * WAN 设备选实际网口；
   * 填入 HGW MAC；
   * 厂商标识保持 `kddi-hgw1.1`、型号保持 `RT5770VW`（或改成自己 HGW 的型号）；
   * 线路需要 802.1X 时在「802.1X 认证」页填入方式与凭据；
3. 保存并应用（也可在「总览」页点「写入网络配置」）。插件会：
   * 先把 `/etc/config/network` 备份到 `/etc/kddi/backup/network-<时间戳>`（保留最近 5 份）；
   * 把 `wan` 改成 `proto kddi`、`wan6` 改成带 KDDI 参数的 `proto dhcpv6`；
   * 把 MAC 写进对应的 `config device`；
   * 确保两个接口在 `wan` 防火墙区域；
4. 「总览」页可以看到实时状态、正在发送的指纹（十六进制）以及相关日志；
   出问题可以点「恢复网络配置备份」一键回滚。

命令行等价操作：

```sh
uci set kddi.settings.enabled=1
uci set kddi.settings.device=eth1
uci set kddi.settings.macaddr=xx:xx:xx:xx:xx:xx
uci commit kddi
/etc/init.d/kddi apply       # 写入 network 并重载
/etc/init.d/kddi restore     # 回滚
/etc/init.d/kddi status      # JSON 状态
```

## 五、已知限制 / 注意事项

* **抓包只有上行**，没有网络侧应答，因此无法验证 DHCP 是否成功、也无法得知 802.1X 用的
  EAP 方式与凭据。若线路强制 802.1X 且凭据只存在于 HGW 内部（常见于内置证书的机型），
  第三方路由器无法完成认证，此时只能保留 HGW，把路由器接在其后面。
* 默认配置里不预填 MAC，请填自己 HGW 的地址；型号默认 `RT5770VW`，不同机型请自行修改。
* option 57（最大报文 576）无法精确复现：udhcpc 总是自行插入 option 57，其值在编译期
  由 busybox 决定（OpenWrt 默认小于 576），且无法通过命令行覆盖。该字段只影响服务器回包
  长度上限，不影响能否分配地址。
* DSCP CS5 标记默认关闭：udhcpc 的 DISCOVER 走 AF_PACKET 原始套接字，只有 nftables
  `netdev egress` 钩子（内核 ≥ 5.16）能标记，属于锦上添花，不影响取址。
* 安装 `map` 包后，netifd 会额外请求 ORO 94/95/96（官方 dhcpv6 协议的固定行为），
  比抓包多两项；如果要严格一致，可不装 `map`。
* MAC 克隆与设备伪装请在自己的线路、并符合与运营商合约的前提下使用。

## 六、捐赠

如果这个项目帮到了你，欢迎请作者喝杯咖啡。

**ETH / ERC-20**

```
0xdb61B2aD59bdF2A066B7fC9F00f86c3EBc4856B4
```

## 七、许可证与版权

```
Copyright (C) 2026 Hikaru Chang <i@rua.moe>
Powered by NyphexAI
SPDX-License-Identifier: GPL-3.0-or-later
```

本程序是自由软件：你可以依据自由软件基金会发布的 GNU 通用公共许可证（GNU General Public
License）第 3 版，或（依你选择）任何更新的版本，重新分发和／或修改本程序。

分发本程序是希望它能有用，但**不作任何担保**，甚至不含对适销性或特定用途适用性的默示担保。
详见 GNU 通用公共许可证。

本程序随附了一份 GNU 通用公共许可证（见 [LICENSE](LICENSE)）；如果没有，
请查阅 <https://www.gnu.org/licenses/>。
