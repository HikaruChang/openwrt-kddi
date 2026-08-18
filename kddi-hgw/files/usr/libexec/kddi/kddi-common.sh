#!/bin/sh
# Powered by NyphexAI
# Developed by Hikaru (i@rua.moe)
# Copyright (C) 2026 Hikaru Chang <i@rua.moe>
# SPDX-License-Identifier: GPL-3.0-or-later
# Shared helpers for the KDDI au HIKARI package.

KDDI_BACKUP_DIR="/etc/kddi/backup"
KDDI_RUN_DIR="/var/run/kddi"
KDDI_WPA_CONF="$KDDI_RUN_DIR/wpa_supplicant.conf"
KDDI_WPA_CTRL="/var/run/wpa_supplicant-kddi"
KDDI_NFT_TABLE="kddi"

kddi_log() {
	logger -t kddi -p "daemon.${2:-info}" -- "$1"
}

kddi_msg() {
	kddi_log "$1"
	echo "$1"
}

kddi_err() {
	kddi_log "$1" err
	echo "$1" >&2
}

# 00:11:22:33:44:55 -> 001122334455
kddi_mac_hex() {
	echo "$1" | tr 'A-F' 'a-f' | tr -d ':-'
}

kddi_mac_valid() {
	echo "$1" | grep -qE '^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$'
}

# DUID-LL (RFC 8415 3.4): type 3, hardware type 1 (ethernet), link layer address
kddi_duid_ll() {
	local mac="$(kddi_mac_hex "$1")"
	[ ${#mac} -eq 12 ] || return 1
	echo "00030001$mac"
}

# ASCII -> hex
kddi_str_hex() {
	printf '%s' "$1" | hexdump -v -e '1/1 "%02x"'
}

# DHCPv6 client FQDN option payload (option 39): flags byte + DNS wire name
kddi_fqdn_hex() {
	local name="$1" label out="00"

	[ -n "$name" ] || return 1
	name="${name%.}"
	while [ -n "$name" ]; do
		label="${name%%.*}"
		[ -n "$label" ] || return 1
		[ ${#label} -le 63 ] || return 1
		out="$out$(printf '%02x' ${#label})$(kddi_str_hex "$label")"
		case "$name" in
			*.*) name="${name#*.}" ;;
			*) name="" ;;
		esac
	done
	echo "${out}00"
}

kddi_config_load() {
	config_load kddi

	config_get KDDI_ENABLED     settings enabled 0
	config_get KDDI_DEVICE      settings device ''
	config_get KDDI_WAN         settings wan 'wan'
	config_get KDDI_WAN6        settings wan6 'wan6'
	config_get KDDI_MACADDR     settings macaddr ''
	config_get KDDI_VENDORID    settings vendorid 'kddi-hgw1.1'
	config_get KDDI_MODEL       settings model 'RT5770VW'
	config_get KDDI_LEASETIME   settings leasetime '3600'
	config_get KDDI_IPV6        settings ipv6 1
	config_get KDDI_REQPREFIX   settings reqprefix 'auto'
	config_get KDDI_IAID        settings iaid '00000001'
	config_get KDDI_MAP         settings map 1
	config_get KDDI_DSCP        settings dscp 0
	config_get KDDI_FIREWALL    settings manage_firewall 1

	config_get DOT1X_ENABLED    dot1x enabled 0
	config_get DOT1X_EAP        dot1x eap 'MD5'
	config_get DOT1X_VERSION    dot1x eapol_version '1'
	config_get DOT1X_IDENTITY   dot1x identity ''
	config_get DOT1X_PASSWORD   dot1x password ''
	config_get DOT1X_ANONYMOUS  dot1x anonymous_identity ''
	config_get DOT1X_PHASE2     dot1x phase2 ''
	config_get DOT1X_CA         dot1x ca_cert ''
	config_get DOT1X_CERT       dot1x client_cert ''
	config_get DOT1X_KEY        dot1x priv_key ''
	config_get DOT1X_KEYPWD     dot1x priv_key_pwd ''
}

# physical device of the configured WAN interface, falling back to the
# device the logical interface currently runs on
kddi_wan_device() {
	local dev="$KDDI_DEVICE"

	[ -n "$dev" ] || dev="$(uci -q get "network.$KDDI_WAN.device")"
	[ -n "$dev" ] || dev="$(ubus call "network.interface.$KDDI_WAN" status 2>/dev/null | \
		jsonfilter -e '@.l3_device' 2>/dev/null)"
	echo "$dev"
}
