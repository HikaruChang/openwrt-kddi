# Powered by NyphexAI
# Developed by Hikaru (i@rua.moe)
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Copyright (C) 2026 Hikaru Chang <i@rua.moe>
#
# This is free software, licensed under the GNU General Public License v3.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=kddi-hgw
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_MAINTAINER:=Hikaru Chang <i@rua.moe>
PKG_LICENSE:=GPL-3.0-or-later

include $(INCLUDE_DIR)/package.mk

define Package/kddi-hgw
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=WAN
  TITLE:=KDDI au HIKARI home gateway emulation
  URL:=https://github.com/
  DEPENDS:=+jshn +jsonfilter +odhcp6c
  PKGARCH:=all
endef

define Package/kddi-hgw/description
 Lets an OpenWrt router take the place of a KDDI au HIKARI home gateway.

 It ships a netifd protocol handler that reproduces the DHCPv4 fingerprint of
 the HGW (vendor class kddi-hgw1.1, no client identifier, no host name,
 parameter request list 1,3,6,12,15,28,43, one hour lease request), generates
 the matching DHCPv6 client configuration (DUID-LL from the cloned MAC
 address, IA_PD only, client FQDN carrying the HGW model name) and optionally
 drives a wired 802.1X supplicant on the WAN port.

 Install luci-app-kddi for the web interface.
endef

define Package/kddi-hgw/conffiles
/etc/config/kddi
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/kddi-hgw/install
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/kddi $(1)/etc/config/kddi

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/kddi $(1)/etc/init.d/kddi

	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/99-kddi-hgw $(1)/etc/uci-defaults/99-kddi-hgw

	$(INSTALL_DIR) $(1)/lib/netifd/proto
	$(INSTALL_BIN) ./files/lib/netifd/proto/kddi.sh $(1)/lib/netifd/proto/kddi.sh

	$(INSTALL_DIR) $(1)/usr/libexec/kddi
	$(INSTALL_DATA) ./files/usr/libexec/kddi/kddi-common.sh $(1)/usr/libexec/kddi/kddi-common.sh
	$(INSTALL_BIN) ./files/usr/libexec/kddi/kddi-apply $(1)/usr/libexec/kddi/kddi-apply
	$(INSTALL_BIN) ./files/usr/libexec/kddi/kddi-dot1x-action $(1)/usr/libexec/kddi/kddi-dot1x-action

	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) ./files/usr/libexec/rpcd/kddi $(1)/usr/libexec/rpcd/kddi
endef

define Package/kddi-hgw/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	( . /etc/uci-defaults/99-kddi-hgw ) >/dev/null 2>&1 && rm -f /etc/uci-defaults/99-kddi-hgw
	/etc/init.d/kddi enable >/dev/null 2>&1
	# registers the service and its reload trigger with procd
	/etc/init.d/kddi start >/dev/null 2>&1
	/etc/init.d/rpcd reload >/dev/null 2>&1
	echo "kddi-hgw installed - run '/etc/init.d/network restart' (or reboot)"
	echo "once, so netifd picks up the new 'kddi' protocol handler."
}
exit 0
endef

define Package/kddi-hgw/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/kddi stop >/dev/null 2>&1
	/etc/init.d/kddi disable >/dev/null 2>&1
}
exit 0
endef

define Package/kddi-hgw/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/rpcd reload >/dev/null 2>&1
}
exit 0
endef

$(eval $(call BuildPackage,kddi-hgw))
