'use strict';
const nconf = require('nconf');
let roles = nconf.get('roles');
let roleOrder = null;
let staffRoles = null;

class Role {
	getRole(inRole) {
		if (this.roleExists(inRole)) {
			return roles[inRole];
		}

		return roles.default;
	}

	roleExists(inRole) {
		if (typeof roles[inRole] !== 'undefined') {
			return true;
		}
		return false;
	}

	checkPermission(inRole, inPerm) {
		const role = this.getRole(inRole);
		if (role) {
			if ((typeof inPerm) === 'string') {
				return role.permissions.indexOf(inPerm) !== -1;
			}
			for (let i = 0; i < inPerm.length; i++) {
				if (role.permissions.indexOf(inPerm[i]) === -1) {
					return false;
				}
			}
			return true;
		}
		return false;
	}

	checkCanGrant(inRole, inPerm) {
		const role = this.getRole(inRole);

		if (role) {
			if ((typeof inPerm) === 'string') {
				inPerm = inPerm.toLowerCase();
				return role.canGrantRoles.indexOf(inPerm) !== -1;
			}
			for (let i = 0; i < inPerm.length; i++) {
				if (role.canGrantRoles.indexOf(inPerm[i].toLowerCase()) === -1) return false;
			}

			return true;
		}
		return false;
	}

	makeClientObj() {
		return roles;
	}

	getOrder() {
		if (roleOrder) return roleOrder;

		const roleOrderTemp = nconf.get('roleOrder');
		if (roleOrderTemp && Array.isArray(roleOrderTemp)) {
			for (let i in roles) {
				if (roleOrderTemp.indexOf(i) === -1) roleOrderTemp.push(i);
			}

			roleOrder = roleOrderTemp;
			return roleOrderTemp;
		}

		const temp = [];

		for (var i in roles) {
			temp.push(i);
		}

		roleOrder = temp;
		return temp;
	}

	getStaffRoles() {
		if (staffRoles) return staffRoles;

		if (nconf.get('staffRoles') && Array.isArray(nconf.get('staffRoles'))) {
			staffRoles = nconf.get('staffRoles');
			return staffRoles;
		}
		return [];
	}
}

module.exports = new Role();
