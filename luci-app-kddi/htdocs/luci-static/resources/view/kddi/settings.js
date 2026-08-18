// Powered by NyphexAI
// Developed by Hikaru (i@rua.moe)
// Copyright (C) 2026 Hikaru Chang <i@rua.moe>
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
'require view';
'require form';
'require uci';
'require tools.widgets as widgets';

return view.extend({
	load: function() {
		return uci.load('kddi');
	},

	render: function() {
		var m, s, o;

		m = new form.Map('kddi', _('KDDI au HIKARI'),
			_('Make this router present itself to the KDDI access network like the home gateway it replaces. ' +
			  'Saving writes the matching <em>wan</em> / <em>wan6</em> interfaces into the network configuration; ' +
			  'the previous network configuration is kept in %s.').format('<code>/etc/kddi/backup</code>'));

		s = m.section(form.NamedSection, 'settings', 'kddi');
		s.addremove = false;
		s.anonymous = true;

		s.tab('general', _('General'));
		s.tab('ipv6', _('IPv6'));
		s.tab('advanced', _('Advanced'));

		o = s.taboption('general', form.Flag, 'enabled', _('Enable'),
			_('Take over the WAN interfaces. Leave this off to keep the current WAN configuration untouched.'));
		o.rmempty = false;

		o = s.taboption('general', widgets.DeviceSelect, 'device', _('WAN device'),
			_('Physical port that is wired to the ONU / media converter.'));
		o.noaliases = true;
		o.nobridges = false;
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'macaddr', _('HGW MAC address'),
			_('WAN side MAC address of the home gateway, printed on its label or shown in its web interface. ' +
			  'It is cloned onto the WAN device and used to build the DHCPv6 DUID.'));
		o.datatype = 'macaddr';
		o.placeholder = 'xx:xx:xx:xx:xx:xx';
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'vendorid', _('Vendor class (DHCPv4 option 60)'),
			_('Identifier the KDDI DHCP server expects from a home gateway.'));
		o.default = 'kddi-hgw1.1';
		o.placeholder = 'kddi-hgw1.1';

		o = s.taboption('general', form.Value, 'model', _('HGW model name'),
			_('Sent as the DHCPv6 client FQDN (option 39), e.g. %s.').format('<code>RT5770VW</code>'));
		o.default = 'RT5770VW';
		o.placeholder = 'RT5770VW';

		o = s.taboption('general', form.Value, 'leasetime', _('Requested lease time'),
			_('DHCPv4 option 51, in seconds. A home gateway asks for 3600.'));
		o.datatype = 'uinteger';
		o.default = '3600';
		o.placeholder = '3600';

		o = s.taboption('ipv6', form.Flag, 'ipv6', _('Enable IPv6'),
			_('Runs a DHCPv6 client that asks for a prefix delegation only, exactly like the home gateway.'));
		o.default = '1';

		o = s.taboption('ipv6', form.ListValue, 'reqprefix', _('Requested prefix length'));
		o.value('auto', _('automatic (no hint, like the HGW)'));
		o.value('48', '/48');
		o.value('56', '/56');
		o.value('60', '/60');
		o.value('64', '/64');
		o.default = 'auto';
		o.depends('ipv6', '1');

		o = s.taboption('ipv6', form.Value, 'iaid', _('IA_PD identifier'),
			_('Hexadecimal IAID used in the prefix delegation request.'));
		o.default = '00000001';
		o.placeholder = '00000001';
		o.datatype = 'and(hexstring,maxlength(8))';
		o.depends('ipv6', '1');

		o = s.taboption('ipv6', form.Flag, 'map', _('Accept IPv4 over IPv6 rules'),
			_('Hand MAP-E / MAP-T / lw4o6 rules received over DHCPv6 to the %s protocol. Requires the %s package.')
				.format('<code>map</code>', '<code>map</code>'));
		o.default = '1';
		o.depends('ipv6', '1');

		o = s.taboption('advanced', form.Value, 'wan', _('IPv4 interface name'),
			_('Logical interface that is rewritten with the KDDI settings.'));
		o.default = 'wan';
		o.placeholder = 'wan';

		o = s.taboption('advanced', form.Value, 'wan6', _('IPv6 interface name'));
		o.default = 'wan6';
		o.placeholder = 'wan6';
		o.depends('ipv6', '1');

		o = s.taboption('advanced', form.Flag, 'manage_firewall', _('Keep interfaces in the wan zone'),
			_('Adds the interfaces to the firewall zone named <em>wan</em> if they are missing.'));
		o.default = '1';

		o = s.taboption('advanced', form.Flag, 'dscp', _('Mark DHCP frames with DSCP CS5'),
			_('The home gateway sends its DHCPv4 frames with DSCP CS5. This needs nftables egress hook support ' +
			  'and has no effect on the address assignment itself.'));
		o.default = '0';

		s = m.section(form.NamedSection, 'dot1x', 'dot1x', _('802.1X authentication'),
			_('KDDI home gateways start an EAPOL exchange on the WAN port before requesting an address. ' +
			  'Enable this only if you have the credentials or certificates your line requires; ' +
			  'they cannot be recovered from a packet capture.'));
		s.addremove = false;
		s.anonymous = true;

		o = s.option(form.Flag, 'enabled', _('Enable'),
			_('Runs wpa_supplicant in wired mode on the WAN device. Requires %s.')
				.format('<code>wpad-openssl</code> / <code>wpa-supplicant</code>'));
		o.rmempty = false;

		o = s.option(form.ListValue, 'eap', _('EAP method'));
		o.value('MD5', 'EAP-MD5');
		o.value('TLS', 'EAP-TLS');
		o.value('TTLS', 'EAP-TTLS');
		o.value('PEAP', 'PEAP');
		o.default = 'MD5';
		o.depends('enabled', '1');

		o = s.option(form.Value, 'identity', _('Identity'));
		o.depends('enabled', '1');

		o = s.option(form.Value, 'password', _('Password'));
		o.password = true;
		o.depends({ enabled: '1', eap: 'MD5' });
		o.depends({ enabled: '1', eap: 'TTLS' });
		o.depends({ enabled: '1', eap: 'PEAP' });

		o = s.option(form.Value, 'anonymous_identity', _('Anonymous identity'));
		o.depends({ enabled: '1', eap: 'TTLS' });
		o.depends({ enabled: '1', eap: 'PEAP' });

		o = s.option(form.Value, 'phase2', _('Inner authentication'),
			_('wpa_supplicant syntax, e.g. %s.').format('<code>auth=MSCHAPV2</code>'));
		o.depends({ enabled: '1', eap: 'TTLS' });
		o.depends({ enabled: '1', eap: 'PEAP' });

		o = s.option(form.Value, 'ca_cert', _('CA certificate'),
			_('Path on the router, e.g. %s.').format('<code>/etc/kddi/certs/ca.pem</code>'));
		o.depends({ enabled: '1', eap: 'TLS' });
		o.depends({ enabled: '1', eap: 'TTLS' });
		o.depends({ enabled: '1', eap: 'PEAP' });

		o = s.option(form.Value, 'client_cert', _('Client certificate'));
		o.depends({ enabled: '1', eap: 'TLS' });

		o = s.option(form.Value, 'priv_key', _('Private key'));
		o.depends({ enabled: '1', eap: 'TLS' });

		o = s.option(form.Value, 'priv_key_pwd', _('Private key password'));
		o.password = true;
		o.depends({ enabled: '1', eap: 'TLS' });

		o = s.option(form.ListValue, 'eapol_version', _('EAPOL version'),
			_('The capture shows a home gateway using version 1 (IEEE 802.1X-2001).'));
		o.value('1', '1');
		o.value('2', '2');
		o.default = '1';
		o.depends('enabled', '1');

		return m.render();
	}
});
