var config = require('../serverconfig.js');
var roles = config.roles;

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

Role.prototype.makeClientObj = function(){
	return roles;
};

Role.prototype.getOrder = function(){
	if (roleOrder) return roleOrder;
	
	if (config.roleOrder && Array.isArray(config.roleOrder)){
		for (var i in roles){
			if (config.roleOrder.indexOf(i) == -1) config.roleOrder.push(i);
		}
		
		roleOrder = config.roleOrder;
		return config.roleOrder;
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
	
	if (config.staffRoles && Array.isArray(config.staffRoles)) {
		staffRoles = config.staffRoles;
		return staffRoles;
	}
	return [];
};



module.exports = new Role();