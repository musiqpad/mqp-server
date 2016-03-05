var https = require('https');
var util = require('util');
var log = new (require('basic-logger'))({showTimestamp: true, prefix: "YT"});
var querystring = require('querystring');
var Duration = require("durationjs");
var config = require('../serverconfig');
var key = key = config.apis.YT.key;

https.globalAgent.keepAlive = true;
https.globalAgent.keepAliveMsecs = 60e3;

var YT = function(){
};

function queryVideo(cids, callback){
	if (Array.isArray(cids)){
		cids = cids.join(',');
	}
	
	var len = 0;
	
	//Setting URL
	var url = "https://www.googleapis.com/youtube/v3/videos?" + querystring.stringify({
		part: "contentDetails,snippet,status",
		id: cids,
		fields: "items(id,contentDetails/duration,snippet(title,thumbnails/default),status/uploadStatus)",
		key: key,
	});
	
	//GET Request
	var req = https.get(url, function(res) {
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

			for(var item in str.items){
				item = str.items[item];
				
				// This is a fix for Youtube using Weeks in their durations instead of days...
				if (item.contentDetails.duration.indexOf('W') > -1){
					var weeksArr = item.contentDetails.duration.match(/(\d+)W/);
					var weeks = parseInt(weeksArr[1]);
					
					var days = item.contentDetails.duration.match(/(\d+)D/);
					
					if (days){
						item.contentDetails.duration = item.contentDetails.duration.replace(days[0], (parseInt(days[1]) + (weeks*7)).toString() + 'D');
					}else{
						item.contentDetails.duration = item.contentDetails.duration.replace('T', (weeks*7).toString() + 'DT');
					}
					
					item.contentDetails.duration = item.contentDetails.duration.replace(weeksArr[0], '');
				}
				
				//Duration calculation (in seconds)
				var dur = (new Duration(item.contentDetails.duration)).inSeconds();

				//Output
				if(item.id){
					out[item.id] = {
						cid: item.id,
						title: item.snippet.title,
						thumbnail: item.snippet.thumbnails.default.url,
						duration: dur,
						unavailable: item.status.uploadStatus != 'processed' && item.status.uploadStatus != 'uploaded',
					};
					len++;
				}
			}

			//Return the data
			if (callback) callback(null, out, len);
		});
	});
	
	req.on('error', function(err) {
	    callback("ConnectionError");
	});
}

YT.prototype.getVideo = function(inCid, callback){
	if (typeof callback !== 'function'){ log.error('YT.getVideo expects second argument to be a callback'); return; }
	var out = {};
	
	var requested = 0;
	var returned = 0;
	
	if(Array.isArray(inCid)){
		//Split array into multiple arrays for YT API
		inCid = Array.from(Array(Math.ceil(inCid.length / 50)), function(_,i) {
			return inCid.slice(i * 50, i * 50 + 50);
		});
		
		requested = inCid.length;
		
		if(requested == 0) { callback(null, out); return; }
		
		for(var i = 0; i < requested; i++){
			queryVideo(inCid[i], function(err, data, len){
				if(err) {
					callback('APIProblem');
					return;
				}
				
				util._extend(out, data);
				
				if(++returned == requested){
					callback(null, out);
				}
			});
		}
	} else {
		if (typeof inCid !== 'string'){ return callback('InvalidCid'); }
		if (inCid.indexOf(',') > -1){
			callback('StringContainsMultipleIDs');
			return;
		}
		
		queryVideo(inCid, function( err, data ){
			if (callback) callback(err, data);
		});
	}
};

YT.prototype.search = function(query, callback){
	var inObj = {
		part: "id",
		maxResults: 50,
		q: query,
		type: "video",
		videoEmbeddable: true,
		fields: "items(id)",
		key: key
	};
	
	if (config.apis.YT.restrictSearchToMusic)
		inObj.videoCategoryId = 10; // This is restricting the search to things categorized as music
	
	var url = "https://www.googleapis.com/youtube/v3/search?" + querystring.stringify(inObj);
	
	//GET Request
	https.get(url, function(res) {
		
		var str = '';
		
		res.on('data', function (data) {
			str += data;
		});
		
		res.on('end', function () {
			
			str = JSON.parse(str);
			
			var ids = [];
			
			for(var item in str.items){
				ids.push(str.items[item].id.videoId);
			}
			queryVideo(ids,callback);
		});
	}).on('error', function(err) {
	    callback("ConnectionError");
	});
};

YT.prototype.removeThumbs = function(inData){
	var out;
	
	if (Array.isArray(inData)){
		out = [];
	}else if (typeof inData === 'object'){
		out = {};
	}
	
	for (var i in inData){
		out[i] = util._extend({}, inData[i]);
		delete out[i].thumbnail;
	}
	
	return out;
};

YT.prototype.parseURL = function(url){
	var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
    var match = url.match(regExp);
    return (match&&match[7].length==11)? match[7] : false;
};

YT.prototype.getPlaylist = function(data, callback){
	var url = "https://www.googleapis.com/youtube/v3/playlistItems?" + querystring.stringify({
		part: "snippet",
		maxResults: 50,
		playlistId: data.playlistId,
		pageToken: data.pageToken,
		fields: "nextPageToken,prevPageToken,items(snippet(title,thumbnails(medium(url)),resourceId(videoId)))",
		key: key
	});
	
	//GET Request
	https.get(url, function(res) {
		
		var str = '';
		
		res.on('data', function (data) {
			str += data;
		});
		
		res.on('end', function () {
			
			str = JSON.parse(str);
			
			if(str.error) callback("PlaylistNotFound");
			else if(str.items.length == 0) callback("PlaylistEmpty");
			else {
				//Init output variable
				var out = {
					nextPage: str.nextPageToken ? str.nextPageToken : null,
					prevPage: str.prevPageToken ? str.prevPageToken : null,
					videos: [],
				};
				
				//Fill videos
				for(var i = 0; i < str.items.length; i++){
					out.videos[i] = {
						id: str.items[i].snippet.resourceId.videoId,
						title: str.items[i].snippet.title,
						thumbnail: str.items[i].snippet.thumbnails.medium.url,
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

YT.prototype.getPlaylistFull = function(data, callback){
	var url = "https://www.googleapis.com/youtube/v3/playlistItems?" + querystring.stringify({
		part: "contentDetails",
		maxResults: 50,
		playlistId: data.playlistId,
		pageToken: data.pageToken,
		fields: "nextPageToken,prevPageToken,items(contentDetails(videoId))",
		key: key
	});
	var that = this;
	
	//GET Request
	https.get(url, function(res) {
		
		var str = '';
		
		res.on('data', function (data) {
			str += data;
		});
		
		res.on('end', function () {
			
			str = JSON.parse(str);
			
			if(str.error) callback("PlaylistNotFound");
			else if(str.items.length == 0) callback("PlaylistEmpty");
			else {
				//Init output variable
				var out = data.out || {
					nextPage: str.nextPageToken ? str.nextPageToken : null,
					prevPage: str.prevPageToken ? str.prevPageToken : null,
					videos: [],
				};
				var offset = out.videos.length;
				
				//Fill videos
				for(var i = 0; i < str.items.length; i++)
					out.videos[offset + i] = str.items[i].contentDetails.videoId;
				
				//Continue getting videos or callback
				if(str.nextPageToken)
					that.getPlaylistFull({
						playlistId: data.playlistId,
						pageToken: str.nextPageToken,
						out: out,
					}, callback);
				else {
					delete out.nextPage;
					delete out.prevPage;
					callback(null, out);
				}
			}
		});
	}).on('error', function(err) {
	    callback("ConnectionError");
	});
};

YT.prototype.getChannelPlaylists = function(data, callback){
	var url = "https://www.googleapis.com/youtube/v3/playlists?" + querystring.stringify({
		part: "snippet,contentDetails",
		maxResults: 25,
		channelId: data.channelId,
		pageToken: data.pageToken,
		fields: "pageInfo,nextPageToken,items(id,snippet(title,thumbnails(medium(url))),contentDetails(itemCount))",
		key: key
	});
	
	//GET Request
	https.get(url, function(res) {
		
		var str = '';
		
		res.on('data', function (data) {
			str += data;
		});
		
		res.on('end', function () {
			
			str = JSON.parse(str);
			
			if(str.error) {
				var reason = str.error.errors[0].reason;
				if(reason == 'channelNotFound') callback("ChannelNotFound");
				else if(reason == 'invalidPageToken') callback("InvalidPageToken");
			} else if(str.items.length == 0) callback("NoPlaylistsFound");
			else {
				//Init output variable
				var out = {
					nextPage: str.nextPageToken ? str.nextPageToken : null,
					prevPage: str.prevPageToken ? str.prevPageToken : null,
					playlists: [],
				};
				
				//Fill playlists
				for(var i = 0; i < str.items.length; i++){
					out.playlists[i] = {
						id: str.items[i].id,
						title: str.items[i].snippet.title,
						thumbnail: str.items[i].snippet.thumbnails.medium.url,
						count: str.items[i].contentDetails.itemCount,
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

YT.prototype.findChannels = function(data, callback){
	var url = "https://www.googleapis.com/youtube/v3/search?" + querystring.stringify({
		part: "snippet",
		maxResults: 25,
		q: data.query,
		pageToken: data.pageToken,
		type: "channel",
		fields: "nextPageToken,prevPageToken,items(snippet(channelId,title,thumbnails(medium(url)))),pageInfo",
		key: key
	});
	
	//GET Request
	https.get(url, function(res) {
		
		var str = '';
		
		res.on('data', function (data) {
			str += data;
		});
		
		res.on('end', function () {
			
			str = JSON.parse(str);
			
			if(str.error) callback("InvalidPageToken");
			else if(str.items.length == 0) callback("NoChannelsFound");
			else {
				//Init output variable
				var out = {
					nextPage: str.nextPageToken ? str.nextPageToken : null,
					prevPage: str.prevPageToken ? str.prevPageToken : null,
					channels: [],
				};
				
				//Fill channels
				for(var i = 0; i < str.items.length; i++){
					out.channels[i] = {
						title: str.items[i].snippet.title,
						id: str.items[i].snippet.channelId,
						thumbnail: str.items[i].snippet.thumbnails.medium.url,
					};
				}
				
				//Callback
				callback(null, out);
			}
		});
	}).on('error', function(err) {
	    callback("ConnectionError");
	});
}

YT.prototype.findPlaylists = function(data, callback){
	var url = "https://www.googleapis.com/youtube/v3/search?" + querystring.stringify({
		part: "snippet",
		maxResults: 25,
		q: data.query,
		pageToken: data.pageToken,
		type: "playlist",
		fields: "nextPageToken,prevPageToken,pageInfo,items(id(playlistId),snippet(title,thumbnails(medium(url))))",
		key: key
	});
	
	//GET Request
	https.get(url, function(res) {
		
		var str = '';
		
		res.on('data', function (data) {
			str += data;
		});
		
		res.on('end', function () {
			
			str = JSON.parse(str);
			
			if(str.error) callback("InvalidPageToken");
			else if(str.items.length == 0) callback("NoPlaylistsFound");
			else {
				//Init output variable
				var out = {
					nextPage: str.nextPageToken ? str.nextPageToken : null,
					prevPage: str.prevPageToken ? str.prevPageToken : null,
					playlists: [],
				};
				
				//Fill playlists
				for(var i = 0; i < str.items.length; i++){
					out.playlists[i] = {
						title: str.items[i].snippet.title,
						id: str.items[i].id.playlistId,
						thumbnail: str.items[i].snippet.thumbnails.medium.url,
					};
				}
				
				//Callback
				callback(null, out);
			}
		});
	}).on('error', function(err) {
	    callback("ConnectionError");
	});
}

YT.prototype.getPlaylistName = function(data, callback){
	var url = "https://www.googleapis.com/youtube/v3/playlists?" + querystring.stringify({
		part: "snippet",
		maxResults: 1,
		id: data,
		fields: "items(snippet(title))",
		key: key
	});
	
	//GET Request
	https.get(url, function(res) {
		
		var str = '';
		
		res.on('data', function (data) {
			str += data;
		});
		
		res.on('end', function () {
			
			str = JSON.parse(str);
			
			if(str.items.length == 0)
				callback("NoPlaylistsFound");
			else
				callback(null, str.items[0].snippet.title);
		});
	}).on('error', function(err) {
	    callback("ConnectionError");
	});

};

module.exports = new YT();