# Powered by NyphexAI
# Developed by Hikaru (i@rua.moe)
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Copyright (C) 2026 Hikaru Chang <i@rua.moe>
#
# This is free software, licensed under the GNU General Public License v3.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-kddi
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

# keep the generated luci-i18n-* packages on a deterministic, apk compatible
# version instead of the git/mtime derived default of luci.mk
PKG_PO_VERSION:=$(PKG_VERSION)-r$(PKG_RELEASE)

PKG_MAINTAINER:=Hikaru Chang <i@rua.moe>
PKG_LICENSE:=GPL-3.0-or-later

LUCI_TITLE:=LuCI support for KDDI au HIKARI
LUCI_DESCRIPTION:=Web interface for the kddi-hgw home gateway emulation package.
LUCI_DEPENDS:=+kddi-hgw
LUCI_PKGARCH:=all

# works both inside the luci feed and as a standalone package directory
LUCI_MK:=$(firstword $(wildcard ../../luci.mk $(TOPDIR)/feeds/luci/luci.mk))

ifeq ($(LUCI_MK),)
  $(error luci.mk was not found - install the luci feed first)
endif

include $(LUCI_MK)

# call BuildPackage - OpenWrt buildroot signature
