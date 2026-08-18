// Powered by NyphexAI
// Developed by Hikaru (i@rua.moe)
// Copyright (C) 2026 Hikaru Chang <i@rua.moe>
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
'require form';
'require network';

return network.registerProtocol('kddi', {
	getI18n: function() {
		return _('KDDI au HIKARI (DHCP client)');
	},

	getOpkgPackage: function() {
		return 'kddi-hgw';
	},

	renderFormOptions: function(s) {
		var o;

		o = s.taboption('general', form.Value, 'vendorid',
			_('Vendor class (option 60)'),
			_('The KDDI provisioning server keys on this string.'));
		o.default = 'kddi-hgw1.1';
		o.placeholder = 'kddi-hgw1.1';

		o = s.taboption('general', form.Value, 'leasetime',
			_('Requested lease time (option 51)'),
			_('Seconds. A home gateway asks for 3600. Set to 0 to omit the option.'));
		o.datatype = 'uinteger';
		o.default = '3600';
		o.placeholder = '3600';

		o = s.taboption('advanced', form.Value, 'hostname',
			_('Host name to send (option 12)'),
			_('Left empty a home gateway sends no host name at all.'));
		o.datatype = 'hostname';

		o = s.taboption('advanced', form.Value, 'clientid',
			_('Client ID to send (option 61)'),
			_('Left empty no client identifier is sent, which is what a home gateway does.'));
		o.datatype = 'hexstring';

		o = s.taboption('advanced', form.Flag, 'broadcast',
			_('Use broadcast flag'),
			_('A home gateway asks for a unicast reply, so this stays off.'));
		o.default = o.disabled;

		o = s.taboption('advanced', form.Flag, 'classlessroute',
			_('Request classless static routes (option 121)'),
			_('Not requested by a home gateway.'));
		o.default = o.disabled;

		o = s.taboption('advanced', form.DynamicList, 'reqopts',
			_('Requested options (option 55)'),
			_('Leave empty for the home gateway list 1, 3, 6, 12, 15, 28, 43.'));
		o.datatype = 'uinteger';

		o = s.taboption('advanced', form.DynamicList, 'sendopts',
			_('Additional options to send'),
			_('udhcpc syntax, e.g. %s.').format('<code>0x2b:01ff</code>'));
	}
});
