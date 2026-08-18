# KDDI auひかり 用 OpenWrt プラグイン

**日本語** | [简体中文](README_ZH.md)

OpenWrt / ImmortalWrt **25.12 以降（apk パッケージ管理）** 向けのプラグインです。
撤去したホームゲートウェイ（HGW）になりすまして KDDI 網へ直接接続し、LuCI の GUI から設定できます。

* `kddi-hgw` — バックエンド（netifd プロトコルハンドラ、設定生成、802.1X、rpcd インターフェース）
* `luci-app-kddi` — LuCI 画面（JS 版、日本語／簡体字の翻訳付き）

動作はすべて実回線のパケットキャプチャをバイト単位で解析した結果に基づいています。
キャプチャそのものは回線契約者の機器情報を含むため、**このリポジトリには含めていません**。

---

## 1. キャプチャ解析の結果

HGW と回線終端装置の間に MacBook を挟んで取得。2024-05-07、113 フレーム、
**上り方向のみで網側からの応答は 1 つも含まれていません**。

HGW の型番は `RT5770VW`（DHCPv6 の FQDN より判明）。以下 HGW の MAC は `4c:ab:f8:xx:xx:xx` と表記します（伏字）。

### 1.1 IEEE 802.1X（EAPOL）

```
4c:ab:f8:xx:xx:xx → 01:80:c2:00:00:03   EAPOL, version 1 (802.1X-2001), type Start
```

HGW はアドレス取得の前に EAPOL-Start を約 30 秒ごとに繰り返し送出しています。
EAP-Request が 1 つも含まれていないため、**EAP 方式（MD5 / TLS / TTLS …）も認証情報も特定できません**。
認証情報をキャプチャから復元することは原理的に不可能です。

### 1.2 DHCPv4 DISCOVER（識別情報の中核）

| フィールド | 値 |
| --- | --- |
| IP TOS | `0xa0`（DSCP CS5） |
| bootp flags | `0x0000`（ユニキャスト応答を要求） |
| オプション 53 | Discover |
| オプション 51 | リース時間 3600 秒を要求 |
| オプション 57 | 最大メッセージ長 576 |
| オプション 55 | `1, 3, 6, 12, 15, 28, 43`（**121 は無し**） |
| オプション 60 | `kddi-hgw1.1` ← KDDI 側はこの文字列で HGW を判別 |
| オプション 61 | **送信しない** |
| オプション 12 | **送信しない** |

実際のバイト列（オプション部）:

```
35 01 01                                  op53 Discover
33 04 00 00 0e 10                         op51 3600
39 02 02 40                               op57 576
37 07 01 03 06 0c 0f 1c 2b                op55 1,3,6,12,15,28,43
3c 0b 6b 64 64 69 2d 68 67 77 31 2e 31    op60 "kddi-hgw1.1"
ff                                        end
```

### 1.3 DHCPv6 SOLICIT

```
Client ID   DUID-LL  00030001 4cabf8xxxxxx     ← WAN 側 MAC からそのまま生成
ORO         23,24,56,67,82,95                   ← DNS / search / NTP / prefix-exclude /
                                                  SOL_MAX_RT / S46 MAP-T container
IA_PD       IAID 00000001, T1=0, T2=0           ← プレフィックス委任のみ要求
IA_NA       無し                                ← アドレスは要求しない
Option 20   Reconfigure Accept
Option 39   FQDN, flags 0x00, "RT5770VW"
```

さらに HGW は MAC から生成した EUI-64 のリンクローカルアドレスで Router Solicitation を送信しており、
リンクローカルアドレスは EUI-64 のままにしておく必要があります。

### 1.4 まとめ：市販ルーターに置き換えるための条件

1. WAN ポートの MAC を HGW の WAN 側 MAC に複製する；
2. DHCPv4 で option 60 = `kddi-hgw1.1` を送り、option 61 / option 12 は送らない；
3. DHCPv6 は同じ MAC から作った DUID-LL を使い、IA_PD のみ要求する；
4. 回線が 802.1X を要求する場合は、対応する認証情報／証明書が必要（キャプチャには含まれない）。

本プラグインは 1〜3 をワンクリック設定にし、4 をオプション機能として実装しています。

---

## 2. リポジトリ構成

```
.
├── kddi-hgw/                     バックエンド
│   ├── files/lib/netifd/proto/kddi.sh           netifd プロトコル：HGW 識別情報付き DHCPv4 クライアント
│   ├── files/usr/libexec/kddi/kddi-common.sh    識別情報のエンコード（DUID / FQDN / hex）
│   ├── files/usr/libexec/kddi/kddi-apply        /etc/config/network の生成（バックアップ／復元付き）
│   ├── files/usr/libexec/kddi/kddi-dot1x-action wpa_cli イベントスクリプト（認証成功後に再接続）
│   ├── files/usr/libexec/rpcd/kddi              ubus オブジェクト kddi（status / action / log）
│   ├── files/etc/init.d/kddi                    procd サービス：wpa_supplicant + DSCP ルール
│   └── files/etc/config/kddi                    UCI 設定
├── luci-app-kddi/                LuCI 画面
│   ├── .../view/kddi/overview.js                状態表示 + 操作ボタン + ログ
│   ├── .../view/kddi/settings.js                設定（基本 / IPv6 / 詳細 / 802.1X）
│   ├── .../protocol/kddi.js                     「インターフェース」画面の kddi プロトコル用フォーム
│   └── po/{ja,zh_Hans}/kddi.po                  日本語／簡体字の翻訳
└── .github/workflows/build.yml   apk の自動ビルドと Release への公開
```

### 各部の役割

**`proto kddi`（IPv4）** — udhcpc のコマンドラインを直接組み立て、キャプチャの各オプションを再現します:

```
udhcpc -p /var/run/udhcpc-<dev>.pid -s /lib/netifd/dhcp.script -f -t 0 -o -V "" -i <dev> \
       -O 1 -O 3 -O 6 -O 12 -O 15 -O 28 -O 43 \
       -x 0x3c:6b6464692d686777312e31 \
       -x lease:3600 \
       -C -R
```

* `-o` で udhcpc 既定の要求リストを消し、`-O` で KDDI の option 55 を正確に組み直す；
* `-V ""` で udhcpc 既定の `udhcp 1.37.0` を抑止し、option 60 は `-x 0x3c:` でバイト単位に指定する；
* `-C` で option 61 を抑止（標準の `proto dhcp` では**不可能**。特に
  `network.globals.dhcp_default_duid` が設定されていると必ず option 61 が付く。
  独自プロトコルハンドラを用意した最大の理由）；
* リース・経路・DNS の処理は公式の `/lib/netifd/dhcp.script` をそのまま再利用。

**IPv6** は公式の `proto dhcpv6` を使い、`kddi-apply` が等価なパラメータを書き込みます:

```
option reqaddress 'none'        →  -Nnone         プレフィックスのみ、アドレスは要求しない
option reqprefix '0:00000001'   →  -P0:00000001   IA_PD、IAID は HGW と同一
option clientid '00030001…'     →  -c…            DUID-LL
option defaultreqopts '0'       →  -R             下記のオプションだけを要求
list reqopts 23 24 56 67 82 95  →  -r23 -r24 …
option noclientfqdn '1'         →  -f             ホスト名由来の FQDN を無効化
list sendopts '39:0008…5700'    →  -x39:…         代わりに "RT5770VW" を送信
option ip6ifaceid 'eui64'                          リンクローカルを EUI-64 に固定
```

**MAP-E / MAP-T**：ORO に 95（S46 MAP-T container）が含まれます。`map` パッケージを導入すると
odhcp6c が受信した S46 ルールから `wan6_4` インターフェースを自動生成するので、
本プラグインはそれを wan ゾーンへ入れる役割を担います。

**802.1X**：`wpa_supplicant -D wired` を WAN デバイス上で動かします。`eapol_version=1`、
`ap_scan=0`、`eapol_flags=0` はキャプチャの 802.1X-2001 に合わせた設定です。
`wpa-cli` があれば認証成功時に自動で `ifup` します。

---

## 3. インストール

### 方法 1：Release からダウンロード（推奨）

[Releases](../../releases) から `.apk` を取得します（`PKGARCH:=all` のため CPU アーキテクチャ非依存）:

```sh
apk add --allow-untrusted ./kddi-hgw-*.apk ./luci-app-kddi-*.apk
apk add --allow-untrusted ./luci-i18n-kddi-ja-*.apk           # 任意：日本語 UI
apk add map wpad-openssl wpa-cli                              # 任意：MAP-T / 802.1X
/etc/init.d/network restart      # netifd に kddi プロトコルを読み込ませる（初回のみ）
```

### 方法 2：自分でビルド

```sh
cp -r kddi-hgw luci-app-kddi <openwrt>/package/kddi/

cd <openwrt>
./scripts/feeds update -a && ./scripts/feeds install -a      # luci feed が必要
make menuconfig      # Network → WAN → kddi-hgw
                     # LuCI → Applications → luci-app-kddi
                     # LuCI → Translations → luci-i18n-kddi-ja / -zh-cn
make package/kddi-hgw/compile V=s
make package/luci-app-kddi/compile V=s
```

成果物は `bin/packages/<arch>/…` に出力されます（25.12 以降は `.apk`）。

apk 対応で押さえている点（Makefile 側で処理済み）:

* `PKG_VERSION:=1.0.0` + `PKG_RELEASE:=1` → apk バージョン `1.0.0-r1`。
  `2024-05-07` のような日付バージョンは apk が受け付けません；
* `postinst` / `prerm` / `postrm` は apk の `post-install` / `pre-deinstall` /
  `post-deinstall` に変換されます。スクリプト内の `[ -n "$IPKG_INSTROOT" ] || …` は引き続き必要；
* `Package/kddi-hgw/conffiles` で `/etc/config/kddi` を宣言し、
  ビルドシステムが各パッケージ形式の設定ファイル指定へ変換します（更新時も設定を保持）；
* LuCI パッケージは `luci.mk` を使用。luci feed 内でも独立ディレクトリでもビルドできるようにし、
  `PKG_PO_VERSION` を固定して i18n サブパッケージのバージョンが
  git やファイル時刻から derive されないようにしています。

---

## 4. 使い方

1. HGW の **WAN 側 MAC** を控える（本体ラベルまたは HGW の設定画面）。HGW を外し、
   回線終端装置とルーターの WAN ポートを直結する；
2. LuCI → ネットワーク → **KDDI au HIKARI** → 設定：
   * 有効にする；
   * WAN デバイスに実際のポートを指定；
   * HGW の MAC を入力；
   * ベンダークラスは `kddi-hgw1.1`、型番は `RT5770VW`（自分の HGW に合わせて変更）；
   * 802.1X が必要な回線では「802.1X 認証」タブで方式と認証情報を設定；
3. 保存＆適用（「概要」画面の「ネットワーク設定を書き込む」でも可）。プラグインは次を行います：
   * `/etc/config/network` を `/etc/kddi/backup/network-<日時>` に退避（直近 5 世代を保持）；
   * `wan` を `proto kddi`、`wan6` を KDDI 用パラメータ付き `proto dhcpv6` に書き換え；
   * MAC を該当の `config device` に書き込み；
   * 両インターフェースを `wan` ファイアウォールゾーンに所属させる；
4. 「概要」画面で現在の状態、送信中の識別情報（16 進）、関連ログを確認できます。
   問題があれば「ネットワーク設定を復元」でロールバックできます。

コマンドラインでの同等操作:

```sh
uci set kddi.settings.enabled=1
uci set kddi.settings.device=eth1
uci set kddi.settings.macaddr=xx:xx:xx:xx:xx:xx
uci commit kddi
/etc/init.d/kddi apply       # network へ書き込んで再読み込み
/etc/init.d/kddi restore     # ロールバック
/etc/init.d/kddi status      # JSON で状態表示
```

## 5. 既知の制限・注意事項

* **キャプチャは上り方向のみ**で網側の応答が無いため、DHCP が成功するかどうかは検証できず、
  802.1X の EAP 方式や認証情報も分かりません。回線が 802.1X 必須で認証情報が HGW 内部にしか
  存在しない機種（証明書内蔵型）の場合、市販ルーターでは認証を通せません。
  その場合は HGW を残し、その配下にルーターを接続してください。
* MAC は既定値を入れていません。自分の HGW のアドレスを入力してください。
  型番の既定値は `RT5770VW` です。
* option 57（最大メッセージ長 576）は完全には再現できません。udhcpc は必ず自前の option 57 を
  挿入し、その値はビルド時に busybox 側で決まります（OpenWrt の既定値は 576 未満）。
  この値はサーバー応答長の上限に関わるだけで、アドレス取得の可否には影響しません。
* DSCP CS5 の付与は既定で無効です。udhcpc の DISCOVER は AF_PACKET の raw ソケットを通るため、
  nftables の `netdev egress` フック（カーネル 5.16 以降）でしか印を付けられません。
  アドレス取得には影響しない付加機能です。
* `map` パッケージを入れると netifd が ORO 94/95/96 を追加要求します（公式 dhcpv6 プロトコルの
  仕様）。キャプチャより 2 項目多くなるため、厳密に一致させたい場合は `map` を入れないでください。
* MAC の複製や機器のなりすましは、自分の契約回線で、事業者との契約条件の範囲内で利用してください。

## 6. 寄付

開発の継続に役立てさせていただきます。ご支援いただける場合は以下のアドレスへどうぞ。

**ETH / ERC-20**

```
0xdb61B2aD59bdF2A066B7fC9F00f86c3EBc4856B4
```

## 7. ライセンス・著作権

```
Copyright (C) 2026 Hikaru Chang <i@rua.moe>
Powered by NyphexAI
SPDX-License-Identifier: GPL-3.0-or-later
```

本プログラムはフリーソフトウェアです。フリーソフトウェア財団が公表した GNU 一般公衆利用許諾書
（GNU General Public License）バージョン 3、または（希望により）それ以降のバージョンの条件に従って、
再頒布および改変することができます。

本プログラムは有用であることを願って頒布されますが、**一切の保証はありません**。
商品性や特定目的への適合性についての黙示的な保証もありません。詳細は GNU 一般公衆利用許諾書をご覧ください。

本プログラムには GNU 一般公衆利用許諾書の写しが同梱されています（[LICENSE](LICENSE)）。
同梱されていない場合は <https://www.gnu.org/licenses/> をご覧ください。
