#!/bin/sh
# Powered by NyphexAI
# Developed by Hikaru (i@rua.moe)
# Copyright (C) 2026 Hikaru Chang <i@rua.moe>
# SPDX-License-Identifier: GPL-3.0-or-later
# KDDI au HIKARI - IPv4 DHCP client protocol with home gateway fingerprint
#
# Reproduces the DHCPDISCOVER a KDDI HGW puts on the wire (see the capture
# analysis in the README):
#   option 60 vendor class identifier .. "kddi-hgw1.1"
#   option 61 client identifier ....... not sent
#   option 12 host name ............... not sent
#   option 55 parameter request list .. 1,3,6,12,15,28,43 (no 121)
#   option 51 requested lease time .... 3600
#   bootp broadcast flag .............. cleared (unicast reply)
#
# Everything else (lease handling, routes, DNS) is the stock netifd DHCP
# machinery: /lib/netifd/dhcp.script is reused unmodified.

[ -x /sbin/udhcpc ] || exit 0

. /lib/functions.sh
. /lib/netifd/netifd-proto.sh

init_proto "$@"

KDDI_VENDORID="kddi-hgw1.1"
KDDI_REQOPTS="1 3 6 12 15 28 43"
KDDI_LEASETIME="3600"

proto_kddi_init_config() {
	renew_handler=1

	proto_config_add_string 'vendorid'
	proto_config_add_string 'hostname:hostname'
	proto_config_add_string 'clientid'
	proto_config_add_string 'reqopts:list(string)'
	proto_config_add_array 'sendopts:list(string)'
	proto_config_add_int 'leasetime'
	proto_config_add_boolean 'broadcast:bool'
	proto_config_add_boolean 'norelease:bool'
	proto_config_add_boolean 'classlessroute'
	proto_config_add_string 'ipaddr:ipaddr'
	proto_config_add_string 'customroutes'
	proto_config_add_string 'zone'
}

proto_kddi_add_sendopts() {
	[ -n "$1" ] && append "$3" "-x $1"
}

proto_kddi_setup() {
	local config="$1"
	local iface="$2"

	local vendorid hostname clientid reqopts leasetime broadcast norelease
	local classlessroute ipaddr customroutes zone
	json_get_vars vendorid hostname clientid reqopts leasetime broadcast \
		norelease classlessroute ipaddr customroutes zone

	local opt dhcpopts

	[ -n "$vendorid" ] || vendorid="$KDDI_VENDORID"
	[ -n "$reqopts" ] || reqopts="$KDDI_REQOPTS"
	[ -n "$leasetime" ] || leasetime="$KDDI_LEASETIME"

	# -o drops udhcpc's built in request list, -O rebuilds it in the exact
	# order the HGW uses (udhcpc emits the codes in ascending order)
	for opt in $reqopts; do
		append dhcpopts "-O $opt"
	done
	[ "$classlessroute" = 1 ] && append dhcpopts "-O 121"

	# option 60 - the signature the KDDI provisioning server keys on
	append dhcpopts "-x 0x3c:$(printf '%s' "$vendorid" | hexdump -v -e '1/1 "%02x"')"

	# option 51 - the HGW asks for a one hour lease
	[ "$leasetime" -gt 0 ] 2>/dev/null && append dhcpopts "-x lease:$leasetime"

	# option 61 - the HGW sends none at all, so suppress udhcpc's default
	# (which would otherwise be 01<mac> or the network.globals DUID)
	[ -n "$clientid" ] && {
		clientid="$(hexdump_2hex "$clientid")"
		[ -z "$clientid" ] && logger -p warn -t kddi "$iface: ignoring invalid clientid value"
	}
	if [ -n "$clientid" ]; then
		append dhcpopts "-x 0x3d:$clientid"
	else
		append dhcpopts "-C"
	fi

	# option 12 - not sent unless the user asks for it
	[ -n "$hostname" ] && [ "$hostname" != "*" ] && \
		append dhcpopts "-x hostname:$hostname"

	[ "$broadcast" = 1 ] && append dhcpopts "-B"
	[ "$norelease" = 1 ] || append dhcpopts "-R"

	json_for_each_item proto_kddi_add_sendopts sendopts dhcpopts

	[ -n "$zone" ] && proto_export "ZONE=$zone"
	[ -n "$customroutes" ] && proto_export "CUSTOMROUTES=$customroutes"

	proto_export "INTERFACE=$config"
	proto_run_command "$config" udhcpc \
		-p /var/run/udhcpc-$iface.pid \
		-s /lib/netifd/dhcp.script \
		-f -t 0 -o -V "" -i "$iface" \
		${ipaddr:+-r ${ipaddr%%/*}} \
		$dhcpopts
}

proto_kddi_renew() {
	local interface="$1"
	local sigusr1="$(kill -l SIGUSR1)"
	[ -n "$sigusr1" ] && proto_kill_command "$interface" $sigusr1
}

proto_kddi_teardown() {
	local interface="$1"
	proto_kill_command "$interface"
}

add_protocol kddi
