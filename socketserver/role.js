// eslint-disable-next-line
'use strict';
const nconf = require('nconf');
var roles = nconf.get('roles');

// Caching the value so we don't have to loop through something every login
var roleOrder = null;
var staffRoles = null;

function Role(){
	
}

Role.prototype.getRole = function(inRole){
	if (this.roleExists(inRole))
		return roles[inRole];
		
	return roles.default;
};

Role.prototype.roleExists = function(inRole){
	if (typeof roles[inRole] !== 'undefined')
		return true;
	return false;
};

Role.prototype.checkPermission = function(inRole, inPerm){
	var role = this.getRole(inRole);
	if (role){
		if((typeof inPerm) == 'string') {
			return role.permissions.indexOf(inPerm) != -1;
		}else{
			for(var i = 0; i < inPerm.length; i++)
				if(role.permissions.indexOf(inPerm[i]) == -1) return false;
		}
		return true;
	}
	return false;
};

Role.prototype.checkCanGrant = function(inRole, inPerm){
	var role = this.getRole(inRole);
	
	if (role){
		if((typeof inPerm) == 'string') {
			inPerm = inPerm.toLowerCase();
			return role.canGrantRoles.indexOf(inPerm) != -1;
		}else{
			for(var i = 0; i < inPerm.length; i++)
				if(role.canGrantRoles.indexOf(inPerm[i].toLowerCase()) == -1) return false;
		}
		
		return true;
	}
	return false;
};

Role.prototype.makeClientObj = function () {
	return roles;
};

Role.prototype.getOrder = function () {
	if (roleOrder) return roleOrder;

	let roleOrderTemp = nconf.get('roleOrder');
	if (roleOrderTemp && Array.isArray(roleOrderTemp)){
		for (var i in roles){
			if (roleOrderTemp.indexOf(i) == -1) roleOrderTemp.push(i);
		}

		roleOrder = roleOrderTemp;
		return roleOrderTemp;
	} 
	
	var temp = [];
	
	for (var i in roles){
		temp.push(i);
	}
	
	roleOrder = temp;
	return temp;
};

Role.prototype.getStaffRoles = function(){
	if(staffRoles) return staffRoles;
	
	if (nconf.get('staffRoles') && Array.isArray(nconf.get('staffRoles'))) {
		staffRoles = nconf.get('staffRoles');
		return staffRoles;
	}
	return [];
};



module.exports = new Role();
