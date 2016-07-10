// API reference: https://developers.soundcloud.com/docs/api/reference#track

const https = require('https');
const util = require('util');
const log = new (require('basic-logger'))({showTimestamp: true, prefix: "SC"});
const querystring = require('querystring');
const nconf = require('nconf');
const key = nconf.get('apis:SC:key');

var SC = function(){
};

/*
	Result limit: default 50, max 200
	SC api don't have rate limit.
	
	Warning: artwork_url can be null!
*/

function queryTrack(cids, callback){
	if (Array.isArray(cids)){
		cids = cids.join(',');
	}
	
	var len = 0;
	
	//Setting URL
	var url = "https://api.soundcloud.com/tracks?" + querystring.stringify({
		ids: cids,
//		limit: 50,
		client_id: key,
		format: 'json'
	});
	
	//GET Request
	https.get(url, function(res) {
		var str = '';
		
		res.on('data', function (data) {
			str += data;
		});
		
		res.on('error', function (err) {
			callback('RateLimitReached');
		});
		
		res.on('end', function () {
			
			try{ str = JSON.parse(str);
			}catch(e){callback('StringNotJSON'); return;}
			
			var out = {};
			
			for(var item in str){
				item = str[item];
				
				//Duration calculation (in seconds)
				var dur = parseInt(item.duration/1e3);
				
				//Output
				out[item.id] = {
					cid: item.id,
					title: item.title,
					thumbnail: item.artwork_url,
					duration: dur
				};
				len++;
			}
			
			//Return the data
			callback(null, out, len);
		});
	}).on('error', function(err) {
	    callback("ConnectionError");
	});
}

SC.prototype.getTrack = function(inCid, callback){
	if (typeof callback !== 'function'){ log.error('SC.getTrack expects second argument to be a callback'); return; }
	var out = {};
	
	var requested = 0;
	var returned = 0;
	
	if(Array.isArray(inCid)){
		var cid = inCid.slice(0);
		if (cid.length > 50){
			requested = Math.ceil( cid.length / 50 );
			while (cid.length > 0){
				var tempArr = cid.splice(0, (cid.length >= 50 ? 50 : cid.length) );
				
				queryTrack(tempArr, function( err, data, len ){
					if (err){callback('APIProblem'); return;}
					util._extend(out, data);
					returned++;
					
					if (requested == returned){
						/* THis is to find missing.  Might not need this...
						for (var k in out){
							var ind  = inCid.indexOf(out[k].cid);
							if ( ind > -1 ) inCid.splice(ind, 1);
						}*/
						callback(null, out/*, inCid*/);
					}
				});
			}
		}else{
			queryTrack(cid, function( err, data ){
				callback(err, data);
			});
		}
	}else{
		if (typeof inCid !== 'string'){ return callback('InvalidCid'); }
		if (inCid.indexOf(',') > -1){
			callback('StringContainsMultipleIDs');
			return;
		}
		
		queryTrack(inCid, function( err, data ){
			callback(err, data);
		});
	}
	
	
};

SC.prototype.search = function(query, callback){
	
	//Setting URL
	var url = "https://api.soundcloud.com/tracks?" + querystring.stringify({
		q: query,
		limit: 20,
		client_id: key,
		format: 'json'
	});
	
	var len = 0;
	
	//GET Request
	https.get(url, function(res) {
		
		var str = '';
		
		res.on('data', function (data) {
			str += data;
		});
		
		res.on('end', function () {
			
			try{ str = JSON.parse(str);
			}catch(e){callback('StringNotJSON'); return;}
			
			var out = {};
			
			for(var item in str){
				item = str[item];
				
				//Duration calculation (in seconds)
				var dur = parseInt(item.duration/1e3);
				
				//Output
				out[item.id] = {
					cid: item.id,
					title: item.title,
					thumbnail: item.artwork_url,
					duration: dur
				};
				len++;
			}
			
			//Return the data
			callback(null, out, len);
		});
	}).on('error', function(err) {
	    callback("ConnectionError");
	});
};

SC.prototype.findUsers = function(query, callback){
	var url = "https://api.soundcloud.com/users?" + querystring.stringify({
		limit: 50,
		q: query,
		format: 'json',
		client_id: key
	});
	
	//GET Request
	https.get(url, function(res) {
		
		var str = '';
		
		res.on('data', function (data) {
			str += data;
		});
		
		res.on('end', function () {
			
			str = JSON.parse(str);
			
			if(str.length == 0) callback("NoUsersFound");
			else {
				//Init output variable
				var out = {
					channels: [],
				};
				
				//Fill channels
				for(var i = 0; i < str.length; i++){
					out.channels[i] = {
						title: str[i].username,
						id: str[i].id,
						thumbnail: str[i].avatar_url,
						playlist_count: str[i].playlist_count,
						track_count: str[i].track_count
					};
				}
				
				//Callback
				callback(null, out);
			}
		});
	}).on('error', function(err) {
	    callback("ConnectionError");
	});
};

SC.prototype.getUserPlaylists = function(uid, callback){
	var url = "https://api.soundcloud.com/playlists?" + querystring.stringify({
		limit: 50,
		user_id: uid,
		format: 'json',
		client_id: key
	});
	
	//GET Request
	https.get(url, function(res) {
		
		var str = '';
		
		res.on('data', function (data) {
			str += data;
		});
		
		res.on('end', function () {
			
			str = JSON.parse(str);
			
			if(str.length == 0) callback("NoPlaylistsFound");
			else {
				//Init output variable
				var out = {
					playlists: [],
				};
				
				//Fill playlists
				for(var i = 0; i < str.length; i++){
					out.playlists[i] = {
						id: str[i].id,
						title: str[i].title,
						thumbnail: str[i].artwork_url,
						count: str[i].tracks.length
					};
				}
				
				//Callback
				callback(null, out);
			}
		});
	}).on('error', function(err) {
	    callback("ConnectionError");
	});
};

SC.prototype.getPlaylistFull = function(pid, callback){
	var url = "https://api.soundcloud.com/playlists/"+pid+"?" + querystring.stringify({
		limit: 200,
		format: 'json',
		client_id: key
	});
	
	//GET Request
	https.get(url, function(res) {
		
		var str = '';
		
		res.on('data', function (data) {
			str += data;
		});
		
		res.on('end', function () {
			
			str = JSON.parse(str);
			
			if(!str || str.tracks.length == 0) callback("PlaylistEmpty");
			else {
				//Init output variable
				var out = {
				   tracks: []
				};
				
				for(var i = 0; i < str.tracks.length; i++){
					out.tracks[i] = {
						id: str.tracks[i].id,
						title: str.tracks[i].title,
						thumbnail: str.tracks[i].artwork_url
					};
		   	}
				
				callback(null, out);
			}
		});
	}).on('error', function(err) {
	    callback("ConnectionError");
	});
};

SC.prototype.removeThumbs = function(inData){
	var out;
	
	if (Array.isArray(inData)){
		out = [];
	}else if (typeof inData === 'object'){
		out = {};
	}
	
	for (var i in inData){
		out[i] = util._extend({}, inData[i]);
		delete out[i].artwork_url;
	}
	
	return out;
};