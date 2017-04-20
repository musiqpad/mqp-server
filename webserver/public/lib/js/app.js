/*global API config angular YT CryptoJS Tour lightbox grecaptcha*/
(function(){

	if (!config){
		throw new Error('Config not loaded!');
	}

	// Initialization
	var MP = {

		applyModels: function(specific){
			if (!window.angular) return;

			var updates = {
				roomInfo: MP.session.roomInfo,
				playlists: (MP.user ? MP.user.playlists : {}),
				viewedPlContents: (MP.user && MP.session.viewedPl && MP.user.playlists[MP.session.viewedPl] ? MP.user.playlists[MP.session.viewedPl].content : []),
				user: (MP.user ? MP.user : {}),
				username: (MP.user ? MP.user.un : 'Not Logged In'),
				isLoggedIn: (typeof MP.user !== 'undefined'),
				activepl: (MP.user ? MP.user.activepl : 0),
				viewedPl: MP.session.viewedPl,
				songSearch: MP.session.songSearch,
				searchResults: MP.session.searchResults,
				searchResultsBlockedVideo: MP.session.searchResultsBlockedVideo,
				playlistResults: MP.session.playlistResults,
				nextSong: ( (MP.user && MP.user.activepl && MP.user.playlists[ MP.user.activepl ] && MP.user.playlists[ MP.user.activepl ].content.length) ?
					MP.user.playlists[ MP.user.activepl ].content[0] : 'No song selected'),
				userlist: (function(){ var out = []; for (var i in MP.userList.users){out.push(MP.seenUsers[MP.userList.users[i]]);} return out; })(),
				historyList: MP.historyList,
				stafflist: (function(){ var out = []; for (var i in MP.session.roomStaff){out.push(MP.seenUsers[MP.session.roomStaff[i].uid]);} return out; })(),
				bannedlist: (function(){ var out = []; for (var i in MP.session.bannedUsers){out.push(MP.seenUsers[MP.session.bannedUsers[i].uid]);} return out; })(),
				numLogged: MP.userList.users.length,
				numGuests: MP.userList.guests,
				currentDJ: MP.session.queue.currentdj,
				currentSong: (MP.session.queue.currentsong ? MP.session.queue.currentsong.title : 'Nobody is playing'),
				queue: MP.session.queue,
				canSkip: (MP.checkPerm('djqueue.skip.other') || (MP.user && MP.findPosInWaitlist() == 0 && MP.checkPerm('djqueue.skip.self'))),
				canLock: (MP.checkPerm('djqueue.lock')),
				canCycle: (MP.checkPerm('djqueue.cycle')),
				canMove: (MP.checkPerm('djqueue.move')),
				secondsLeftInSong: MP.media.timeRemaining,
				songDuration: MP.getDuration(),
				songProgress: (MP.getDuration() ? MP.getTimeElapsed() / MP.getDuration() : 0),
				queueList: (function(){ var out = []; var j = 1; for (var i in MP.session.queue.users){out.push({num: j++, user: MP.findUser(MP.session.queue.users[i]) });} return out; })(),
				queueLength: (MP.session.queue.users ? MP.session.queue.users.length : 0),
				snooze: MP.session.snooze,
				vote: $('.btn-upvote.active').length ? '#A7CA00' : ($('.btn-downvote.active').length ? '#C8303E' : '#925AFF'),
				allowemojis: MP.session.allowemojis,
				lastdj: MP.session.lastdj,
				description: MP.session.description,
				pms: MP.pms
			};

			var $scope = angular.element( $("body") ).scope();

			if (MP.models.viewedPl != MP.session.viewedPl) try{ $('.lib-sng').draggable('destroy'); } catch (e){}

			for (var i in updates){
				if (updates[i] != MP.models[i])
					MP.models[i] = updates[i];
			}

			$scope.$apply(function(){
				for (var i in MP.models){
					$scope[i] = MP.models[i];
				}
				if ($scope.user && $scope.user.badge &&
						$scope.userSettings && $scope.userSettings.newBadgeTop == '' &&
						$scope.userSettings.newBadgeBottom == '') {
					$scope.userSettings.newBadgeTop = $scope.user.badge.top;
					$scope.userSettings.newBadgeBottom = $scope.user.badge.bottom;
				}
			});

			if (MP.session.viewedPl && MP.models.viewedPlContents.length){
				var $song = $('.lib-sng');

				$song.draggable({
					appendTo: 'div.library',
					helper: function(){
						return $(this).clone().css({'width': $(this).css('width'), 'font-weight': 'bold'});
					},
					opacity: 0.7,
					zIndex: 100000000,
					cancel: '.nav',
					scroll: true,
					scrollSensitivity: 100,
					cursorAt: { top: 10, left: 10 },
					refreshPositions: true,
					start: function(){
						$('.lib-fdr:not([data-pid=' + MP.session.viewedPl + '])').droppable({
							accept: '.lib-sng',
							hoverClass: 'draghover',
							tolerance: 'pointer',
							drop: function(e, ui){
								var pid = $(this).attr('data-pid');
								var cid = $(ui.draggable).attr('data-cid');
								MP.playlistAdd(pid, cid, 'top', function(err, data){
									if(err == "SongAlreadyInPlaylist"){
										MP.makeConfirmModal({
											content: "Song is already in your playlist, would like to move it to the top?",
											callback: function(res){
												if(res) MP.api.playlist.moveSong(pid, cid, 'top');
											}
										});
									}
								});
							}
						});

						$('div.lib-song-list').append('<div class="lib-sng-drop"></div>');
					},
					drag: function(e, ui){
						var $firstSong = $('.lib-sng:eq(0)');
						var $songDrop = $('.lib-sng-drop');
						var $songList = $('.lib-song-list');

						var offset = $firstSong.offset();
						var height = $firstSong.height() + 1;
						var innerPos = ui.offset.top - offset.top + 5;


						if (ui.offset.left < offset.left || ui.offset.left > (offset.left + $firstSong.width())){
							$songDrop.css('display', 'none');
							return;
						}else{
							$songDrop.css('display', 'block');

							if ( (ui.offset.top - offset.top - $songList.scrollTop()) < 30 ){
								$songList.autoscroll({
				                    direction: 'up',
				                    step: 400,
				                    scroll: true
				                });
							}else if (( $songList.height() + $songList.offset().top - ui.offset.top) < 30 ){
								$songList.autoscroll({
				                    direction: 'down',
				                    step: 400,
				                    scroll: true
				                });
							}else {
								if ($songList.autoscroll('get'))
									$songList.autoscroll('destroy');
							}
						}

						var snapMult = Math.floor( innerPos / height );
						var snapFinal = null;

						if ( (innerPos % height) <= (height/2)){
							snapFinal = 0;
						}else{
							snapFinal = 1;
						}

						var newPos = Math.max( 0, Math.min((snapFinal + snapMult), MP.models.viewedPlContents.length) );

						$songDrop
							.css('top', newPos * height + offset.top - $('.lib-songs').offset().top + $('.lib-songs').scrollTop() - 1 + 'px')
							.attr('data-pos', newPos);
					},
					stop: function(e, ui){
						$('.ui-draggable-dragging').remove();

						var $songList = $('.lib-song-list');

						if ($songList.autoscroll('get'))
									$songList.autoscroll('destroy');

						var $songDrop = $('.lib-sng-drop');

						if (!$songDrop.is(':hidden')){
							MP.playlistMove(MP.session.viewedPl, ui.helper.attr('data-cid'), $('.lib-sng-drop').attr('data-pos'));
						}
						$('.lib-fdr:not([data-pid=' + MP.session.viewedPl + '])').droppable('destroy');
						$('.lib-sng-drop').remove();
					}

				});

			}

			var playerSettings = JSON.parse(localStorage.settings).player;
			if (!MP.session.queue.currentsong){
				$('#player').hide();
				$('.btn-skip:visible').hide();
				$('.btn-refresh:visible').hide();
			} else {
				if (playerSettings.stream && !MP.session.snooze){
					$('#player').show();
					$('.btn-skip:hidden').show();
					$('.btn-refresh:hidden').show();
				} else {
					$('#player').hide();
				}
			}
			$('.btn-stream div').removeClass('mdi-video-off').removeClass('mdi-video');
			if (!playerSettings.stream){
				$('#player').hide();
				$('.btn-refresh:visible').hide();
				$('.btn-stream div').addClass('mdi-video-off');
			}else{
				$('.btn-stream div').addClass('mdi-video');
			}
		},
		models: {
			playlists: {},
			viewedPlContents: [],
			user: {},
			username: '',
			activepl: 0,
			viewedPl: null,
			songSearch: false,
			searchResults: [],
			searchResultsBlockedVideo: [],
			nextSong: '',
			userlist: [],
			historyList: {},
			stafflist: [],
			numLogged: 0,
			numGuests: 0,
			currentSong: '',
			currentDJ: '',
			queueList: [],
			queueLength: 0,
			queue: {},
			secondsLeftInSong: 0,
			songDuration: 0,
			songProgress: 0,
			pms: {}
		},
		pms: {},
		session: { // Used for temp variables specific to current session
			roomInfo: {},
			viewedPl: null,
			songSearch: false,
			searchResults: [],
			searchResultsBlockedVideo: [],
			playlistResults: [],
			queue: {},
			roles: {},
			roleOrder: [],
			staffRoles: [],
			roomStaff: [],
			bannedUsers: [],
			mediaPreview : {
				fadeInterval: 0,
				player: null,
				mainVolume: 100,
				previewVolume: 0,
			},
			serverDateDiff: 0,
			snooze: false,
			lastMessage: null,
			lastPMUid: null,
			imgc: 0,
			allowemojis: true,
			isCaptcha: false,
			captchakey: '',
			historylimit: 50,
			lastdj: false,
			description: '',
			blockedusers: [],
		},
		isOnWaitlist: function(uid){
			if (MP.session.queue.currentdj && MP.session.queue.currentdj.uid == uid) return true;

			for (var i = 0; i < MP.session.queue.users.length; i++){
				if (MP.session.queue.users[i] == uid) return true;
			}

			return false;
		},
		isStaffMember: function(uid){
			var user = uid ? MP.findUser(uid) : MP.user;

			if ( user && MP.session.staffRoles && MP.session.staffRoles.indexOf(user.role) > -1) {
				return true;
			}
			return false;
		},
		userList: {
			guests: 0,
			users: []
		},
		historyList: {
			historyInitialized: false,
			filter: "",
			history: []
		},
		seenUsers: {},
		media : {
			media : null,
			timeRemaining: 0,
			start: null
		},
		intervals : {
			timeRemaining : null
		},
		onConnect: null,
		emotes: { Basic: {}, TastyCat: {}, Twitch: {}, BetterTTV: {} },
		emotes_ascii: {},
		cbId: 1,
		callbacks: {},
		addCallback: function(event, func, timeout){
			var that = MP;
			if (!func) return;
			if ( typeof MP.callbacks[event] === 'undefined') MP.callbacks[event] = {};

			var id = MP.cbId++;
			MP.callbacks[event][id] = {
				cb: func,
				timeoutId: setTimeout(function(){
					console.log(event + ' REQUEST TIMED OUT');
					MP.callbacks[event][id].cb('RequestTimedOut');
					that.removeCallback(event, id);
				}, timeout || 5000)
			};
			return id;
		},
		removeCallback: function(event, id){
			if ( typeof MP.callbacks[event] === 'undefined' ) return;
			if ( typeof MP.callbacks[event][id] === 'undefined' ){ console.log('Invalid callback id'); return; }

			clearTimeout(MP.callbacks[event][id].timeoutId);
			delete MP.callbacks[event][id];
		},
		callCallback: function(data){
			if ( !data.requestType || typeof MP.callbacks[data.requestType] === 'undefined' ){ return; }

			var callback = MP.callbacks[data.requestType][data.id];
			if (typeof callback === 'undefined') return;

			MP.removeCallback(data.requestType, data.id);
			callback.cb.call(window, (data.data ? data.data.error : null), data.data, data);
		},
		listenerId: 1,
		listeners: {},
		extListeners: {},
		on: function(event, func, ext){
			var lists = (ext ? MP.extListeners : MP.listeners);

			if ( typeof func !== 'function') return;
			if ( typeof lists[event] === 'undefined') lists[event] = {};

			var id = MP.listenerId++;
			lists[event][id] = {
				cb: func
			};
			return id;
		},
		off: function(event, id, ext){
			var lists = (ext ? MP.extListeners : MP.listeners);
			id = typeof id === "string" ? parseInt(id) : id;

			if (typeof lists[event] === 'undefined') return;

			if (typeof id === 'number'){
				if ( typeof lists[event][id] === 'undefined' ){ console.log('Invalid callback id'); return false; }
				delete lists[event][id];
				return true;
			} else if (typeof id === 'function'){
				for (var i in lists[event]){
					if (lists[event][i].cb === id){
						delete lists[event][i];
						return true;
					}
				}
			}

			return false;
		},
		once: function(event, func, ext){
			var lists = (ext ? MP.extListeners : MP.listeners);

			if ( typeof func !== 'function') return;
			if ( typeof lists[event] === 'undefined') lists[event] = {};

			var id = MP.listenerId++;
			lists[event][id] = {
				cb: func,
				once: true,
			};
			return id;
		},
		callListeners: function(data){
			if ( typeof MP.listeners[data.type] === 'undefined' && typeof MP.extListeners[data.type] === 'undefined'){ return; }

			var callbacks = $.extend({}, (MP.listeners[data.type] || {}), (MP.extListeners[data.type] || {}));

			for (var i in callbacks){
				if (callbacks[i].cb.length == 1) {
					callbacks[i].cb.call(window, data.data, data);
				}
				else {
					callbacks[i].cb.call(window, (data.data || {}).error, data.data, data);
				}
				if(callbacks[i].once){
					MP.off(data.type, i, true);
				}
			}
		},
		cookie: {
			setCookie: function(cname, cvalue, exdays) {
			    var d = new Date();
			    d.setTime(d.getTime() + (exdays*24*60*60*1000));
			    var expires = "expires="+d.toUTCString();
			    document.cookie = cname + "=" + cvalue + "; " + expires + '; path=/';
			},
			getCookie: function(cname) {
			    var name = cname + "=";
			    var ca = document.cookie.split(';');
			    for(var i=0; i<ca.length; i++) {
			        var c = ca[i];
			        while (c.charAt(0)==' ') c = c.substring(1);
			        if (c.indexOf(name) == 0) return c.substring(name.length,c.length);
			    }
			    return "";
			}
		},
		timeConvert: function(d1, d2){
			var parsed = {
				years: 0,
				months: 0,
				days: 0,
				hours: 0,
				minutes: 0,
				seconds: 0,
				milisseconds: 0
			};
			var times = {
				year: 31536000e3,
				month: 2628000e3,
				day: 86400e3,
				hour: 3600e3,
				min: 60e3,
				sec: 1e3
			};
			var diff = d1 - (d2||0);

			if (diff >= times.year){
				parsed.years = Math.floor(diff/times.year);
				diff -= parsed.years*times.year;
			}

			if (diff >= times.month){
				parsed.months = Math.floor(diff/times.month);
				diff -= parsed.months*times.month;
			}

			if (diff >= times.day){
				parsed.days = Math.floor(diff/times.day);
				diff -= parsed.days*times.day;
			}

			if (diff >= times.hour){
				parsed.hours = Math.floor(diff/times.hour);
				diff -= parsed.hours*times.hour;
			}

			if (diff >= times.min){
				parsed.minutes = Math.floor(diff/times.min);
				diff -= parsed.minutes*times.min;
			}

			if (diff >= times.sec){
				parsed.seconds = Math.floor(diff/times.sec);
				diff -= parsed.seconds*times.sec;
			}

			parsed.milisseconds = diff;

			return parsed;
		},

		url: {
			//useful regex from http://stackoverflow.com/a/3809435, this works much better than the old regex
			regex: /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}(\.[a-z]{2,6})?\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g,
			serverUrl: 'https://mp-caipira.rhcloud.com/',
			getURLData: function(url, data, body, callback){
				//note: images have the content-type starting with image/*
				//others types: http://webdesign.about.com/od/multimedia/a/mime-types-by-content-type.htm
				//useful to show image loading: http://stackoverflow.com/questions/76976/how-to-get-progress-from-xmlhttprequest
				//ps: CORS, CORS!!!
				//can solve using this tool: https://cors-anywhere.herokuapp.com/[full_request_url_here]
				//example: https://robwu.nl/cors-anywhere.html

				if (typeof data != 'string' && !Array.isArray(data)) return console.log('Invalid headers field');
				if (typeof callback != 'function') return console.log('Callback must be required');

				if (typeof data == 'string') data = [data];
				var xhttp = new XMLHttpRequest();

				xhttp.onreadystatechange = function() {
					if (xhttp.readyState == 4) {
						if (xhttp.status == 200){
							var fields = {};

							for (var i in data){
								fields[data[i]] = xhttp.getResponseHeader(data[i]);
							}
							callback(fields, url, xhttp.responseText);
						}else{
							callback(null, url);
						}
				    }
			  	};
			  	xhttp.open((body ? "GET" : "HEAD"), MP.url.serverUrl+url, true);
		  		xhttp.send();
			},
			parse: function(txt, keep_protocol_js_url){
				return txt.replace(this.regex,function(a){
					return '<a target="_blank" href="'+a+'">'+(keep_protocol_js_url && /.js$/i.test(a) ? a : a.replace(/^https?:\/\//i, ''))+'</a>';
				});
			},

			match: function(txt){
				return txt.match(this.regex) || [];
			}
		},

		chatImage: {
			knownSites: [
				'prntscr.com/',
				'giphy.com/gifs/',
				'500px.com/photo/',
				'pixabay.com/',
				'flickr.com/photos/'
			],
			append: function(element, url, imgClickUrl){
				imgClickUrl = imgClickUrl ? imgClickUrl : url;
				var settings = JSON.parse(localStorage.getItem("settings"));
				if (url.indexOf('https://i.mqp.io/sslproxy?') != 0) {
					url = 'https://i.mqp.io/sslproxy?' + url;
				}
				element.append('<span class="image-content" style="color: #79BE6C; cursor: pointer;"><span class="image-toggle" onclick="API.util.toggle_images(\''+escape(url)+'\',\''+escape(imgClickUrl)+'\',this);" style="cursor: pointer;">[Show Image]</span></span> ');
				element.closest('.cm').addClass('cm-media');

				if (settings && settings.roomSettings && settings.roomSettings.showImages)
					element.find('.image-toggle').last().click();
			},
			parse: function(msg, cid){
				if (!msg || !cid) return;

				var urls = MP.url.match(msg);

				if (urls.length > 0){
					var msgdom = $('#cm-' + cid + ' .umsg');
					if (!msgdom.length) return;

					msgdom.append('<br>');

					var settings = JSON.parse(localStorage.getItem("settings"));

					for (var i in urls){
						if (urls[i].match(/(https?:\/\/i.mqp.io\/sslproxy\?)/g) != null) {
							continue;
						}
						if (urls[i].match(/\.(png|jpe?g|gif)/i) != null){
							MP.chatImage.append(msgdom, urls[i]);
						}else{
							var reg = new RegExp('('+MP.chatImage.knownSites.join('|').replace(/\./g,'\\\.').replace(/\//g,'\\\/')+')','i');
							if (urls[i].match(reg) != null){
								MP.chatImage.getImageFromMeta(urls[i], false, function(imgurl){
									if (imgurl){
										MP.chatImage.append(msgdom, imgurl);
									}
								});
							}
							if (urls[i].match(/facebook.com\/(.*?)\/?photo(s\/)?/) != null){
								MP.url.getURLData(urls[i], [], true, function(fields, pageurl, body){
									if (!body) return;

									var imgurl = (body.match(/<img(.*?)class="fbPhotoImage img"(.*?)src="(.*?)"(.*?)alt="/)||[])[3];

									if (!imgurl) return;
									imgurl = imgurl.replace(/&amp;/g,'&');
									MP.chatImage.append(msgdom, imgurl);
								});
							}
							var ytmatch = urls[i].match(/^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/);
							var ytid = ((ytmatch&&ytmatch[7].length==11)? ytmatch[7] : false);
							if (ytid != false){
								MP.chatImage.append(msgdom, "https://img.youtube.com/vi/" + ytid + "/mqdefault.jpg", urls[i]);
							}
						}
					}
				}
			},

			getImageFromMeta: function(url, imgLength, callback){
				MP.url.getURLData(url, ['x-final-url'], true, function(fields, _url, body){
					if (!body) return callback(null);

					var imgurl = (body.match(/<meta.*property=['"]og:image['"].*>/)||[])[0];

					if (!imgurl) return callback(null);

					imgurl = imgurl.match(MP.url.regex)[0];

					if (imgLength){
						MP.url.getURLData(imgurl, ['Content-length'], false, function(_fields, _imgurl, _body){
							callback(imgurl, _fields['Content-length']);
						});
					}else{
						callback(imgurl);
					}
				});
			},
			showModal: function(url){
				API.util.makeCustomModal({
					content: '<div class="image-modal"><div id="image-preview"></div>',
					buttons: [
						{
							icon: 'mdi-arrow-left-bold',
							handler: function(){
				//				$('.modal-bg').remove();
							},
							classes: 'modal-yes'
						},
						{
							icon: 'mdi-close',
							handler: function(){
								$('.modal-bg').remove();
							},
							classes: 'modal-no'
						},
						{
							icon: 'mdi-arrow-right-bold',
							handler: function(){
				//				$('.modal-bg').remove();
							},
							classes: 'modal-yes'
						}
					],
					style: {
						width:'auto',
						height:'auto',
						'min-width':'35%',
						'min-height':'35%',
						'max-width':'80%',
						'max-height':'80%',
						display:'table'
					},
					dismissable: true,
					appendTo: '#app-left',
					callback: function(){
						$('.modal-box').css({display: 'table-cell'});
						var img = new Image();
						img.src = url;
						img.style = 'width: 100%; height: 100%;';

						$('#image-preview').append(img);
					}
				});
			}
		},

		api: {
			queue: {
				join: function(callback){
					if (typeof callback != 'function') callback = function(){};

					var user = MP.user;
					if (!user){
						callback('notLoggedIn');
						return false;
					}
					if (!MP.checkPerm('djqueue.join')){
						callback('InsufficientPermissions');
						return false;
					}
					if (MP.findPosInWaitlist() >= 0){
						callback('alreadyInQueue');
						return false;
					}
					if (MP.session.queue.lock && !MP.checkPerm('djqueue.joinlocked')){
						callback('queueLocked');
						return false;
					}
					MP.djQueueJoin(callback);
					return true;
				},
				leave: function(callback){
					if (typeof callback != 'function') callback = function(){};

					var user = MP.user;
					if (!user){
						callback('notLoggedIn');
						return false;
					}
					if (!MP.checkPerm('djqueue.leave')){
						callback('InsufficientPermissions');
						return false;
					}
					if (MP.findPosInWaitlist() == -1){
						callback('notInQueue');
						return false;
					}
					MP.djQueueLeave(callback);
					return true;
				},
				modAddDJ: function(uid, position, callback){
					if (typeof position == 'function'){
						callback = position;
						position = undefined;
					}
					if (typeof callback != 'function') callback = function(){};

					if (!MP.user){
						callback('notLoggedIn');
						return false;
					}

					if (typeof position == 'number'){
						position--;
					}

					var user = MP.findUser(uid);
					if (!user){
						callback('userNotFound');
						return false;
					}
					if (MP.findPosInWaitlist(uid) >= 0){
						callback('alreadyInQueue');
						return false;
					}
					if (MP.session.queue.lock && !MP.checkPerm('djqueue.move')){
						callback('InsufficientPermissions');
						return false;
					}
					MP.djQueueModAdd(user.uid, position, callback);
					return true;
				},
				modRemoveDJ: function(uid, callback){
					if (typeof callback != 'function') callback = function(){};

					if (!MP.user){
						callback('notLoggedIn');
						return false;
					}

					var user = MP.findUser(uid);
					if (!user){
						callback('userNotFound');
						return false;
					}
					if (MP.findPosInWaitlist(user.uid) == -1){
						callback('notInQueue');
						return false;
					}
					if (MP.session.queue.lock && !MP.checkPerm('djqueue.move')){
						callback('InsufficientPermissions');
						return false;
					}
					MP.djQueueModRemove(user.uid, callback);
					return true;
				},
				modSwapDJ: function(uid1, uid2, callback){
					if (typeof callback != 'function') callback = function(){};

					if (!MP.user){
						callback('notLoggedIn');
						return false;
					}

					if (MP.session.queue.lock && !MP.checkPerm('djqueue.move')){
						callback('InsufficientPermissions');
						return false;
					}

					var user1 = MP.findUser(uid1);
					var user2 = MP.findUser(uid2);
					if (!user1 || !user2){
						callback('userNotFound');
						return false;
					}
					if (user1.uid == user2.uid){
						callback('sameUser');
						return false;
					}
					if (MP.findPosInWaitlist(user1.uid) == -1 || MP.findPosInWaitlist(user2.uid) == -1){
						callback('notInQueue');
						return false;
					}
					MP.djQueueModSwap(user1.uid, user2.uid, callback);
					return true;
				},
				modMoveDJ: function(uid, position, callback){
					if (typeof callback != 'function') callback = function(){};

					if (!MP.user){
						callback('notLoggedIn');
						return false;
					}

					if (MP.session.queue.lock && !MP.checkPerm('djqueue.move')){
						callback('InsufficientPermissions');
						return false;
					}

					var user = MP.findUser(uid);
					if (!user){
						callback('userNotFound');
						return false;
					}
					if (MP.findPosInWaitlist(user.uid) == -1){
						callback('notInQueue');
						return false;
					}
					MP.djQueueModMove(user.uid, position, callback);
					return true;
				},
				skip: function(lockSkipPosition, callback){
					if (typeof lockSkipPosition == 'function'){
						callback = lockSkipPosition;
						lockSkipPosition = undefined;
					}
					if (typeof callback != 'function') callback = function(){};

					if (!MP.checkPerm('djqueue.skip.self') && !MP.checkPerm('djqueue.skip.other')){
						callback('InsufficientPermissions');
						return false;
					}
					MP.djQueueSkip(lockSkipPosition, callback);
				},
				setLock: function(status, callback){
					if (typeof status == 'function'){
						callback = status;
						status = !MP.session.queue.lock;
					}
					if (typeof status == 'undefined') status = !MP.session.queue.lock;
					if (typeof callback != 'function') callback = function(){};

					if (!MP.user){
						callback('notLoggedIn');
						return false;
					}

					if (!MP.checkPerm('djqueue.lock')){
						callback('InsufficientPermissions');
						return false;
					}

					if (status == MP.session.queue.lock){
						callback('noChange');
						return false;
					}

					MP.djQueueLock(callback);
					return true;
				},
				setCycle: function(status, callback){
					if (typeof status == 'function'){
						callback = status;
						status = !MP.session.queue.cycle;
					}
					if (typeof status == 'undefined') status = !MP.session.queue.cycle;
					if (typeof callback != 'function') callback = function(){};

					if (!MP.user){
						callback('notLoggedIn');
						return false;
					}

					if (MP.checkPerm('djqueue.cycle')){
						callback('InsufficientPermissions');
						return false;
					}

					if (status == MP.session.queue.cycle){
						callback('noChange');
						return false;
					}

					MP.djQueueCycle(callback);
					return true;
				},
				setLimit: function(limit, callback){
					if (typeof callback != 'function') callback = function(){};

					if (!MP.user){
						callback('notLoggedIn');
						return false;
					}

					if (MP.checkPerm('djqueue.limit')){
						callback('InsufficientPermissions');
						return false;
					}

					if (typeof limit != 'number' || limit < 1){
						callback('invalidValue');
						return false;
					}
					MP.djQueueLimit(limit, callback);
					return true;
				},
				getDJ: function(){
					return MP.session.queue.currentdj;
				},
				getDJs: function(arr){
					if (typeof arr == 'undefined')	arr = true;

					if (arr){
						var queue = [];

						for (var i in MP.session.queue.users){
							queue.push(MP.seenUsers[MP.session.queue.users[i]]);
						}
						return queue;
					}else{
						var queue = {};

						for (var i in MP.session.queue.users){
							var user = MP.seenUsers[MP.session.queue.users[i]];
							queue[user.uid] = user;
						}
						return queue;
					}
				},
				getPosition: function(uid){
					return MP.findPosInWaitlist(uid);
				},
				getInfo: function(){
					return {
						lock: MP.session.queue.lock,
						cycle: MP.session.queue.cycle,
						length: this.getDJs(true).length,
						dj: this.getDJ()
					};
				}
			},
			room: {
				getInfo: function(callback){
					if (typeof callback == 'function') return MP.getRoomInfo(callback);
					return MP.session.roomInfo;
				},
				isLoggedIn: function(){
					return MP.isLoggedIn();
				},
				getUser: function(uid, callback){
	                if(callback) {
	                    var obj = {
	                        type: 'getUser',
	                        data: {
	                            uid: uid,
	                        },
	                    };
	                    obj.id = MP.addCallback(obj.type, function(err, data){ callback(err, err ? null : data.user); });
	                    socket.sendJSON(obj);
	                } else {
	                    if (!uid) return MP.user;
	                    return MP.findUser(uid);
	                }
				},
				getUserByName: function(un, callback){
	                if(callback) {
	                    var obj = {
	                        type: 'getUserByName',
	                        data: {
	                            un: un,
	                        },
	                    };
	                    obj.id = MP.addCallback(obj.type, function(err, data){ callback(err, err ? null : data.user); });
	                    socket.sendJSON(obj);
	                } else {
	                    if (!un) return MP.user;
	                    var users = MP.api.util.objectToArray(MP.getUsersInRoom());
						return users.filter(function(a){ return a.un == un; })[0];
	                }
				},
				getUsers: function(arr){
					if (typeof arr == 'undefined')	arr = false;

					var users = MP.getUsersInRoom();
					if (arr){
						return MP.api.util.objectToArray(users);
					}
					return users;
				},
				getRoles: function(arr){
					if (typeof arr == 'undefined')	arr = false;

					var roles = MP.session.roles;
					if (arr){
						return MP.api.util.objectToArray(roles);
					}
					return roles;
				},
				getHistory: function(callback){
					if (typeof callback == 'undefined'){
						return MP.historyList.history;
					}
					MP.getHistory(callback);
				},
				getMedia: function(){
					return MP.media.media;
				},
				getTimeElapsed: function(){
					return MP.getTimeElapsed();
				},
				getTimeRemaining: function(){
					return MP.getTimeRemaining();
				},
				setRole: function(uid, role, callback){
					if (typeof callback != 'function') callback = function(){};

					if (!MP.user){
						callback('notLoggedIn');
						return false;
					}

					if (!MP.checkPerm('room.grantroles')){
						callback('InsufficientPermissions');
						return false;
					}

					if (!role){
						callback('invalidRole');
						return false;
					}
					role = role.toLowerCase();

					var roles = this.getRoles(false);
					if (!roles || roles[role].canGrantRoles.indexOf(role) == -1){
						callback('invalidRole');
						return false;
					}

					var user = MP.findUser(uid);
					if (!user){
						callback('userNotFound');
						return false;
					}

					MP.setRole(uid, role, callback);
					return true;
				},
				getStaff: function(callback){
					if (typeof callback != 'function') return MP.session.roomStaff;
					MP.getRoomStaff(callback);
				},
				getBannedUsers: function(callback){
					if (typeof callback != 'function') return MP.session.bannedUsers;
					MP.getBannedUsers(callback);
				},
				restrictUser: function(uid, duration, type, reason, callback){
					if (typeof reason == 'function'){
						callback = reason;
						reason = '';
					}
					if (!reason) reason = '';

					if (typeof callback != 'function') callback = function(){};

					if (!MP.user){
						callback('notLoggedIn');
						return false;
					}

					if (!MP.checkPerm('room.restrict.' + type.toLowerCase())){
						callback('InsufficientPermissions');
						return false;
					}

					if (!duration){
						callback('missingDuration');
						return false;
					}

					var user = MP.findUser(uid);
					if (!user){
						callback('userNotFound');
						return false;
					}
					MP.restrictUser(uid, duration, type, reason, callback);
					return true;
				},
				unrestrictUser: function(uid, type, callback){
					if (typeof callback != 'function') callback = function(){};

					if (!MP.user){
						callback('notLoggedIn');
						return false;
					}

					if (!MP.checkPerm('room.restrict.' + type.toLowerCase())){
						callback('InsufficientPermissions');
						return false;
					}
					if (!uid){
						callback('invalidUid');
						return false;
					}

					MP.unrestrictUser(uid, type, callback);
					return true;
				},
				getUserRestrictions: function(uid, callback){
					if (typeof callback != 'function') callback = function(){};
					
					if (!MP.user){
						callback('notLoggedIn');
						return false;
					}
					
					//if (!MP.checkPerm('room.restrict')){
					//	callback('InsufficientPermissions');
					//	return false;
					//}
					
					if (!uid){
						callback('invalidUid');
						return false;
					}

					MP.getUserRestrictions(uid, callback);
					return true;
				},
				whois: function(data, callback){
	                if(!MP.checkPerm('room.whois')) return false;
	
					var obj = {
						type: 'whois',
						data: (Number.isNaN(data) || !Number.isInteger(Number(data))) ?
							{ un: (((data || "")[0] == '@' ? data.slice(1) : data) || MP.user.un) }
								:
							{ uid: data }
					}
	
					obj.id = MP.addCallback(obj.type, callback);
	
					socket.sendJSON(obj);
	
					return true;
				},
				iphistory: function(data, callback){
					if(!MP.checkPerm('room.whois.iphistory')) return false;
	
					var obj = {
						type: 'iphistory',
						data: (Number.isNaN(data) || !Number.isInteger(Number(data))) ?
							{ un: (((data || "")[0] == '@' ? data.slice(1) : data) || MP.user.un) }
								:
							{ uid: data }
					}
	
					obj.id = MP.addCallback(obj.type, callback);
	
					socket.sendJSON(obj);
	
					return true;
				},
			},
			chat: {
				filter: '',
				filterTypes: {
					'mentions': function () { return $('#messages .cm.message:not(.mention)'); },
					'staff': function () { return $('#messages .cm.message:not(.staffchat)'); },
					'media': function () { return $('#messages .cm.message:not(.cm-media)'); }
				},
				getConversations: function(callback) {
					MP.getConversations(function (err, data) {
						if (callback) {
							if (callback.length == 1) {
								callback(data);
							}
							else {
								callback(err, data);
							}
						}
					});
				},
				getPrivateConversation: function(uid, callback) {
					MP.getPrivateConversation(uid, function (err, data) {
						if (callback) {
							if (callback.length == 1) {
								callback(data);
							}
							else {
								callback(err, data);
							}
						}
					});
				},
				log: function(a,b){
					MP.addMessage({msg:a,user:{un:b}}, 'log');
				},
				system: function(msg){
					MP.addMessage(msg, 'system');
				},
				broadcast: function(msg){
					if (!MP.user || !MP.checkPerm('chat.broadcast')) return false;

					MP.sendBroadcast(msg);
					return true;
				},
				send: function(msg){
					if (!MP.user || !msg || !MP.checkPerm('chat.send')) return false;

					MP.sendMessage(msg);
					return true;
				},
				sendPrivate: function(uid, message, callback){
					MP.privateMessage(uid, message, callback);
				},
				delete: function(cid, callback){
					if (!MP.user || !cid || !MP.checkPerm('chat.delete')) return false;

					MP.deleteChat(cid, callback);
					return true;
				},
				getPos: function(){
					var $chat = $("#chat");
					return $chat[0].scrollTop + $chat.height() - $chat[0].scrollHeight + 20;
				},
				setPos: function(pos){
					var $chat = $("#chat");
					$chat.scrollTop(pos);
				},
				scrollBottom: function(){
					var $chat = $("#chat");
					$chat.scrollTop($chat[0].scrollHeight);
				}
			},
			playlist: {
				get: function(pid, arr){
					if (typeof pid == 'boolean'){
						arr = pid;
						pid = null;
					}
					if (typeof arr == 'undefined') arr = true;

					if (pid) return MP.user.playlists[pid];

					var playlists = MP.user.playlists;

					if (arr) playlists = MP.api.util.objectToArray(playlists);
					return playlists;
				},
				getActive: function(){
					if (!MP.user || !MP.user.activepl || !MP.user.playlists || !MP.user.playlists[MP.user.activepl]) return null;
					return MP.user.playlists[MP.user.activepl];
				},
				activate: function(pid, callback){
					if (!pid){
						if (typeof callback === 'function') callback('invalidPlaylistID');
						return false;
					}

					if (!MP.user){
						if (typeof callback === 'function') callback('notLoggedIn');
						return false;
					}

					if (!MP.user.playlists || !MP.user.playlists[pid]) {
						if (typeof callback === 'function') callback('playlistNotFound');
						return;
					}

					MP.playlistActivate(pid, callback);
					return true;
				},
				getNextSong: function(){
					if (!MP.user || !MP.user.activepl || !MP.user.playlists || !MP.user.playlists[MP.user.activepl]) return null;
					return MP.user.playlists[MP.user.activepl].content[0] || null;
				},
				create: function(name, callback){
					if (typeof callback != 'function') callback = function(){};

					if (!MP.user){
						callback('notLoggedIn');
						return false;
					}

					if (!MP.checkPerm('playlist.create')){
						callback('InsufficientPermissions');
						return false;
					}
					if (!name){
						callback('emptyName');
						return false;
					}

					MP.playlistCreate(name, callback);
					return true;
				},
				delete: function(pid, callback){
					if (typeof callback != 'function') callback = function(){};

					if (!MP.user){
						callback('notLoggedIn');
						return false;
					}

					if (!MP.checkPerm('playlist.delete')){
						callback('InsufficientPermissions');
						return false;
					}
					if (!MP.user.playlists[pid]){
						callback('playlistNotFound');
						return false;
					}
					MP.playlistDelete(pid, callback);
					return true;
				},
				addSong: function(pid, cid, pos, callback){
					if (typeof pos == 'function'){
						callback = pos;
						pos = 0;
					}
					if (typeof pos != 'number') pos = 0;
					if (typeof callback != 'function') callback = function(){};

					if (!pid || !cid){
						callback('invalidPidOrCid');
						return false;
					}

					if (Array.isArray(cid) && cid.length == 0) {
						callback('emptyCidArray');
						return false;
					}
/*
					if (typeof pid == 'string'){
						var pl = this.get().filter(function(a){return a.name == pid;})[0];

						if (pl == undefined){
							callback('playlistNotFound');
							return false;
						}
						pid = pl.id;
					}
*/
					if (!MP.user.playlists[pid]){
						callback('playlistNotFound');
						return false;
					}
					if (MP.user.playlists[pid].content && MP.user.playlists[pid].content.filter(function(a){return a.cid == cid;}).length>0){
						callback('SongAlreadyInPlaylist');
						return false;
					}

					MP.playlistAdd(pid, cid, pos, callback);
					return true;
				},
				removeSong: function(pid, cid, callback){
					if (typeof callback != 'function') callback = function(){};

					if (!pid || !cid){
						callback('invalidPidOrCid');
						return false;
					}
					if (!MP.user.playlists[pid]){
						callback('playlistNotFound');
						return false;
					}

					MP.playlistRemove(pid, cid, callback);
					return true;
				},
				moveSong: function(pid, cid, pos, callback){
					if (typeof pos == 'function'){
						callback = pos;
						pos = 0;
					}
					if (typeof pos != 'number') pos = 0;
					if (typeof callback != 'function') callback = function(){};

					if (!pid || !cid){
						callback('invalidPidOrCid');
						return false;
					}
					if (!MP.user.playlists[pid]){
						callback('playlistNotFound');
						return false;
					}
					MP.playlistMove(pid, cid, pos, callback);
					return true;
				},
				getContents: function(pid, arr, callback){
					if (!pid){
						callback('invalidPid');
						return false;
					}
					if (!MP.user.playlists[pid]){
						callback('playlistNotFound');
						return false;
					}

					if (typeof callback == 'undefined') return MP.user.playlists[pid].content;
					MP.getPlaylistContents(pid, callback);
					return true;
				},
				shuffle: function(pid, callback){
					if (!MP.checkPerm('playlist.shuffle')){
						if (callback) callback('InsufficientPermissions');
						return false;
					}

					if(!(pid = pid || MP.session.viewedPl)){
						if (callback) callback('NoPlaylistSelected');
						return false;
					}
					var obj = {
						type: 'playlistShuffle',
						data: {
							pid: pid,
						}
					};
					obj.id = MP.addCallback(obj.type, function(err, data){
						if(err) return;
						if("function" === typeof callback) callback(null, MP.copyObject(data));
						MP.user.playlists[pid].content = data.content;
						MP.applyModels();
					});
					socket.sendJSON(obj);
					return true;
				},
				import: function(pid, expand, callback){
					if (!MP.checkPerm('playlist.import')){
						if (callback) callback('InsufficientPermissions');
						return false;
					}
					MP.playlistImport(pid, expand, callback);
				}
			},
			util: {
				makeAlertModal: function(opts){MP.makeAlertModal(opts);},
				makeCustomModal: function(opts){MP.makeCustomModal(opts);},
				showBanModal: function(uid){MP.showBanModal(uid);},
				showRoleModal: function(uid){MP.showRoleModal(uid);},
				showRestrictionModal: function(uid){MP.showRestrictionModal(uid);},
				objectToArray: function(obj){
					if (typeof obj != 'object' || obj == null)	return [];
					var arr = [];

					for (var i in obj) arr.push(obj[i]);
					return arr;
				},
				timeConvert: function(d1,d2){return MP.timeConvert(d1,d2);},
				youtube_parser: function(url){
				    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
				    var match = url.match(regExp);
				    return (match && match[7].length == 11) ? match[7] : false;
				}, // Useful function from http://stackoverflow.com/a/8260383
				colourNameToHex: function(colour){ // Useful function from http://stackoverflow.com/questions/1573053/javascript-function-to-convert-color-names-to-hex-codes
					var colours = {"aliceblue":"#f0f8ff","antiquewhite":"#faebd7","aqua":"#00ffff","aquamarine":"#7fffd4","azure":"#f0ffff",
				    "beige":"#f5f5dc","bisque":"#ffe4c4","black":"#000000","blanchedalmond":"#ffebcd","blue":"#0000ff","blueviolet":"#8a2be2",
				    "brown":"#a52a2a","burlywood":"#deb887","cadetblue":"#5f9ea0","chartreuse":"#7fff00","chocolate":"#d2691e","coral":"#ff7f50",
				    "cornflowerblue":"#6495ed","cornsilk":"#fff8dc","crimson":"#dc143c","cyan":"#00ffff","darkblue":"#00008b","darkcyan":"#008b8b",
				    "darkgoldenrod":"#b8860b","darkgray":"#a9a9a9","darkgreen":"#006400","darkkhaki":"#bdb76b","darkmagenta":"#8b008b",
				    "darkolivegreen":"#556b2f","darkorange":"#ff8c00","darkorchid":"#9932cc","darkred":"#8b0000","darksalmon":"#e9967a",
				    "darkseagreen":"#8fbc8f","darkslateblue":"#483d8b","darkslategray":"#2f4f4f","darkturquoise":"#00ced1","darkviolet":"#9400d3",
				    "deeppink":"#ff1493","deepskyblue":"#00bfff","dimgray":"#696969","dodgerblue":"#1e90ff","firebrick":"#b22222",
				    "floralwhite":"#fffaf0","forestgreen":"#228b22","fuchsia":"#ff00ff","gainsboro":"#dcdcdc","ghostwhite":"#f8f8ff","gold":"#ffd700",
				    "goldenrod":"#daa520","gray":"#808080","green":"#008000","greenyellow":"#adff2f","honeydew":"#f0fff0","hotpink":"#ff69b4",
				    "indianred ":"#cd5c5c","indigo":"#4b0082","ivory":"#fffff0","khaki":"#f0e68c","lavender":"#e6e6fa","lavenderblush":"#fff0f5",
				    "lawngreen":"#7cfc00","lemonchiffon":"#fffacd","lightblue":"#add8e6","lightcoral":"#f08080","lightcyan":"#e0ffff",
				    "lightgoldenrodyellow":"#fafad2","lightgrey":"#d3d3d3","lightgreen":"#90ee90","lightpink":"#ffb6c1","lightsalmon":"#ffa07a",
				    "lightseagreen":"#20b2aa","lightskyblue":"#87cefa","lightslategray":"#778899","lightsteelblue":"#b0c4de","lightyellow":"#ffffe0",
				    "lime":"#00ff00","limegreen":"#32cd32","linen":"#faf0e6","magenta":"#ff00ff","maroon":"#800000","mediumaquamarine":"#66cdaa",
				    "mediumblue":"#0000cd","mediumorchid":"#ba55d3","mediumpurple":"#9370d8","mediumseagreen":"#3cb371","mediumslateblue":"#7b68ee",
				    "mediumspringgreen":"#00fa9a","mediumturquoise":"#48d1cc","mediumvioletred":"#c71585","midnightblue":"#191970",
				    "mintcream":"#f5fffa","mistyrose":"#ffe4e1","moccasin":"#ffe4b5","navajowhite":"#ffdead","navy":"#000080","oldlace":"#fdf5e6",
				    "olive":"#808000","olivedrab":"#6b8e23","orange":"#ffa500","orangered":"#ff4500","orchid":"#da70d6","palegoldenrod":"#eee8aa",
				    "palegreen":"#98fb98","paleturquoise":"#afeeee","palevioletred":"#d87093","papayawhip":"#ffefd5","peachpuff":"#ffdab9",
				    "peru":"#cd853f","pink":"#ffc0cb","plum":"#dda0dd","powderblue":"#b0e0e6","purple":"#800080","red":"#ff0000",
				    "rosybrown":"#bc8f8f","royalblue":"#4169e1","saddlebrown":"#8b4513","salmon":"#fa8072","sandybrown":"#f4a460",
				    "seagreen":"#2e8b57","seashell":"#fff5ee","sienna":"#a0522d","silver":"#c0c0c0","skyblue":"#87ceeb","slateblue":"#6a5acd",
				    "slategray":"#708090","snow":"#fffafa","springgreen":"#00ff7f","steelblue":"#4682b4","tan":"#d2b48c","teal":"#008080",
				    "thistle":"#d8bfd8","tomato":"#ff6347","turquoise":"#40e0d0","violet":"#ee82ee","wheat":"#f5deb3","white":"#ffffff",
				    "whitesmoke":"#f5f5f5","yellow":"#ffff00","yellowgreen":"#9acd32"};

				    if (typeof colours[colour.toLowerCase()] != 'undefined')
				        return colours[colour.toLowerCase()];

				    return false;
				},
				makeStyleString: function(obj){
					var style = '';

					for (var i in obj){
						style += (i + ': ' + obj[i] + '; ');
					}

					return style;
				},
				toggle_images: function(url,clickUrl,ctx){
					if (!url || !clickUrl || !ctx)
						return;
					ctx = $(ctx).parent();
					var img_cont = ctx.find('.image-content');

					if (!img_cont.length){
						ctx.find('.image-toggle').text('[Hide Image]');
						var el = $('<span class="image-content"></span>'),
							img_link = document.createElement('a'),
							img_el = document.createElement('img');

						el.append('<br>');
						img_link.setAttribute('class','chat-image');
						img_link.setAttribute('href', unescape(clickUrl ? clickUrl : url));
						img_link.setAttribute('target','_blank');
						img_link.setAttribute('data-lightbox', MP.session.imgc++);
						img_el.setAttribute('src', unescape(url));
						img_el.setAttribute('style','max-width: 100%;');
						img_el.onload = function(){
							var $chat = $("#chat");
							$chat.scrollTop($chat[0].scrollHeight);
						};

						img_link = $(img_link);
						img_link.append(img_el);
						el.append(img_link);
						el.append('<br>');
						ctx.append(el);
					}else{
						img_cont.remove();
						ctx.find('.image-toggle').text('[Show Image]');
					}
				},
				changefavicon: function(src) {
					var link = document.createElement('link'),
					oldLink = document.getElementById('dynamic-favicon');
					link.id = 'dynamic-favicon';
					link.rel = 'shortcut icon';
					link.href = src;
					if (oldLink) {
						document.head.removeChild(oldLink);
					}
					document.head.appendChild(link);
				},
                desktopnotif: {
                    getPermission: function(callback) {
                        if (typeof Notification === 'undefined') {
                            return false;
                        }
                        Notification.requestPermission(function (permission) {
                            if (callback !== undefined) {
                                callback(permission);
                            }
                        });
                    },
                    showNotification: function(title, message, iconPath) {
                        iconPath = iconPath || "https://musiqpad.com/pads/lib/img/icon.png";
                        MP.api.util.desktopnotif.getPermission(function(permission) {
                            if (permission !== 'granted') return;

							var settings = JSON.parse(localStorage.getItem("settings"));
							if (!settings.roomSettings.notifications.desktop.showfocused && document.hasFocus()) return;

                            var notification = new Notification(title, {
                                icon: iconPath,
                                body: "[" + MP.session.roomInfo.slug + "] " + MP.session.roomInfo.name + "\n" + message,
                            });

                            notification.onclick = function () {
                                window.focus();
                                this.close();
                            };

                            setTimeout(function() {
                                notification.close();
                            }, 3500);
                        });
                    }
                },
			},
			showLogin: function(){
				$('#creds-back').css('display','table');
				$('.dash, #app-left, #app-right').hide();
				$('#l-email').focus();

				if (MP.session.isCaptcha)
					grecaptcha.reset();
			},
			hideLogin: function(){
				$('#creds-back').hide();
				$('.dash, #app-left, #app-right').show();
			},
			user: {
				isBlocked: function(uid) {
					return MP.session.blockedusers.indexOf(uid) != -1;
				},
				block: function(uid, callback) {
					if(!(uid = +uid))
						return false

					var obj = {
						type: 'blockUser',
						data: {
							uid: uid
						}
					}

					obj.id = MP.addCallback(obj.type, function(err, data) {
						MP.session.blockedusers.push(uid);

						if(callback)
							callback(err, data);
					});

					socket.sendJSON(obj);
				},
				unblock: function(uid, callback) {
					if(!(uid = +uid))
						return false

					var obj = {
						type: 'unblockUser',
						data: {
							uid: uid
						}
					}

					obj.id = MP.addCallback(obj.type, function(err, data) {
						var index = MP.session.blockedusers.indexOf(uid);

						if(index != -1)
							MP.session.blockedusers.splice(index, 1);

						if(callback)
							callback(err, data);
					});

					socket.sendJSON(obj);
				}
			},
		},
		mediaPreview : {
			isOpened: function(){return MP.session.mediaPreview.player != null;},
			open: function(cid){
				var settings = JSON.parse(localStorage.getItem("settings"));

				MP.makeCustomModal({
					content: '<div class="modal-preview"><div id="player-preview" style="width:100%;"></div></div>',
					buttons: [
						{
							icon: 'mdi-close',
							handler: function(){
								$('.modal-bg').remove();
								MP.mediaPreview.close();
							},
							classes: 'modal-no'
						}
					],
					style: {
						width: '50%'
					},
					dismissable: true,
					appendTo: '.logo-menu',
					callback: function(){
						clearInterval(MP.session.mediaPreview.fadeInterval);
						MP.session.mediaPreview.mainVolume = (settings.player.mute ? 0 : settings.player.volume);
						MP.session.mediaPreview.previewVolume = MP.session.mediaPreview.mainVolume;

						MP.session.mediaPreview.player = new YT.Player('player-preview', {
							height: '390',
							width: '640',
							videoId: cid,
							playerVars: {
								controls: 1,       //Enable controls
								iv_load_policy: 3, //Disable annotations
								showinfo: 1,       //Enable video info
								autoplay: 1,	   //Enable autoplay
								fs: 0,             //Disable fullscreen
								modestbranding: 1, //Disable YT logo - YT API doesn't allow it anymore with showinfo: 0
								rel: 0,            //Disable showing related videos
								disablekb: 1,      //Disable keyboard
							}
						});
						MP.session.mediaPreview.fadeInterval = setInterval(MP.mediaPreview.fadeOut,100);
					}
				});
			},
			close: function(){
				if (!MP.session.mediaPreview.player){
					return;
				}
				MP.session.mediaPreview.player.destroy();
				MP.session.mediaPreview.player=null;

				clearInterval(MP.session.mediaPreview.fadeInterval);

				var settings = JSON.parse(localStorage.getItem("settings"));
				MP.session.mediaPreview.mainVolume = (settings.player.mute ? 0 : settings.player.volume);
				MP.session.mediaPreview.fadeInterval = setInterval(MP.mediaPreview.fadeIn,100);
			},
			fadeIn: function(){
				MP.session.mediaPreview.previewVolume += 10;
				if (MP.session.mediaPreview.previewVolume > MP.session.mediaPreview.mainVolume){
					MP.session.mediaPreview.previewVolume = MP.session.mediaPreview.mainVolume;
				}
				API.player.getPlayer().setVolume(MP.session.mediaPreview.previewVolume);

				if (MP.session.mediaPreview.previewVolume == MP.session.mediaPreview.mainVolume){
					clearInterval(MP.session.mediaPreview.fadeInterval);
				}
			},
			fadeOut: function(){
				MP.session.mediaPreview.previewVolume -= 10;
				if (MP.session.mediaPreview.previewVolume<0){
					MP.session.mediaPreview.previewVolume=0;
				}
				API.player.getPlayer().setVolume(MP.session.mediaPreview.previewVolume);

				if (MP.session.mediaPreview.previewVolume == 0){
					clearInterval(MP.session.mediaPreview.fadeInterval);
				}
			}
		},
		clearTimeRemaining: function(){
			clearInterval(MP.intervals.timeRemaining);
		},
		startTimeRemaining: function(){
			MP.clearTimeRemaining();
			MP.intervals.timeRemaining = setInterval(MP.updateTimeRemaining,1000);
		},
		updateTimeRemaining: function(){
			if (MP.media.timeRemaining == 0){
				return MP.clearTimeRemaining();
			}
			MP.media.timeRemaining--;

			MP.applyModels();
		},
		getMedia: function(){
			return MP.media.media;
		},
		getDuration: function(){
			if (!MP.media.media){
				return 0;
			}
			return MP.media.media.duration;
		},
		getTimeElapsed: function(){
			if (!MP.media.media){
				return 0;
			}
			return MP.media.media.duration - MP.media.timeRemaining;
		},
		getTimeRemaining: function(){
			return MP.media.timeRemaining;
		},
		getWaitList: function(){
			return MP.session.queue.users;
		},
		getUsersInRoom: function(){
			var out = {};

			for (var i in MP.userList.users){
				out[ MP.userList.users[i] ] = MP.seenUsers[MP.userList.users[i]];
			}

			return out;
		},
		getRoomStaff: function(callback) {
			var obj = {
				type: 'getStaff'
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				MP.session.roomStaff = data;

				for (var i in data){
					MP.seenUsers[data[i].uid] = data[i];
				}

				MP.applyModels();
				if (typeof callback == 'function') callback(err, data);
			});

			socket.sendJSON(obj);
		},
		getBannedUsers: function(callback) {
			var obj = {
				type: 'getBannedUsers'
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				MP.session.bannedUsers = data;

				for (var i in data){
					MP.seenUsers[data[i].uid] = data[i];
				}

				MP.applyModels();
				if (typeof callback == 'function') callback(err, data);
			});

			socket.sendJSON(obj);
		},
		makeBadgeStyle: function(opts){
			/*
			{
				user: {
					badge: {
						top,
						bottom,
					},
					role,
				},
				type,
				mdi,
				class,
				style,
			}
			*/

			opts.user = opts.user || {};
			var badge = $.extend(MP.copyObject(opts.user.badge || {}), { outline: ((MP.getRole(opts.user.role) || {}).style || {}).color || 'white'});

			if(!opts.mdi && badge.top && badge.bottom && badge.outline){
				var icon = (MP.getRole(opts.user.role) || {}).badge;
				
				if(icon){
					return '<div class="mdi mdi-' + icon + ' bdg-icon ' + (opts.class || '') + '" style="color: ' + badge.outline + '"></div>';
				} else {
					var gradclass = ['badgegrad', badge.top, badge.bottom, opts.type].join(';');
					return '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" version="1.1" class="bdg">\
								<defs>\
									<linearGradient id="' + gradclass + '">\
										<stop stop-color="' + badge.top + '" offset="49%"></stop>\
										<stop stop-color="' + badge.bottom + '" offset="51%"></stop>\
									</linearGradient>\
								</defs>\
								<g>\
									<circle id="circle" r="7.25" cy="8" cx="8" transform="rotate(45, 8, 8)" stroke-linecap="null" stroke-linejoin="null" stroke="' + badge.outline + '" fill="url(#' + gradclass + ')" stroke-width="1.5"></circle>\
								</g>\
							</svg>';
				}
			} else if (opts.mdi){
				return '<div class="mdi mdi-' + opts.mdi + ' bdg-icon ' + opts.class + '" style="color: ' + ((opts.style || {}).color || 'white') + ';"></div>';
			} else {
				return '';
			}

			//Three colors | no outline
			/*
			return '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg" class="bdg">\
						<defs>\
							<linearGradient id="gradient" x1="0" y1="0" x2="1" y2="1">\
								<stop offset="45%" stop-color="' + hexTop + '"/>\
								<stop offset="45.1%" stop-color="' + nameCol + '"/>\
								<stop offset="54.9%" stop-color="' + nameCol + '"/>\
								<stop offset="55%" stop-color="' + hexBot + '"/>\
							</linearGradient>\
						</defs>\
						<g>\
							<circle stroke-width="0" fill="url(#gradient)" cx="8" cy="8" r="8"/>\
						</g>\
					</svg>';
			*/

			//Original
			/*
			return 'background-image: linear-gradient(45deg, ' + hexBot + ' 45%, ' + hexTop + ' 45%); background-image: -moz-linear-gradient(45deg, ' + hexBot + ' 45%, ' + hexTop + ' 45%); background-image: -webkit-linear-gradient(45deg, ' + hexBot + ' 45%, ' + hexTop + ' 45%);';
			*/
		},
		makeUsernameStyle: function(role){
			if (MP.getRole(role)){
				var style = MP.getRole(role).style;
				var out = '';

				for (var i in style){
					out += (i + ': ' + style[i] + '; ');
				}

				return out;
			}else{
				return '';
			}
		},
		emojiReplace: function(text){
			var settings = JSON.parse(localStorage.settings).roomSettings;

			//Check if emojis are disabled
			if(!settings.enableEmojis) return text;

			//Parse all ASCII emojis
			if(settings.emojis['basic'])
				for(var key in MP.emotes_ascii){
					text = text.replace(new RegExp("(^|\\s)(" + key.replace("<", "&lt;").replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + ")(?=\\s|$)", "g"), "$1:" + MP.emotes_ascii[key] + ":");
				}

			//Check for all emojis to replace
		    var toReplace = text.match(/:[\+a-zA-Z0-9_-]+:/g);

		    if(toReplace){
		        toReplace = toReplace.map(function(x){ return x.slice(1, -1).toLowerCase(); }).filter(function(e, i, a){ return a.indexOf(e) === i; });
		        for(var i in toReplace){
		        	for(var emoset in MP.emotes)
			        	if(MP.emotes[emoset][toReplace[i]] && JSON.parse(localStorage.settings).roomSettings.emojis[emoset.toLowerCase()]){
			            	text = text.replace(new RegExp(':' + toReplace[i].replace('+', '\\+') + ':', 'gi'), '<img align="absmiddle" alt=":' + toReplace[i] + ':" class="emoji" src="' + MP.emotes[emoset][toReplace[i]].url + '" title=":' + toReplace[i] + ':"' + (MP.emotes[emoset][toReplace[i]].style ? 'style="' + MP.emotes[emoset][toReplace[i]].style + '"' : '') + ' />');
			            	break;
			        	}
		        }
		        return text;
		    } else return text;
		},
		loadEmoji: function(reload, callback){
			if(reload) MP.emotes = { Basic: {}, TastyCat: {}, Twitch: {}, BetterTTV: {} };
			if(!MP.session.allowemojis) return;

			//Basic
			$.getJSON("https://raw.githubusercontent.com/Ranks/emojione/2.2.7/emoji.json", function(data) {
				for(var e in data){
					//MP.emotes[e] = MP.emotes[e] || "https://raw.githubusercontent.com/Ranks/emojify.js/master/dist/images/basic/" + e + ".png";
					MP.emotes["Basic"][e] = MP.emotes["Basic"][e] || { url: "https://raw.githubusercontent.com/Ranks/emojione/master/assets/png/" + data[e].unicode + ".png" };

					//Regular aliases
					if(data[e].aliases)
						for(var ee in data[e].aliases){
							ee = data[e].aliases[ee].slice(1, -1);
							//MP.emotes[ee] = MP.emotes[ee] || "https://raw.githubusercontent.com/Ranks/emojify.js/master/dist/images/basic/" + e + ".png";
							MP.emotes["Basic"][ee] = MP.emotes["Basic"][ee] || { url: "https://raw.githubusercontent.com/Ranks/emojione/2.2.7/assets/png/" + data[e].unicode + ".png", style: 'max-width: 24px; max-height: 24px;', };
						}

					//ASCII aliases
					if(data[e].aliases_ascii)
						for(var ee in data[e].aliases_ascii)
							MP.emotes_ascii[data[e].aliases_ascii[ee]] = MP.emotes_ascii[data[e].aliases_ascii[ee]] || e;
				}
				//Trollface emote
				var e = 'trollface';
				MP.emotes['Basic'][e] = MP.emotes['Basic'][e] || { url: 'https://raw.githubusercontent.com/Ranks/emojify.js/master/dist/images/basic/' + e + '.png', };
			 }).done(function(){
	            //TastyCat
			 	$.getJSON("https://emotes.tastycat.org/emotes-full.json", function(data) {
			 		for(var e in data.emotes)
		 				MP.emotes["TastyCat"][e.toLowerCase().replace('&', 'n')] = MP.emotes["TastyCat"][e.toLowerCase().replace('&', 'n')] || { url: data.emotes[e].url, style: 'max-width: ' + data.emotes[e].width + 'px ;max-height: ' + data.emotes[e].height + 'px;'};
			    }).done(function(){
				 	//Twitch.tv
				 	$.getJSON("https://twitchemotes.com/api_cache/v2/images.json", function(data) {
				        for(var e in data.images)
				            MP.emotes["Twitch"][data.images[e].code.toLowerCase()] = MP.emotes["Twitch"][data.images[e].code.toLowerCase()] || { url: "https://static-cdn.jtvnw.net/emoticons/v1/" + e + "/1.0", style: 'max-width: 24px; max-height: 24px;', };
				 	}).done(function(){
				 		//BetterTTV
				 		$.getJSON("https://api.betterttv.net/emotes", function(data){
				 			for(var e in data.emotes)
				 				if((e = data.emotes[e]).regex.indexOf(':') == -1) MP.emotes["BetterTTV"][e.regex.toLowerCase().replace('&', 'n')] = MP.emotes["BetterTTV"][e.regex.toLowerCase().replace('&', 'n')] || { url: e.url, style: 'max-width: 24px; max-height: 24px;', };
				 		}).done(callback || (function(){}));
				 	});
				 });
			 });
		},
		escape: function(txt){
			return txt.replace(/</g,'&lt;').replace(/>/g,'&gt;');
		},
		leaveConfirmation: function(){
			return 'Are you sure you want to leave musiqpad?';
		},
		addMessage: function(data, type){
			var $chat = $("#chat");
			var $messages = $("#chat > #messages");
			var time = new Date(data.time);
			var scrolledFromTop = MP.api.chat.getPos();
			var settings = JSON.parse(localStorage.getItem("settings"));
            var emote = '';

			type = type || 'chat';

			if (type == 'chat'){
				var msg = data.message;
				var msg_plain = msg;

				if (!msg){
					return;
				}
				var user = data.user || MP.findUser(data.uid);

				if(MP.api.user.isBlocked(user.uid))
					return;

				var queue_pos = MP.findPosInWaitlist();
				var mention = '';

				var arr_mention = [];

				if (MP.user){
					arr_mention.push('@' + MP.user.un);
				}

				if (MP.checkPerm('chat.specialMention', user) && (settings.roomSettings.notifications.sound.global || settings.roomSettings.notifications.desktop.global)){

					if (MP.user){
						arr_mention.push('@everyone');

						if (queue_pos >= 0)
							arr_mention.push('@djs');

						if (MP.isStaffMember(data.uid) && MP.isStaffMember())
							arr_mention.push('@staff');

						if(MP.getRole(MP.user.role).mention)
							arr_mention.push('@' + MP.getRole(MP.user.role).mention);
					} else {
						arr_mention.push('@guests');
					}
				}

				if (arr_mention.length != 0){
					var regmention = new RegExp('('+arr_mention.join('|') + ')( |$)','g');
					var emreg = /^\/(me|em)(\s|$)/i;
					mention = (msg.match(regmention) != null ? 'mention' : '');

					if (mention){
						msg = msg.replace(regmention,function(a){
							return '<span style="'+ MP.makeUsernameStyle(MP.user ? MP.user.role : null) +' font-weight: bold;">'+a+'</span>';
						});
					}
				}

				if (/^\/(me|em) /i.test(msg)){
					emote = 'emote';
					msg = msg.slice(4);
					if (msg.length==0){
						return;
					}
				}

				//Do chat notifications
				if (MP.user && user.uid != MP.user.uid){

					//Desktop notification
					if(settings.roomSettings.notifications.desktop.chat)
						MP.api.util.desktopnotif.showNotification("musiqpad", "@" + user.un + " sent a chat message\n" + msg_plain);

					//Sound notification
					if(settings.roomSettings.notifications.sound.chat)
						mentionSound.play();
				}

				msg = MP.url.parse(msg,true);

				//Parse bold tags
				msg = msg.replace(/\*(.*?)\*/g, function(a){
					return '<b>'+a.slice(1,-1)+'</b>';
				});

				//Parse strike tags
				msg = msg.replace(/~(.*?)~/g, function(a){
					return '<s>'+a.slice(1,-1)+'</s>';
				});

				if (mention && !MP.session.hasfocus) {
					document.title = '* ' + document.title;
				}

				if (mention){

                    //Desktop
                    if(settings.roomSettings.notifications.desktop.mention && !settings.roomSettings.notifications.desktop.chat)
                        MP.api.util.desktopnotif.showNotification("musiqpad", "@" + user.un + " mentioned you\n" + msg_plain);

                    //Sound
                    if(settings.roomSettings.notifications.sound.mention && !settings.roomSettings.notifications.sound.chat)
                        mentionSound.play();
				}

				var badge = $(MP.makeBadgeStyle({ user: user }));
				var isTheDj = (MP.session.queue.currentdj || {}).uid == user.uid;

				$messages.append(
					'<div ' + (data.cid ? 'id="cm-' + data.cid + '"' : '') + ' class="cm message ' + [mention, emote, data.special, (MP.checkPerm('chat.delete') ? 'msg-del' : ''), (MP.user && user.uid == MP.user.uid ? 'self' : '')].join(' ') + '">' + (MP.checkPerm('chat.delete') ? '<div class="mdi mdi-close msg-del-btn"></div>' : '') + '<span class="time">' + MP.makeTime(time) + '</span>' +
					// TODO: Make user object to lookup UID
					badge.attr('class', (badge.prop('tagName').toLowerCase() == 'svg' ? 'bdg ' : badge.attr('class')) + (isTheDj ? ' hidden' : '')).prop('outerHTML') +
					/*(
						MP.getRole(user.role).badge
							?
								$('<div class="mdi mdi-' + MP.getRole(user.role).badge + ' bdg-icon bdg-icon-role" style="color: ' + ((MP.getRole(user.role).style || { color: 'white', }).color || 'white') + ';"></div>').addClass((MP.session.queue.currentdj || {}).uid == user.uid ? 'hidden' : '').prop('outerHTML')
									:
								$(MP.makeBadgeStyle(user.badge.top, user.badge.bottom, MP.getRole(user.role).style.color, "c" + data.cid)).attr('class', (MP.session.queue.currentdj || {}).uid == user.uid ? 'bdg hidden' : 'bdg').prop("outerHTML")
					) +*/
					(isTheDj ? MP.makeBadgeStyle({ mdi: 'headphones', class: 'bdg-icon-dj', style: MP.getRole(user.role).style }) : '') +
					'<div class="text"><span data-uid="'+ user.uid +'" class="uname" style="' + MP.makeUsernameStyle(user.role) + '">' + user.un + '</span>' +
					'<span class="umsg">' + MP.emojiReplace(msg) + '</span></div></div>'
				);
				if (MP.api.chat.filterTypes[MP.api.chat.filter]) {
					for (var i in MP.api.chat.filterTypes) {
						MP.api.chat.filterTypes[i]().show();
					}
					MP.api.chat.filterTypes[MP.api.chat.filter]().hide();
				}
				MP.chatImage.parse(msg, data.cid);
			} else if (type == 'log'){
				var user = data.user || {};
				var un = user.un || '';
				var unclass = (user.un == undefined) ? '' : 'uname';
				var msg = data.msg;

				$messages.append(
					'<div class="cm log"><span class="time">' + MP.makeTime(new Date()) + '</span>' +
					'<div class="text">' +
					'<span data-uid="'+ user.uid +'" style="'+ MP.makeUsernameStyle(user.role) +'" class="'+ unclass +'">' + un + '</span>' +
					'<span class="umsg">' + msg + '</span></div></div>'
				);
			} else if (type == 'system'){
				var msg = data;

				$messages.append(
					'<div class="cm system"><span class="time">' + MP.makeTime(new Date()) + '</span>' +
					'<div class="mdi mdi-map-marker msg"></div>' +
					'<div class="text">' +
					'<span class="umsg">' + msg + '</span></div></div></div>'
				);
			} else if (type == 'broadcast'){
				var msg = MP.escape(data);

				$messages.append(
					'<div class="cm broadcast"><span class="time">' + MP.makeTime(new Date()) + '</span>' +
					'<div class="mdi mdi-alert msg"></div>' +
					'<div class="text">' +
//					MP.emojiReplace($('<span class="umsg"></span>').text(msg).prop('outerHTML')) + '</div></div></div>'
					MP.emojiReplace(msg) + '</div></div></div>'
				);

                //Desktop notification
                if(settings.roomSettings.notifications.desktop.global){
                    MP.api.util.desktopnotif.showNotification("musiqpad", "Received a broadcast\n" + msg);
                }

                //Sound notification
                if(settings.roomSettings.notifications.sound.global){
                    mentionSound.play();
                }
			}

			while($messages.children().length > (Number(JSON.parse(localStorage.settings).roomSettings.chatlimit) || $messages.children().length)){
				$messages.children().first().remove();
			}

			if ( scrolledFromTop >= 0)
				MP.api.chat.scrollBottom();
		},
		sendBroadcast: function(msg) {
			if (!MP.checkPerm('chat.broadcast')) return;

			var obj = {
				type: 'broadcastMessage',
				data: {
					message: msg
				}
			};

			socket.sendJSON(obj);
		},
		findUser: function(uid){
			if (typeof MP.seenUsers[uid] == undefined) return null;

			return MP.seenUsers[uid];
		},
		findPosInWaitlist: function(uid){
			var user = uid ? MP.findUser(uid) : MP.user;

			if (!user || !MP.session.queue.users) return -1;

			var pos = MP.session.queue.users.indexOf(user.uid);

			if (MP.session.queue.currentdj && MP.session.queue.currentdj.uid == user.uid) return 0;
			if (pos == -1) return pos;

			return (pos+1);
		},
		chatCommands: {
			cmds: {
				description: 'Show available chat commands',
				aliases: ['commands', 'cmd', 'help'],
				exec: function(arr){
					var cmds = '<span style="color: #ffffff; font-weight: bold;">User commands</span><br>';
					var staffcmds = '<span style="color: #ffffff; font-weight: bold;">Staff commands</span><br>';

					//Loop through all commands
					for(var key in MP.chatCommands){
						var cmd = MP.chatCommands[key];

                        if(cmd.permission && !MP.checkPerm(cmd.permission)) continue;

						var cmdstr = '/' + key + ' - ' + cmd.description + (cmd.aliases ? ' [ ' + cmd.aliases.join(', ') + ' ]' : '') + '<br>';

						if(cmd.staff)
							staffcmds += cmdstr;
						else
							cmds += cmdstr;
					}

					API.chat.log(cmds + (MP.isStaffMember(MP.user.uid) ? '<br>' + staffcmds : ''));
				},
			},

			log: {
				description: 'Shows a message in chat client-side',
				exec: function(arr){
					MP.api.chat.log(arr.shift());
				},
			},

			join: {
				description: 'Join the DJ queue',
				aliases: ['j'],
                permission: 'djqueue.join',
				exec: function(arr){
					MP.djQueueJoin();
				},
			},

			leave: {
				description: 'Leave the DJ queue',
				aliases: ['l'],
                permission: 'djqueue.leave',
				exec: function(arr){
					MP.djQueueLeave();
				},
			},

			cycle: {
				description: 'Toggle DJ queue cycling',
                staff: true,
                permission: 'djqueue.cycle',
				exec: function(){
					MP.djQueueCycle();
				},
			},

			lock: {
				description: 'Toggle DJ queue lock',
                staff: true,
                permission: 'djqueue.lock',
				exec: function(){
					MP.djQueueLock();
				},
			},

			skip: {
				description: 'Skip the current DJ',
                staff: true,
                permission: 'djqueue.skip.other',
				exec: function(arr){
					arr.shift();

					var lockSkipPosition = parseInt(arr[0]);
					MP.djQueueSkip(!isNaN(lockSkipPosition) ? lockSkipPosition : undefined);
				},
			},

			vol: {
				description: 'Change or show the current volume',
				aliases: ['volume'],
				exec: function(arr){
					if (arr.length==1){
						return API.chat.log('<br>Current volume: '+API.player.getPlayer().getVolume(),'Volume');
					}
					var vol_val = Math.round(Math.max(0, Math.min(arr[1], 100)));

					if (isNaN(vol_val)){
						return API.chat.log('<br>Volume should be an integer (0 ~ 100)','Volume');
					}
					API.player.setVolume(vol_val);
					API.chat.log('<br>Current volume: '+vol_val,'Volume');
				},
			},

			clear: {
				description: 'Clear the chat (client-side only)',
				aliases: ['c'],
				exec: function(){
					$('#messages').html('');
				},
			},

			stream: {
				description: 'Toggle video stream',
				exec: function(){
					API.chat.log('<br>Video stream '+(MP.toggleVideoStream()?'enabled':'disabled'),'Video stream');
				},
			},

			shrug: {
				description: 'Appends ¯\\_(ツ)_/¯ to your message',
                permission: 'chat.send',
				exec: function(arr){
					arr.shift();
					MP.sendMessage((arr.join(" ")+" ¯\\_(ツ)_/¯").trim());
				},
			},

			flip: {
				description: 'Appends (ノಠ益ಠ)ノ彡┻━┻ to your message',
                permission: 'chat.send',
				exec: function(arr){
					arr.shift();
					MP.sendMessage((arr.join(" ")+" (ノಠ益ಠ)ノ彡┻━┻").trim());
				},
			},

			unflip: {
				description: 'Appends ┬──┬ ノ( ゜-゜ノ) to your message',
                permission: 'chat.send',
				exec: function(arr){
					arr.shift();
					MP.sendMessage((arr.join(" ")+" ┬──┬ ノ( ゜-゜ノ)").trim());
				},
			},

			lenny: {
				description: 'Appends ( ͡° ͜ʖ ͡°) to your message',
                permission: 'chat.send',
				exec: function(arr){
					arr.shift();
					MP.sendMessage((arr.join(" ")+" ( ͡° ͜ʖ ͡°)").trim());
				},
			},

			confirm: {
				description: 'Confirms your email address',
				exec: function(arr){
					arr.shift();
					var obj = {
						type: 'confirmation',
						data: {
							code: arr[0],
						},
					};
					obj.id = MP.addCallback(obj.type, function(err, data){
						if(data.success){
							MP.addMessage('Email confirmed, welcome to musiqpad :)', 'system');
						} else {
							MP.addMessage('Wrong confirmation code or email already confirmed', 'system');
						}
					});
					socket.sendJSON(obj);
				},
			},

			s: {
				description: 'Sends a message to all staff members',
                staff: true,
                permission: 'chat.staff',
				exec: function(arr){
					arr.shift();
					MP.sendMessage(arr.join(" "), true);
				},
			},

			gib: {
				description: 'Prepends ༼ つ ◕_◕ ༽つ to your message',
                permission: 'chat.send',
				exec: function(arr){
					arr.shift();
					MP.sendMessage(("༼ つ ◕_◕ ༽つ " + arr.join(" ")).trim());
				},
			},

			pm: {
				description: 'Sends a private message',
				aliases: ['w', 'whisper'],
                permission: 'chat.private',
				exec: function(arr){
					if (!MP.checkPerm('chat.private')) {
						return API.chat.log('<br>You do not have permission to perform this command', 'Insufficient Permissions');
					}

					if (arr.length<=2){
						return API.chat.log('<br>Try /pm username message','Private Message');
					}

					arr.shift();
					var usernick = arr.shift().replace(/[@:]/g,'');

					var user = MP.api.room.getUserByName(usernick);

					if (!user) return;

					MP.privateMessage(user.uid, arr.join(" "), function(err, data){
						if (err) return API.chat.log('<br>Failed to send private message to @' + user.un, 'Private Chat');

						API.chat.log('<br>' + MP.escape(data.message), '<span onclick="$(\'#msg-in\').val(\'/pm '+ user.un + ' \').focus();">Private Message sent to </span><span data-uid="'+ user.uid +'" class="uname" style="' + MP.makeUsernameStyle(user.role) + '">' + user.un + '</span>');
					});
				},
			},

			ban: {
				description: 'Ban a user',
				staff: true,
                                permission: 'room.restrict.ban',
				exec: function(arr){
					arr.shift();

					if (arr.length == 0 || typeof arr[0] != 'string' || arr[0].charAt(0)!='@'){
						return API.chat.log('<br>Try /ban @username', 'Ban user');
					}

					var user = MP.api.room.getUserByName(arr[0].substring(1));

					if (!user)	return;

					MP.showRestrictionModal(user.uid);
				},
			},

			role: {
				description: 'Sets user role',
				staff: true,
                                permission: 'room.grantroles',
				exec: function(arr){
					arr.shift();

					if (arr.length == 0 || typeof arr[0] != 'string' || arr[0].charAt(0)!='@'){
						return API.chat.log('<br>Try /role @username', 'Set user role');
					}

					var user = MP.api.room.getUserByName(arr[0].substring(1));

					if (!user)	return;

					MP.showRoleModal(user.uid);
				},
			},

			mute: {
				description: 'Mute a user',
                                staff: true,
				permission: 'room.restrict.mute',
				exec: function(arr){
					arr.shift();

					if (arr.length == 0 || typeof arr[0] != 'string' || arr[0].charAt(0)!='@'){
						return API.chat.log('<br>Try /mute @username', 'Mute user');
					}

					var user = MP.api.room.getUserByName(arr[0].substring(1));

					if (!user)	return;

					MP.showRestrictionModal(user.uid);
				},
			},

			add: {
				description: 'Add a user to the DJ queue',
				staff: true,
                permission: 'djqueue.add',
				exec: function(arr){
					arr.shift();

					if (arr.length == 0 || typeof arr[0] != 'string' || arr[0].charAt(0)!='@'){
						return API.chat.log('<br>Try /add @username', 'Add user to queue');
					}

					var user = MP.api.room.getUserByName(arr[0].substring(1));

					if (!user)	return;
					var position = parseInt(arr[1]);
					if (typeof position == 'number') position--;
					MP.djQueueModAdd(user.uid, position);
				},
			},

			rem: {
				description: 'Remove a user from the DJ queue',
				aliases: ['remove'],
				staff: true,
                permission: 'djqueue.move',
				exec: function(arr){
					arr.shift();

					if (arr.length == 0 || typeof arr[0] != 'string' || arr[0].charAt(0)!='@'){
						return API.chat.log('<br>Try /rem @username', 'Remove user from queue');
					}

					var user = MP.api.room.getUserByName(arr[0].substring(1));

					if (!user)	return;
					MP.djQueueModRemove(user.uid);
				},
			},

			move: {
				description: 'Move a user in the DJ queue',
				staff: true,
                permission: 'djqueue.move',
				exec: function(arr){
					arr.shift();

					if (arr.length < 2 || typeof arr[0] != 'string' || arr[0].charAt(0)!='@' || isNaN(parseInt(arr[1]))){
						return API.chat.log('<br>Try /move @username 1', 'Move user in queue');
					}

					var user = MP.api.room.getUserByName(arr[0].substring(1));

					if (!user)	return;
					var pos = parseInt(arr[1]);
					MP.djQueueModMove(user.uid,pos);
				},
			},

			swap: {
				description: 'Swaps two users in the DJ queue',
				staff: true,
                permission: 'djqueue.move',
				exec: function(arr){
					arr.shift();

					if (arr.length < 2 || typeof arr[0] != 'string' || arr[0].charAt(0)!='@' || typeof arr[1] != 'string' || arr[1].charAt(0)!='@'){
						return API.chat.log('<br>Try /swap @username1 @username2', 'Swap users in queue');
					}

					var user1 = MP.api.room.getUserByName(arr[0].substring(1));
					var user2 = MP.api.room.getUserByName(arr[1].substring(1));

					if (!user1 || !user2 || user1.uid == user2.uid)	return;
					MP.djQueueModSwap(user1.uid,user2.uid);
				},
			},

			broadcast: {
				description: 'Broadcasts a message to all users',
				staff: true,
                permission: 'chat.broadcast',
				exec: function(arr){
					arr.shift();
					if (!MP.checkPerm('chat.broadcast')) {
						return API.chat.log('<br>You do not have permission to perform this command', 'Insufficient Permissions');
					}
					if (arr.length < 1){
						return API.chat.log('<br>Try /broadcast message', 'Broadcasts a message to the room');
					}
					MP.sendBroadcast(arr.join(' '));
				},
			},

			badge: {
				description: 'Changes your badge',
				exec: function(arr){
					if (arr.length == 1){
						return API.chat.log('<br>At least one color is required. Example: /badge #00FFFF red','Badge');
					}
					var hextop = arr[1];
					var hexbottom = arr[2] || hextop;

					var colorValidator = /^#([0-9a-f]{6}|[0-9a-f]{3})$/gi;

					if ((hextop.search(colorValidator)) == -1 && !MP.api.util.colourNameToHex(hextop)){
						return API.chat.log('<br>Invalid color: '+hextop, 'Badge');
					}

					if ((hexbottom.search(colorValidator)) == -1  && !MP.api.util.colourNameToHex(hexbottom)){
						return API.chat.log('<br>Invalid color: '+hexbottom, 'Badge');
					}

					hextop = MP.api.util.colourNameToHex(hextop) || hextop;
					hexbottom = MP.api.util.colourNameToHex(hexbottom) || hexbottom;

					MP.updateBadge({top: hextop.toUpperCase(), bottom: hexbottom.toUpperCase()});
				},
			},

            whois: {
				description: 'Shows additional information about a user',
				staff: true,
				permission: 'room.whois',
				exec: function(arr){
					API.room.whois(arr[1], function(err, data){
						if(err){
							MP.api.chat.log("User not found");
						} else {
							var t = data.uptime;
							MP.api.chat.log(
										   "Whois for user " + data.un + "<br><br>\
											Username: " + data.un + "<br>\
											User ID: " + data.uid + "<br>\
											Role: " + data.role + "<br>\
											Badge: " + data.badge.top + " | " + data.badge.bottom + "<br>\
											# of playlists: " + data.playlists + "<br>\
											Online: " + (data.online ? "true (" + data.ip + ")" : "false") + "<br\
											Uptime: " + (t - (t %= 86400000)) / 86400000 + "d " +  (t - (t %= 3600000)) / 3600000 + "h " +
											(t - (t %= 60000)) / 60000 + "m " +  (t - (t %= 1000)) / 1000 + "s<br>\
											Created: " + (new Date(data.created).toUTCString())
											)
						}
					});
				},
			},
			
			iplist: {
				description: 'Shows all IP addresses the user connected from and their last connection time',
				aliases: [ 'whoipis' ],
				staff: true,
				permission: 'room.whois.iphistory',
				exec: function(arr){
					API.room.iphistory(arr[1], function(err, data){
						if(err){
							var msgs = {
								"UserNotFound": "User not found",
								"IpHistoryNotFound": (data || {}).un + "<br>No IP history for this user",
							};
							MP.api.chat.log(msgs[err] || "Error: " + err);
						} else {
							MP.api.chat.log(data.un + "<br>" + data.history.map(function(e){ return e.address + ": " + e.time.slice(0, 19).replace('T', ' '); }).join('<br>'));
						}
					});
				},
			},

			block: {
				description: 'Blocks or unblocks a user, blocking will remove any further messages from him',
				exec: function(arr){
					arr.shift();

					if (arr.length != 1 || typeof arr[0] != 'string' || arr[0].charAt(0)!='@' || (arr[1] = +arr[1])){
						return API.chat.log('<br>Try /block @username', 'Block a user');
					}

					var user = MP.api.room.getUserByName(arr[0].substring(1));

					if (!user)
						return API.chat.log('User ' + arr[0] + ' is not in the pad', 'Block or unblock a user');

					if(MP.api.user.isBlocked(user.uid)) {
						MP.api.user.unblock(user.uid, function(err) {
							if(err)
								return API.chat.log('Could not unblock user ' + arr[0]);

							API.chat.log('User ' + arr[0] + ' successfully unblocked');
						})
					} else {
						MP.api.user.block(user.uid, function(err) {
							if(err)
								return API.chat.log('Could not block user ' + arr[0]);

							API.chat.log('User ' + arr[0] + ' successfully blocked');
						})
					}
				},
			},
		},
		sendMessage: function(message, staff){
			staff = staff || false;
			if (!MP.isLoggedIn()){
				console.log('Must be logged in to send chat messages');
				return;
			}
			if (typeof message != 'string'){
				console.log('Message should be a string');
				return;
			}
			if (!message){
				console.log('Message can\'t be empty');
				return;
			}

			if (message.charAt(0)=='/'){
				if (message.length >= 2 && message.charAt(1) == '/') {
					message = message.substring(1);
				}
				else {
					var arr = message.trim().substring(1).replace(/\s{2,}/g, ' ').split(' ');

					var cmdkey = '';

					for(var key in MP.chatCommands){
						var cmd = MP.chatCommands[key];

						if(key == arr[0]) {
							cmdkey = key;
							break;
						}

						for(var al in (cmd.aliases || [])){
							if(cmd.aliases[al] == arr[0]) {
								cmdkey = key;
								break;
							}
						}

						if(cmdkey) break;
					}

					if(cmdkey) return MP.chatCommands[cmdkey].exec(arr);

					if (arr[0].match(/^(me|em)/i) == null){
						MP.callListeners({type: API.DATA.EVENTS.CHAT_COMMAND, data:message});
						return;
					}
				}
			}
			
			var obj = {
				type: (staff ? 'staff' : '') + 'chat',
				data: {
					message: message.substring(0,255),
				}
			}
			obj.id = MP.addCallback(obj.type, function(err, data){
				console.log(err, data);
				if(err){
					var msgs = {
						'UserMuted': 'You are muted and cannot send chat messages'
					}
					MP.api.chat.log(msgs[err] || ('Error while sending chat message: ' + err));
				}
			});
			socket.sendJSON(obj);
			/*socket.sendJSON({
				type: (staff ? 'staff' : '') + 'chat',
				data: {
					message: message.substring(0,255)
				}
			});*/
		},
		getPrivateConversation: function(uid, callback) {
			if (!MP.checkPerm('chat.private')) return;

			var obj = {
				type: 'getPrivateConversation',
				data: {
					uid: uid
				}
			};

			obj.id = MP.addCallback(obj.type, callback);
			socket.sendJSON(obj);
		},
		getConversations: function(callback) {
			if (!MP.checkPerm('chat.private')) return;

			var obj = {
				type: 'getConversations',
				data: { }
			};

			obj.id = MP.addCallback(obj.type, callback);
			socket.sendJSON(obj);
		},
		markConversationRead: function(uid, date) {
			if (!MP.checkPerm('chat.private')) return;

			if (!date) {
				date = Date.now();
			}

			var obj = {
				type: 'markConversationRead',
				data: {
					uid: uid,
					date: date
				}
			};

			socket.sendJSON(obj);
		},
		deleteChat: function(cid, callback){
			if (!MP.checkPerm('chat.delete')) return;

			cid = parseInt(cid);

			if (isNaN(cid) || cid < 1){
				return;
			}
			var obj = {
				type: 'deleteChat',
				data: {
					cid: cid
				}
			};

			obj.id = MP.addCallback(obj.type, callback);
			socket.sendJSON(obj);
		},
		signup: function(inEmail, inUser, inPass, inCaptcha, callback){
			if (MP.isLoggedIn()){
				console.log('Can\'t signup, already logged in');
				return;
			}

			var obj = {
				type: 'signup',
				data: {
					email: inEmail,
					un: inUser,
					pw: CryptoJS.SHA256( inPass ).toString(),
					captcha: inCaptcha,
				}
			};

			if (MP.session.isCaptcha)
				grecaptcha.reset();

			obj.id = MP.addCallback(obj.type, function(err, data){
				//if (err) alert('There was a problem signing up: ' + err);

				onLogin(err, data, callback);

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);
		},
		rawLogin: function(inEmail, inPass, token, callback){
			if (MP.isLoggedIn()){
				console.log('Can\'t login, already logged in');
				if (callback) callback('AlreadyLoggedIn');
				return;
			}

			var obj = {
				type: 'login',
				data: {
					email: inEmail,
					pw: CryptoJS.SHA256( inPass ).toString(),
					token: token
				}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				//if (err){ alert('There was a problem logging in: ' + err); }
				if (onLogin){
					onLogin(err, data, callback);
				}

				if (callback) callback(err, data);
			});


			socket.sendJSON(obj);
		},
		login: function(inEmail, inPass, callback){
			MP.rawLogin(inEmail, inPass, null, callback);
		},
		loginWithTok: function(token, callback){
			if (!token){ callback('Token argument not set'); return; }

			MP.rawLogin(null, null, token, callback);
		},
		logout: function(callback){
			if (!MP.isLoggedIn()){
				console.log('Can\'t logout, not logged in');
				return;
			}

			var obj = {
				type: 'logout',
				data: {}
			};

			if (callback) obj.id = MP.addCallback(obj.type, callback);

			var ind = MP.userList.users.indexOf(MP.user.uid);
			if (ind != -1){
				MP.userList.users.splice( ind, 1);
				MP.userList.guests++;
			}

			delete MP.user;
			MP.session.viewedPl;
			MP.applyModels();

			MP.cookie.setCookie(MP.getTokenName());
			socket.sendJSON(obj);
		},
		joinRoom: function(callback){
			var obj = {
				type: 'joinRoom',
				data: {}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				if (err){
					console.log('Could not join room: ' + err);
					if (callback) callback(err, data);
					return;
				}
				checkForUpdates();
				setInterval(checkForUpdates, 1000 * 60 * 60 * 2);
				MP.getUsers(function(){
					MP.session.roomInfo = data.room;
					MP.session.queue = data.queue;
					MP.session.roles = data.roles;
					MP.session.roleOrder = data.roleOrder;
					MP.session.staffRoles = data.staffRoles;
					MP.session.queue.currentdj = (data.queue.currentdj ? MP.findUser(data.queue.currentdj) : null);
					MP.session.allowemojis = data.allowemojis;
					MP.session.isCaptcha = data.recaptcha;
					MP.session.captchakey = data.captchakey;
					MP.session.historylimit = data.historylimit;
					MP.media.start = data.queue.songStart;
					MP.session.description = data.description;

					var client = new Date().getTime();
					var server = data.time || client;

					MP.session.serverDateDiff = (server < client ? server - client : client - server);

					if (MP.session.isCaptcha) {
						try{
							grecaptcha.render('recaptcha', { sitekey: MP.session.captchakey, 'theme': 'dark',});
						}catch(e){}
					}
					MP.addCurrentToHistory();

					$('.btn-grab.active, .btn-upvote.active, .btn-downvote.active').removeClass('active');

					var buttonClasses = {
						like: 'btn-upvote',
						dislike: 'btn-downvote',
						grab: 'btn-grab'
					};

					for(var i in data.queue.vote){
						var $button = $('.' + buttonClasses[data.queue.vote[i]]);
						$button.addClass('active');
					}

					MP.applyModels();

					if (callback) callback(err, data);
				});

				MP.media.media = data.queue.currentsong;

				if (data.queue.currentsong){
					MP.media.timeRemaining = Math.round(data.queue.currentsong.duration - data.queue.time);
					MP.startTimeRemaining();
				}else{
					MP.media.timeRemaining = 0;
					MP.clearTimeRemaining();
				}
			});


			socket.sendJSON(obj);


		},
		leaveRoom: function(callback){
			var obj = {
				type: 'leaveRoom',
				data: {}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				MP.user.role = null;

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);
		},
		getRole: function(role){
			if (role && MP.session.roles[role]){
				return MP.session.roles[role];
			}

			return MP.session.roles.default;
		},
		getRoleIndex: function(role){
			if (typeof role != 'string')	return -1;

			var roles = [];
			for (var i in MP.session.roles){
				roles.push(i);
			}
			roles = roles.reverse();
			return roles.indexOf(role.toLowerCase());
		},
		checkPerm: function(perm, user){
			user = user || MP.user;

			if (!user) return false;

			return (user.role && MP.getRole(user.role) && MP.getRole(user.role).permissions.indexOf(perm) == -1 ? false : true);
		},
		canGrantRole: function(role, user){
			user = user || MP.user;

			if (!user || !user.role) return false;

			if ( !MP.checkPerm('room.grantroles') || MP.getRole(user.role).canGrantRoles.indexOf(role) == -1)
				return false;

			return true;
		},
		getRoomInfo: function(callback){
			var obj = {
				type: 'getRoomInfo',
				data: {}
			};
			obj.id = MP.addCallback(obj.type, function(err,data){
				if (err){
					console.log('Getting Room Info failed!');
					if (callback) callback(err);
					return;
				}
				MP.session.roomInfo = data;

				MP.applyModels();

				if (callback) callback(err, data);
			});
			socket.sendJSON(obj);
		},
		getUsers: function(callback){
			var obj = {
				type: 'getUsers',
				data: {}
			};

			obj.id = MP.addCallback(obj.type, function(err,data){
				if (err){
					console.log('Getting users failed! : ' + err);
					if (callback) callback(err);
				}

				for (var i in data.users){
					var uid = parseInt(i);

					MP.seenUsers[uid] = data.users[i];

					if (MP.user && data.users[i].uid == MP.user.uid) MP.user.role = data.users[i].role;

					MP.userList.guests = data.guests;

					if (MP.userList.users.indexOf(uid) == -1){
						MP.userList.users.push(uid);
					}
				}

				MP.applyModels();

				if (callback) callback(err, data);
			});
			socket.sendJSON(obj);
		},
		getHistory: function(callback){
			var obj = {
				type: 'getHistory',
				data: {}
			};

			obj.id = MP.addCallback(obj.type, function(err,data){
				if (err){
					console.log('Getting history failed!');
					if (callback) callback(err);
					return;
				}

				/*
				data: {
					type: 'getHistory',
					data: [
						{
							votes: {
								likes: 0,
								grabs: 0,
								dislikes: 0
							},
							song: {
								defaultSongObject Properties
							},
							user: {
								defaultUserObject Properties
							}
						}
					]
				}
				*/

				MP.historyList.history = data;
				MP.historyList.historyInitialized = true;
				MP.historyList.filter = "";

				MP.addCurrentToHistory();

				MP.applyModels();

				if (callback) callback(err, data);
			});
			socket.sendJSON(obj);
		},
		updateBadge: function(badge, callback){
			var obj = {
				type: 'badgeUpdate',
				data: {
					badge: badge
				}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				if (err){
					console.log('Updating badge failed!', err);
					// Handle error
					return;
				}else{
					console.log('Badge Updated Successfully.');

					$('#badge-top-color-input').minicolors('value',badge.top);
					$('#badge-bottom-color-input').minicolors('value',badge.bottom);

					// Save success notif
				}
				if (typeof callback == 'function') callback(err, data);
			});
			socket.sendJSON(obj);
		},
		addCurrentToHistory: function(){
			if (MP.historyList.historyInitialized && MP.session.queue.currentsong != null) {
				if(MP.session.historylimit)
					while(MP.historyList.history.length >= MP.session.historylimit) {
						MP.historyList.history.pop();
					}
				MP.historyList.history.unshift({
					votes: MP.session.queue.votes,
					song: MP.session.queue.currentsong,
					user: MP.session.queue.currentdj,
					start: MP.media.start || new Date().getTime()-(MP.getTimeElapsed()*1e3)
				});
			}
		},
		isLoggedIn: function(){
			if (MP.user) return true;

			return false;
		},
		getPlaylistContents: function(pid, callback){
			var obj = {
				type: 'getPlaylistContents',
				data: {
					pid: pid
				}
			};

			MP.togglePlaylistLoading(true);

			obj.id = MP.addCallback(obj.type, function(err, data){
				MP.togglePlaylistLoading(false);

				if (err){ if (callback) callback(err); return;}

				MP.user.playlists[pid].num = data.content.length;
				MP.user.playlists[pid].content = data.content;
				MP.applyModels();

				if (callback) callback(err, data);
			}, 10000);

			socket.sendJSON(obj);
		},
		playlistCreate: function(name, callback){
            if (!MP.checkPerm('playlist.create')) {
                callback("InsufficientPermissions");
                return;
            }

			var obj = {
				type: 'playlistCreate',
				data: {name: name}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				MP.togglePlaylistLoading(false);

				if (err){console.log('Could not add playlist: ' + err); if (callback) callback(err, data); return;}
				MP.user.playlists[data.id] = data.playlist;
				var onlyPlaylist = true;

				for (var i in MP.user.playlists)
					if (i != data.id) onlyPlaylist = false;

				if (onlyPlaylist) MP.user.activepl = data.id;
				MP.applyModels();

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);
			MP.togglePlaylistLoading(true);
		},

		playlistRename: function(pid, name, callback){
			//if (!MP.checkPerm('playlist.delete')) return;

			var obj = {
				type: 'playlistRename',
				data: {
					pid: pid,
					name: name
				}
			};

			if (!pid || !name){
				if (callback) callback('MissingProps');
				return;
			}

			obj.id = MP.addCallback(obj.type, function(err, data){
				MP.togglePlaylistLoading(false);
				if (err){
					if (callback) callback(err);
					return;
				}

				MP.user.playlists[pid].name = data.name;
				MP.applyModels();
				callback(null, data);
			});

			socket.sendJSON(obj);
			MP.togglePlaylistLoading(true);
		},

		playlistDelete: function(pid, callback){
			if (!MP.checkPerm('playlist.delete')) return;

			var obj = {
				type: 'playlistDelete',
				data: {
					pid: pid
				}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				MP.togglePlaylistLoading(false);

				if (err) {console.log('Could not delete playlist: ' + err); if (callback) callback(err); return;}

				delete MP.user.playlists[pid];

				if (MP.session.viewedPl == pid){
					MP.session.viewedPl = null;
				}

				if (data.active){
					MP.user.activepl = data.active;
					MP.session.viewedPl = data.active;
				}

				MP.applyModels();

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);
			MP.togglePlaylistLoading(true);
		},
		playlistActivate: function(pid, callback){
			if (MP.user && MP.user.activepl == pid){ if (callback) callback('Playlist already active'); return; }
			var obj = {
				type: 'playlistActivate',
				data: {
					pid: pid
				}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				MP.togglePlaylistLoading(false);

				if (err) {console.log('Could not activate playlist: ' + err); if (callback) callback(err); return;}

				MP.user.activepl = pid;
				MP.applyModels();

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);
			MP.togglePlaylistLoading(true);
		},
		playlistAdd: function(pid, cid, pos, callback){
			var obj = {
				type: 'playlistAddSong',
				data: {
					pid: pid,
					cid: cid,
					pos: pos
				}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				MP.togglePlaylistLoading(false);

				if (err){ if (callback) callback(err); console.log('Could not add to playlist: ' + err); return;}

				if (data.pos == 'top'){
					if (Array.isArray(data.video)) {
						for (var i = 0, len = data.video.length; i < len; i++) {
							MP.user.playlists[data.plid].content.unshift(data.video[i]);
						}
					}
					else {
						MP.user.playlists[data.plid].content.unshift(data.video);
					}
				}else if (data.pos == 'bottom'){
					if (Array.isArray(data.video)) {
						for (var i = 0, len = data.video.length; i < len; i++) {
							MP.user.playlists[data.plid].content.push(data.video[i]);
						}
					}
					else {
						MP.user.playlists[data.plid].content.push(data.video);
					}
				}

				if (Array.isArray(data.video)) {
					MP.user.playlists[data.plid].num += data.video.length;
				}
				else {
					MP.user.playlists[data.plid].num++;
				}
				MP.applyModels();

				if (callback) callback(err, data);
			}, 20000);

			socket.sendJSON(obj);
			MP.togglePlaylistLoading(true);
		},
		playlistRemove: function(pid, cid, callback){
			var obj = {
				type: 'playlistRemoveSong',
				data: {
					pid: pid,
					cid: cid
				}
			};

			var content = MP.user.playlists[pid].content;
			var ind = null;

			for (var i = 0; i < content.length; i++){
				if (content[i].cid == cid){
					ind = i;
					break;
				}
			}

			if (ind == null){
				console.log('Cannot find CID in playlist specified');
				if (callback) callback('SongNotInPlaylist');
				return;
			}

			obj.id = MP.addCallback(obj.type, function(err, data){
				MP.togglePlaylistLoading(false);

				if (err){ if (callback) callback(err); console.log('Could not remove from playlist: ' + err); return;}

				MP.user.playlists[pid].content.splice( ind, 1 );
				MP.user.playlists[pid].num--;
				MP.applyModels();

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);

			MP.togglePlaylistLoading(true);
		},
		playlistMove: function(pid, cid, index, callback){
			var obj = {
				type: 'playlistMoveSong',
				data: {
					pid: pid,
					cid: cid,
					index: index
				}
			};

			var content = MP.user.playlists[pid].content;
			var ind = null;

			for (var i = 0; i < content.length; i++){
				if (content[i].cid == cid){
					ind = i;
					break;
				}
			}

			if (ind === null){
				console.log('Cannot find CID in playlist specified');
				if (callback) callback('SongNotInPlaylist');
				return;
			}

			if (ind == index || (ind+1) == index) return;

			obj.id = MP.addCallback(obj.type, function(err, data){
				MP.togglePlaylistLoading(false);

				if (err){ if (callback) callback(err); console.log('Could not move song: ' + err); return;}

				var content = MP.user.playlists[pid].content.splice(ind, 1);
				MP.user.playlists[pid].content.splice(( ind > index ? index : index-1), 0, content[0]);
				MP.applyModels();

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);

			MP.togglePlaylistLoading(true);
		},
		playlistImport: function(pid, expand, callback){
			callback = callback || function(){};
            if(!pid) { callback("MissingProps"); return false; }
			var obj = {
				type: 'importPlaylist',
				data: {
					playlistId: pid,
					expanded: expand || false,
				}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				if(err) { callback(err); return; }

				for(var e in data.content){
					MP.user.playlists[data.content[e].id] = {
						id: data.content[e].id,
						name: data.content[e].name,
						content: expand ? data.content[e].content : [],
						num: expand ? data.content[e].content.length : data.content[e].num,
					};
				}

				MP.applyModels();
				callback(null, data);
			}, 25000);

			socket.sendJSON(obj);
			return true;
		},
		youtubeSearch: function(query, callback){
			var obj = {
				type: 'youtubeSearch',
				data: {
					query: query
				}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				MP.togglePlaylistLoading(false);
				if (err){ if (callback) callback(err); console.log('Youtube search error: ' + err); return;}

				if (callback) callback(err, data.results);
			});

			socket.sendJSON(obj);
			MP.togglePlaylistLoading(true);
		},
		findInPlaylist: function(playlist, cid){
			for (var i = 0; i < playlist.length; i++){
				if (playlist[i].cid == cid) return i;
			}

			return null;
		},
		makeTime: function(dateObj){
			var settings = JSON.parse(localStorage.settings);
			if(settings.roomSettings && settings.roomSettings.chatTimestampFormat == API.DATA.CHAT.TSFORMAT.HR12)
				return ((dateObj.getHours()) % 12 || 12) + ':' + ('0' + dateObj.getMinutes()).slice(-2);
			else
				return (dateObj.getHours() + ':' + ('0' + dateObj.getMinutes()).slice(-2));
		},
		djQueueJoin: function(callback){
			if (!MP.checkPerm('djqueue.join')) return;

			if (MP.session.queue.lock && !MP.checkPerm('djqueue.joinlocked')){
				return;
			}

			var obj = {
				type: 'djQueueJoin'
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				if (err){ if (callback) callback(err); console.log('Could not join waitlist: ' + err); return;}

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);
		},
		djQueueLeave: function(callback){
			if (!MP.checkPerm('djqueue.leave')) return;

			var obj = {
				type: 'djQueueLeave'
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				if (err){ if (callback) callback(err); console.log('Could not leave waitlist: ' + err); return;}

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);
		},
		djQueueSkip: function(lockSkipPosition, callback){
			if (typeof lockSkipPosition === 'function'){
				callback = lockSkipPosition;
				lockSkipPosition = undefined;
			}
			if (!MP.checkPerm('djqueue.skip.self') && !MP.checkPerm('djqueue.skip.other')){
				if (callback) callback('InsufficientPermissions');
				return;
			}

			if (!MP.session.queue.currentdj || !MP.user){
				if (callback) callback('InvalidDJ');
				return;
			}

			var mod = typeof lockSkipPosition === 'number' || MP.session.queue.currentdj.uid != MP.user.uid;

			if ( (mod && !MP.checkPerm('djqueue.skip.other')) || (!mod && !MP.checkPerm('djqueue.skip.self')) ){
				if (callback) callback('InsufficientPermissions');
				return;
			}

			var obj = {
				type: (mod ? 'djQueueModSkip' : 'djQueueSkip')
			};

			if (typeof lockSkipPosition === 'number'){
				obj.data = {
					lockSkipPosition: lockSkipPosition
				};
			}

			if (callback) obj.id = MP.addCallback(obj.type, callback);

			socket.sendJSON(obj);
		},
		toggleLastDj: function(callback){
			callback = callback || function(){};
			if(!MP.session.queue.cycle){
				callback("DjQueueCycleNotEnabled");
				return false;
			}

			var obj = {
				type: 'toggleLastDj',
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				if(!err){
					MP.session.lastdj = data.newval;
					MP.applyModels();
				}
				callback(err, data);
			});

			socket.sendJSON(obj);
		},
		djQueueCycle: function(callback){
			if (!MP.checkPerm('djqueue.cycle')){
				if (callback) callback('InsufficientPermissions');
				return;
			}
			var obj = {
				type: 'djQueueCycle'
			};

			if (callback) obj.id = MP.addCallback(obj.type, callback);

			socket.sendJSON(obj);
		},
		djQueueLock: function(callback){
			if (!MP.checkPerm('djqueue.lock')){
				if (callback) callback('InsufficientPermissions');
				return;
			}

			var obj = {
				type: 'djQueueLock'
			};

			if (callback) obj.id = MP.addCallback(obj.type, callback);

			socket.sendJSON(obj);
		},
		djQueueModAdd: function(uid, position, callback) {
			if (typeof position == 'function'){
				callback = position;
				position = undefined;
			}
			if (!MP.checkPerm('djqueue.move')){
				if (callback) callback('InsufficientPermissions');
				return;
			}

			var obj = {
				type: 'djQueueModAdd',
				data: {
					uid: uid,
					position: position
				}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				if (err){ if (callback) callback(err); console.log('Could not add user to dj queue: ' + err); return;}

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);
		},
		djQueueModRemove: function(uid, callback) {
			if (!MP.checkPerm('djqueue.move')){
				if (callback) callback('InsufficientPermissions');
				return;
			}

			var obj = {
				type: 'djQueueModRemove',
				data: {
					uid: uid
				}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				if (err){ if (callback) callback(err); console.log('Could not remove user to dj queue: ' + err); return;}

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);
		},
		djQueueModMove: function(uid, position, callback) {
			if (!MP.checkPerm('djqueue.move')){
				if (callback) callback('InsufficientPermissions');
				return;
			}

			var obj = {
				type: 'djQueueModMove',
				data: {
					uid: uid,
					position: position - 1
				}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				if (err){ if (callback) callback(err); console.log('Could not move user in dj queue: ' + err); return;}

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);
		},
		djQueueModSwap: function(uid1, uid2, callback) {
			if (!MP.checkPerm('djqueue.move')){
				if (callback) callback('InsufficientPermissions');
				return;
			}

			var obj = {
				type: 'djQueueModSwap',
				data: {
					uid1: uid1,
					uid2: uid2
				}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				if (err) {
					if (callback) callback(err);
					MP.makeAlertModal({
						content: 'Could not swap users in dj queue: ' + err,
						dismissable: true
					});
					return;
				}

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);
		},
		djQueueLimit: function(limit, callback){
			if (!MP.checkPerm('djqueue.limit')){
				if (callback) callback('InsufficientPermissions');
				return;
			}

			var obj = {
				type: 'djQueueLimit',
				data: {
					limit: limmit
				}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				if (err){ if (callback) callback(err); console.log('Could not change the queue limit: ' + err); return;}

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);
		},
		privateMessage: function(uid, message, callback){
			if (!MP.checkPerm('chat.send')){
				if (callback) callback('InsufficientPermissions');
				return;
			}
			if (typeof message != 'string' || !message){
				if (callback) callback('emptyMessage');
				return;
			}

			var obj = {
				type: 'privateMessage',
				data: {
					uid: uid,
					message: message
				}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				if (err){ if (callback) callback(err); console.log('Could not send private message: ' + err); return;}

				if (callback) callback(err, data);

				MP.api.room.getUser(uid, function(err,user) {
					if (err) {

					} else {
						MP.addPrivateMessage(user, message, MP.user.uid);
					}
				});
			});

			socket.sendJSON(obj);
		},
		addPrivateMessage: function(user, message, fromUid) {
			var entityMap = {
			  '&': '&amp;',
			  '<': '&lt;',
			  '>': '&gt;',
			  '"': '&quot;',
			  "'": '&#39;',
			  '/': '&#x2F;',
			  '`': '&#x60;',
			  '=': '&#x3D;'
			};

			function escapeHtml (string) {
			  return String(string).replace(/[&<>"'`=\/]/g, function (s) {
			    return entityMap[s];
			  });
			}

			var messageObj = {
					message: escapeHtml(message),
					time: Date.now(),
					from: fromUid
				};
			var scope = angular.element($('body')).scope();
			var messageUnread = 1;
			if (scope.activepm && scope.activepm.user.uid == user.uid && scope.prop.ci == 2) {
				messageUnread = 0;
			}
			if (!MP.pms[user.un]) {
				MP.pms[user.un] = {
					user: user,
					messages: [
						messageObj
					],
					unread: messageUnread
				};
			}
			else {
				MP.pms[user.un].messages.push(messageObj);
				MP.pms[user.un].unread += messageUnread;
			}
			if (messageUnread == 0) {
				MP.markConversationRead(user.uid);
			}
			MP.applyModels();
			var $chat = $('#pm-chat');
			$chat.scrollTop( $chat[0].scrollHeight );
		},
		getCurrentVideoTime: function(callback){
			var obj = {
				type: 'getCurrentSongTime'
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				if (data.success && MP.media.media){
					MP.media.timeRemaining = Math.round(MP.media.media.duration - data.time);
				}
				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);
		},
		togglePlaylistLoading: function(bool){
			$('.lib-sng-search .load-spin').toggle(bool);
			$('.lib-sng-search .btn-search').toggle(!bool);
		},
		toggleVideoStream: function(bool){
			var settings = JSON.parse(localStorage.settings);

			if (bool === null || bool === undefined || typeof bool != 'boolean'){
				bool = !settings.player.stream;
			}

			if (bool == settings.player.stream){
				return bool;
			}

	 		settings.player.stream = bool;
	 		localStorage.setItem("settings", JSON.stringify(settings));

			var player = API.player.getPlayer();

			if (settings.player.stream){
				var media = MP.media.media;

				if (media){
					player.loadVideoById(media.cid);
					if (settings.player.hd){
						player.setPlaybackQuality('hd720');
					}

					var curTime = Date.now();
					MP.getCurrentVideoTime(function(err, data){
						player.seekTo(((Date.now() - curTime) / 1000) + data.time);
					});

				}
			}else{
				API.player.getPlayer().loadVideoById(null);
			}
			MP.applyModels();
			return bool;
		},
		toggleHighDefinitionQuality: function(bool){
			var settings = JSON.parse(localStorage.settings);

			if (bool === null || bool === undefined || typeof bool != 'boolean'){
				bool = !settings.player.hd;
			}

			if (bool == settings.player.hd){
				return bool;
			}

			settings.player.hd = bool;
			localStorage.setItem("settings", JSON.stringify(settings));

			if (settings.player.stream) {
				var player = API.player.getPlayer();

				if (settings.player.hd){
					player.setPlaybackQuality('hd720');
					$('.btn-hd').addClass('active');
				}
				else {
					player.setPlaybackQuality('default');
					$('.btn-hd').removeClass('active');
				}
			}
		},
		vote: function(voteType, callback){
			var obj = {
				type: 'vote'
			};

			voteType = voteType.toLowerCase();
			if (['like', 'dislike', 'grab'].indexOf(voteType) == -1) return false;
			if (!MP.session.queue.currentdj || !MP.user || MP.session.queue.currentdj && MP.session.queue.currentdj.uid == MP.user.uid) return false;

			obj.data = {
				voteType: voteType
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				if (err){ if (callback) callback(err); console.log('Cannot vote: ' + err); return;}

				var buttonClasses = {
					like: 'btn-upvote',
					dislike: 'btn-downvote',
					grab: 'btn-grab'
				};

				if (!data.success) return;

				var $button = $('.' + buttonClasses[voteType]);

				MP.models

				if (voteType == 'like'){
					var $dislikeButton = $('.' + buttonClasses.dislike);
					if ($dislikeButton.hasClass('active')) $dislikeButton.removeClass('active');
				}else if (voteType == 'dislike'){
					var $likeButton = $('.' + buttonClasses.like);
					if ($likeButton.hasClass('active')) $likeButton.removeClass('active');
				}

				if ($button.hasClass('active'))
					$button.removeClass('active');
				else
					$button.addClass('active');

				if (callback) callback(err, data);
				MP.applyModels();
			});

			socket.sendJSON(obj);

			return true;
		},
		restrictUser: function(uid, duration, type, reason, callback){
			if(!type || !uid || !duration)
				return false;
			
			if (!MP.checkPerm('room.restrict.' + type.toLowerCase()))
				return false;

			var obj = {
				type: 'restrictUser',
				data: {
					uid: uid,
					duration: duration,
					reason: reason.substr(0,50),
					type: type,
				}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				if (err){ if (callback) callback(err); console.log('Could not restrict user: ' + err); return;}

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);
		},
		unrestrictUser: function(uid, type, callback){
			if(!type || !uid)
				return false;
			
			if (!MP.checkPerm('room.restrict.' + type.toLowerCase()))
				return false;

			var obj = {
				type: 'unrestrictUser',
				data: {
					uid: uid,
					type: type,
				}
			};

			obj.id = MP.addCallback(obj.type, function(err, data){
				if (err){ if (callback) callback(err); console.log('Could not unrestrict user: ' + err); return;}

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);
		},
		getUserRestrictions: function(uid, callback){
			//if (!MP.checkPerm('room.restrict')) return;
			
			var obj = {
				type: 'getUserRestrictions',
				data: {
					uid: uid
				}
			};
			
			obj.id = MP.addCallback(obj.type, function(err, data){
				if (err){ if (callback) callback(err); console.log('Could not get user restrictions: ' + err); return;}

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);
		},
		showRestrictionModal: function(uid){
			/*if (MP.checkPerm('room.restrict.ban') || !MP.seenUsers[uid]){
				MP.makeAlertModal({
							content: !MP.seenUsers[uid] ? 'The user is not online.' : 'You do not have permission to do that.',
							dismissable: false
						});
				return;
			}*/
			
			MP.api.room.getUserRestrictions(uid, function(err, data){
				if (err){
					console.log(err);
					return;
				}

				var resdatadom = '';
				var resnames = {
					BAN: 'Ban',
					MUTE: 'Mute',
					SILENT_MUTE: 'Silent mute'
				};
				
				for(var type in data.restrictions){
					resdatadom += '\
					<tr>\
						<td style="width:31.6%">' + resnames[type] + '</td>\
						<td style="width:31.6%">' + (new Date(data.restrictions[type].end)).toUTCString() + '</td>\
						<td style="width:31.6%">' + data.restrictions[type].reason + '</td>\
						<td class="mdi mdi-close res-remove" data-val="' + type + '"></td>\
					</tr>\
					';
				}
				
				MP.makeCustomModal({
					content: '<div>\
							<h3>You are about to change the restrictions for <span id="BanUserModalUser" style="'+ MP.makeUsernameStyle(MP.seenUsers[uid].role) +'" data-uid="' + uid + '">' + MP.seenUsers[uid].un + '</span></h3>\
							<div class="restriction-selector control-group">\
								<hr>\
								<h4>Active Restrictions</h4>\
								<div id="CurrentRestrictionList">\
									<table style="width:100%">\
										<tr>\
											<th style="width:31.6%">Type</th>\
											<th style="width:31.6%">End</th>\
											<th style="width:31.6%">Reason</th>\
											<th style="width:5%"></th>\
										</tr>\
										' + resdatadom + '\
									</table>\
								</div>\
								<hr>\
	    						<h4>New Restriction</h4>\
	    						<div id="UserRestrictionTypeSelector" style="" class="modal-options">\
									<div class="restriction-opt opt-mute" data-val="MUTE">Mute</div>\
									<div class="restriction-opt opt-smute" data-val="SILENT_MUTE">Silent Mute</div>\
									<div class="restriction-opt opt-ban" data-val="BAN">Ban</div>\
								</div>\
	  						</div>\
	  						<br/>\
	  						<div id="UserRestrictionModalDuration" class="restriction-options modal-options" style="display: none;">\
								<div class="restriction-opt" data-val="PT15M">Quarter</div>\
								<div class="restriction-opt" data-val="PT1H">Hour</div>\
								<div class="restriction-opt" data-val="P1DT">Day</div>\
								<div class="restriction-opt" data-val="P100YT">Perma</div>\
								<input class="restriction-opt" placeholder="(Days?)"></input>\
							</div>\
							<input class="restriction-options restype-reason" style="display: none;" type="text" placeholder="Reason for punishment..." id="RestrictUserModalReason" />\
							<br>\
							<div class="modal-ctrl restriction-options" style="width: 50%;display: none;" id="restriction-opt-add">Add</div>\
						</div>',
					dismissable: true,
					buttons: [
						{
							icon: 'mdi-close',
							classes: 'modal-no',
							handler: function(e){
								$('.modal-bg').remove();
							}
						},
					],
					callback: function(){
						var $banOpts = $('#UserRestrictionModalDuration .restriction-opt');
						var $restrictOpts = $('#UserRestrictionTypeSelector .restriction-opt');
	
						$banOpts.on('click', function(){
							if ($(this).hasClass('active')) return;
	
							$banOpts.removeClass('active');
	
							$(this).addClass('active');
						});
						
						$restrictOpts.on('click', function(){
							if ($(this).hasClass('active')) return;
	
							$restrictOpts.removeClass('active');
	
							$(this).addClass('active');
							
							$('.restriction-options').show();
							$banOpts.removeClass('active');
							$('.restype-reason').val('');
						});
						
						$('#CurrentRestrictionList .res-remove').on('click', function(){
							var that = this;
							
							MP.api.room.unrestrictUser(uid, $(that).attr('data-val'), function(err, data){
								if(err)
									MP.makeAlertModal({ content: "Could not remove restriction: " + err });
								else
									$(that).parent().remove();
							});
						});
						
						$('#restriction-opt-add').on('click', function() {
							var restype = $('#UserRestrictionTypeSelector .restriction-opt.active').attr('data-val');
							var resdur = $('#UserRestrictionModalDuration .restriction-opt.active');
							var resreason = $('#RestrictUserModalReason').val();
							
							if(resdur.attr('data-val')){
								resdur = resdur.attr('data-val');
							} else {
								resdur = ~~resdur.val();
								if(!resdur){
									MP.makeAlertModal({ content: "Duration is not a number" });
									return;
								}
								resdur = 'P' + resdur + 'DT';
							}

							MP.api.room.restrictUser(uid, resdur, restype, resreason, function(err, data){
								if(err){
									MP.makeAlertModal({ content: 'Error while adding a restriction: ' + err });
								} else {
									$banOpts.removeClass('active');
									$restrictOpts.removeClass('active');
									$('.restype-reason').val('');
									$('.restriction-options').hide();
									$('#CurrentRestrictionList table').append('\
									<tr>\
										<td style="width:31.6%">' + resnames[restype] + '</td>\
										<td style="width:31.6%">' + (new Date(data.end)).toUTCString() + '</td>\
										<td style="width:31.6%">' + (resreason || 'No reason specified') + '</td>\
										<td class="mdi mdi-close res-remove" data-val="' + restype + '"></td>\
									</tr>');
									
									$('#CurrentRestrictionList .res-remove:last').on('click', function(){
										var that = this;
										
										MP.api.room.unrestrictUser(uid, $(that).attr('data-val'), function(err, data){
											if(err)
												MP.makeAlertModal({ content: "Could not remove restriction: " + err });
											else
												$(that).parent().remove();
										});
									});
								}
							});
						});
					}
				});
			});
		},
		showRoleModal: function(uid){
			if (!MP.checkPerm('room.grantroles') || !MP.seenUsers[uid] || !MP.getRole(MP.user.role).canGrantRoles) return;
			MP.makeCustomModal({
				content: '<div>\
					<h3>You are about to set \
					<span id="RoleModalUser" style="'+ MP.makeUsernameStyle(MP.seenUsers[uid].role) +'" data-uid="' + uid + '">' + MP.seenUsers[uid].un + '</span> as\
					<select id="RoleModalSelect">' +
							(function(){
								var out = '';

								for(var key in MP.session.roleOrder) {
									var prop = MP.session.roleOrder[key];

									if (!MP.session.roles[prop]) continue;
									if (MP.getRole(MP.user.role).canGrantRoles.indexOf(prop) == -1) continue;

									out += '<option ' + (MP.seenUsers[uid].role == prop ? 'selected' : '') +' value="' + prop + '">' + (MP.session.roles[prop].title || (prop.substr(0,1).toUpperCase() + prop.substr(1)) ) + '</option>';
								}

								return out;
							})()


					+ '</select>\
				</h3></div>',
				dismissable: false,
				buttons: [
					{
						icon: 'mdi-close',
						classes: 'modal-no',
						handler: function(e){
							$('.modal-bg').remove();
						}
					},
					{
						icon: 'mdi-check',
						classes: 'modal-yes',
						handler: function(e){
							var select = $('#RoleModalSelect').val();
							var uid = $('#RoleModalUser').attr('data-uid');

							if (select == MP.seenUsers[uid].role){
								$('.modal-bg').remove();
								return;
							}

							MP.setRole(uid, select,  function(err, data){
								if (err){
									alert(err);
									return;
								}

								$('.modal-bg').remove();
							});


						}
					}
				],
				callback: function(){
					$('.modal select').selectmenu({
						width: 300,
						appendTo: '.modal-box'
					});
				}
			});
		},
		showEditPlaylistModal: function(pid,cid){
			if (!MP.models.playlists[pid]) return;

			var playlist = MP.models.playlists[pid];
			var title = playlist.name;

			if (cid){
				var media = playlist.content.filter(function(a){return a.cid==cid;})[0];

				if (!media) return;
				title = media.title;
			}

			MP.makeCustomModal({
				content: '<div>\
					<h3>Edit '+(cid ? 'song' : 'playlist')+' name</h3> \
					<input type="text" class="edit-playlist-name" id="edit-playlist" value="' + title + '"/>\
					</div>',
				dismissable: true,
				buttons: [
					{
						icon: 'mdi-close',
						classes: 'modal-no',
						handler: function(e){
							$('.modal-bg').remove();
						}
					},
					{
						icon: 'mdi-check',
						classes: 'modal-yes',
						handler: function(e){
							var newtitle = $('#edit-playlist').val();

							if (newtitle == title || newtitle.match(/^.{1,100}$/) == null) return;

							if (cid){
								var obj = {
									type: 'playlistEditMedia',
									data: {
										pid: pid,
										cid: cid,
										name: newtitle
									}
								};

								socket.sendJSON(obj);
							}else{
								MP.playlistRename(pid, newtitle, function(err, data){
									if (err){
										alert('Could not rename playlist: ' + err);
										return;
									}

									$('.modal-bg').remove();
								});
							}
						}
					}
				]
			});
		},
		setRole: function(uid, role, callback){
			var obj = {
				type: 'setRole',
				data: {
					uid: uid,
					role: role
				}
			};

			if (!uid || !role) return;

			obj.id = MP.addCallback(obj.type, function(err, data){
				if (err){ if (callback) callback(err); console.log('Cannot set role: ' + err); return;}

				if (callback) callback(err, data);
			});

			socket.sendJSON(obj);
		},
		userAutocomplete: function(input){
			var inputReg = new RegExp('^' + input, "i");
			var out = [];

			for (var i in MP.userList.users){
				var user = MP.seenUsers[ MP.userList.users[i] ];
				if (inputReg.test(user.un)) out.push(user);
			}

			out.sort(function (a, b) {
		    	return (a['un'].localeCompare(b['un']));
		    });

			return out;
		},
		emojiAutocomplete: function(input){
			var inputReg = new RegExp('^' + input.replace('+', '\\+'), 'i');
			var out = {};
			var num = 0;

			for (var emoset in MP.emotes)
				if(JSON.parse(localStorage.settings).roomSettings.emojis[emoset.toLowerCase()])
					for (var i in MP.emotes[emoset]){
						if (inputReg.test(i)){
							if(!out[i]){
								num++;
								out[i] = MP.emotes[emoset][i].url;
							}
						}
						if (num == 10) return out;
					}
			return out;
		},
		commandAutocomplete: function(input){
			var inputReg = new RegExp('^' + input, 'i');
			var out = [];

			//Check for commands
			for (var cmd in MP.chatCommands){
				if(inputReg.test(cmd)) out.push(cmd);

				//Check for aliases
				for(var alias in MP.chatCommands[cmd].aliases){
					alias = MP.chatCommands[cmd].aliases[alias];
					if(inputReg.test(alias)) out.push(alias);
				}
			}

			return out;
		},
		showUserMenu: function(user, $this){
			$('.user-menu').remove();

			if (!user) return;
			var $appendElem = $('\
				<div class="user-menu" style="visibility: hidden;">\
					<div class="arrow"></div>\
					<div class="user-menu-content">'+
						'<div>' + MP.makeBadgeStyle({ user: user }) + '</div>' +
						'<span class="uname" style="' + MP.makeUsernameStyle(user.role) + '">' + user.un + '</span><span class="people-info">' + MP.getRole(user.role).title + '</span>\
					</div>\
					<div class="user-menu-content">'+
						'<span class="people-info left">User ID: '+ user.uid +'</span>'+
						(MP.findPosInWaitlist(user.uid) != -1 ? '<span class="people-info">Position: ' + ((MP.findPosInWaitlist(user.uid) != 0) ? MP.findPosInWaitlist(user.uid) : 'DJ') + '</span>' : '') +
					'</div>\
					<div class="modal-controls" data-uid="'+ user.uid +'">' +
						(!MP.user || MP.user.uid == user.uid ? '':
							(((MP.checkPerm('room.restrict.mute') || MP.checkPerm('room.restrict.ban') || MP.checkPerm('room.restrict.silent_mute')) && !MP.canGrantRole(MP.user.role, user)) ? '<div class="modal-ctrl restrict" title="Manage restrictions"><i class="mdi mdi-account-remove"></i></div>' : '' )
							+ '<div class="modal-ctrl mute" title="' + (MP.api.user.isBlocked(user.uid) ? 'Unblock user' : 'Block user') + '"><i class="mdi mdi-comment-' + (MP.api.user.isBlocked(user.uid) ? 'check' : 'remove') + '-outline"></i></div>'
							+ ( MP.canGrantRole(user.role) ? '<div class="modal-ctrl set-role" title="Set role"><i class="mdi mdi-account-key"></i></div>' : '')
						) +
						(MP.checkPerm('djqueue.move') ? (MP.isOnWaitlist(user.uid) ? '<div class="modal-ctrl remove-dj" title="Remove DJ"><i class="mdi mdi-account-minus"></i></div>' :
							'<div class="modal-ctrl add-dj" title="Add DJ"><i class="mdi mdi-account-plus"></i></div>') : '') +
							'<div class="modal-ctrl menu-mention" title="Mention user"><i class="mdi mdi-at"></i></div>' +
					'</div>\
				</div>\
			');
			$('body').append($appendElem);

			var Y = $this.offset().top - ($this.height()/2) - 44;

			if (Y < 0) Y = 0;
			if ( (Y + $appendElem.height()) > $(window).height()) Y = $(window).height() - $appendElem.height();

			var X = $this.offset().left - $appendElem.width() - 53;

			if (X < 0) X = 0;

			var aY = 50;
			$appendElem.css({
				top: Y + 'px',
				left: X + 'px'
			});
			$appendElem.find('.arrow').css('top', aY + 'px');
			$appendElem.css('visibility', '');
		},
		makeConfirmModal: function(inOpts){
			/* opts available:
				content: content in the modal,
				callback: function(result (bool)),
				hoverOver: Allows the modal to hover over existing modals without removing the background modal
			*/

			var opts = inOpts || {};

			MP.makeCustomModal({
				content: opts.content || '',
				buttons: [
					{
						icon: 'mdi-close',
						handler: function(){
							if (opts.hoverOver) { 
								$(this).find('.modeal-bg').remove();
							}
							else {
								$('.modal-bg').remove();
							}
							if (opts.callback) opts.callback(false);
						},
						classes: 'modal-no'
					},
					{
						icon: 'mdi-check',
						handler: function(){
							if (opts.hoverOver) { 
								$(this).find('.modeal-bg').remove();
							}
							else {
								$('.modal-bg').remove();
							}
							if (opts.callback) opts.callback(true);
						},
						classes: 'modal-yes'
					}
				],
				dismissable: opts.dismissable || false
			});
		},
		makeAlertModal: function(inOpts){
			/* opts available:
				content: content in the modal,
				dismissable: bool,
				onDismiss: function() (run on dismiss)
			*/

			var opts = inOpts || {};

			MP.makeCustomModal({
				content: opts.content || '',
				buttons: [
					{
						icon: 'mdi-check',
						handler: function(){
							$('.modal-bg').remove();
						},
						classes: 'modal-yes'
					}
				],
				dismissable: ('undefined' !== typeof opts.dismissable ? opts.dismissable : true),
				onDismiss: opts.onDismiss || function(){}
			});
		},
		makeCustomModal: function(inOpts){
			/* opts available:
				content: content in the modal,
				buttons: [
					{
						icon: MDI class string
						style: {prop: 'value'},
						hoverStyle: {prop: 'value'},
						handler: function,
						classes: classes prop string
					}
				]
				style: object of {prop: 'value'}
				appendTo: selector to append modal to
				dismissable: bool
				onDismiss: function() (run on dismiss)
				callback: function() (run after modal is made)
			*/

			var opts = inOpts || {};
			$('.modal').remove();
			$(opts.appendTo || 'body').append('\
				<div class="modal-bg"><div class="modal-container"><div class="modal" style="' +
					(function(){
						var out = '';

						out += API.util.makeStyleString(opts.style);

						return out;
					})()

				+ '">\
					<div class="modal-box">\
						<div class="modal-text">' + (opts.content || '') + '</div>\
					</div>\
					<div class="modal-controls">' +
					(function(){
						var out = '';
						for (var j in opts.buttons){
							out += ('<div class="modal-ctrl ' + opts.buttons[j].classes + '" style="width: ' + (100 / opts.buttons.length) + '%; ' + API.util.makeStyleString(opts.buttons[j].style) + '" id="CustomModalButton-'+j+'"><div class="mdi ' + opts.buttons[j].icon + '"></div></div>');
						}

						return out;

					})()
					+ '</div>\
				</div></div></div>\
			');

			for (var j in opts.buttons){

				$('#CustomModalButton-'+j).on('click', {bid: j}, function(e){
					var len = $('.modal-bg').length;

					if (opts.buttons[ e.data.bid ].handler) opts.buttons[ e.data.bid ].handler(e);

					if ($('.modal-bg').length < len && opts.onDismiss) opts.onDismiss();
				});

				if (opts.buttons[j].hoverStyle){
					$('#CustomModalButton-'+j)
						.on('mouseenter', {bid: j}, function(e){
							$(this).css(opts.buttons[e.data.bid].hoverStyle);
						})
						.on('mouseleave', {bid: j}, function(e){
							var obj = {};
							for (var i in opts.buttons[e.data.bid].hoverStyle){
								if (opts.buttons[e.data.bid].style[i])
									obj[i] = opts.buttons[e.data.bid].style[i];
								else
									obj[i] = '';
							}

							$(this).css(obj);
						});
				}
			}

			if ( typeof opts.dismissable === 'undefined' || opts.dismissable){
				$('.modal-bg').on('click', function(e){
					e.originalEvent.dismissable = true;

					if (!$(e.target).closest('.modal').length){
						if (opts.onDismiss) opts.onDismiss();
					}
				});
			}else{
				$('.modal-bg').on('click', function(e){
					e.originalEvent.dismissable = false;
				});
			}

			if ( opts.callback ) opts.callback();
		},
		copyObject: function(obj){
			if (!obj || "object" != typeof obj) return obj;
			return $.extend(true, Array.isArray(obj) ? [] : {}, obj);
		},
		videoNotAvailable: function () {
			if(MP.isLoggedIn()) {
				if(angular.element($('body')).scope().roomSettings.autoplayblocked) {
					MP.youtubeSearch(MP.session.queue.currentsong.title, function(err, res){
						var player = API.player.getPlayer();
						var videoId = player.getVideoData().video_id;
						var indexVideo = Object.keys(res).indexOf(player.getVideoData().video_id) + 1;
						player.loadVideoById(Object.keys(res)[indexVideo]);
						player.seekTo(MP.models.songDuration - MP.models.secondsLeftInSong)
					});
				}
				else {
					$('.video-blocked-list').css('opacity', 0)
					$('.video-blocked-bg').attr('style', 'display: table !important');
					MP.youtubeSearch(MP.session.queue.currentsong.title, function(err, res){
						$('.video-blocked-list').fadeTo('slow', 1);
						MP.session.searchResultsBlockedVideo = res;
						MP.applyModels();
						MP.once('advance', function () {
							$('.video-blocked-bg').attr('style', '');
						}, true);
					});
				}
			}
		}
	};

	// Exposing internal functions to the global scope
	// TODO: Extend any data output so you can't change internal objects
	window.API = {
		queue : {
			join: MP.api.queue.join,
			leave: MP.api.queue.leave,
			modAddDJ: MP.api.queue.modAddDJ,
			modRemoveDJ: MP.api.queue.modRemoveDJ,
			modSwapDJ: MP.api.queue.modSwapDJ,
			modMoveDJ: MP.api.queue.modMoveDJ,
			skip: MP.api.queue.skip,
			selfSkip: MP.api.queue.skip,
			modSkip: MP.api.queue.skip,
			setLock: MP.api.queue.setLock,
			setCycle: MP.api.queue.setCycle,
			setLimit: MP.api.queue.setLimit,
			getDJ: function() { return MP.copyObject(MP.api.queue.getDJ()); },
			getDJs: function() { return MP.copyObject(MP.api.queue.getDJs()); },
			getPosition: MP.api.queue.getPosition,
			getInfo: function() { return MP.copyObject(MP.api.queue.getInfo()); },
		},
		room: {
			getInfo: MP.api.room.getInfo,
			isLoggedIn: MP.api.room.isLoggedIn,
			getUser: function(uid, callback) {
				return MP.api.room.getUser(uid, callback);
			},
			getUsers: function(arr) { return MP.copyObject(MP.api.room.getUsers(arr)); },
			getRoles: function(arr) { return MP.copyObject(MP.api.room.getRoles(arr)); },
			getStaffRoles: function() { return MP.copyObject(MP.session.staffRoles); },
			getRoleOrder: function() { return MP.copyObject(MP.session.roleOrder); },
			getHistory: MP.api.room.getHistory,
			getMedia: function() { return MP.copyObject(MP.api.room.getMedia()); },
			getTimeElapsed: MP.api.room.getTimeElapsed,
			getTimeRemaining: MP.api.room.getTimeRemaining,
			setRole: MP.api.room.setRole,
			getStaff: MP.api.room.getStaff,
			getBannedUsers: MP.api.room.getBannedUsers,
			restrictUser: MP.api.room.restrictUser,
			unrestrictUser: MP.api.room.unrestrictUser,
			getUserRestrictions: MP.api.room.getUserRestrictions,
			whois: function(data, callback){
                if(!MP.checkPerm('room.whois')) return false;

				var obj = {
					type: 'whois',
					data: (Number.isNaN(data) || !Number.isInteger(Number(data))) ?
						{ un: (((data || "")[0] == '@' ? data.slice(1) : data) || MP.user.un) }
							:
						{ uid: data }
				}

				obj.id = MP.addCallback(obj.type, function(err, data){ callback(err, err ? null : data.user); });

				socket.sendJSON(obj);

				return true;
			},
			iphistory: MP.api.room.iphistory
		},
		chat: {
			getConversations: MP.api.chat.getConversations,
			log: MP.api.chat.log,
			system: MP.api.chat.system,
			broadcast: MP.api.chat.broadcast,
			staff: function(msg){ return MP.sendMessage(msg, true); },
			send: MP.api.chat.send,
			sendPrivate: MP.api.chat.sendPrivate,
			delete: MP.api.chat.delete,
		},
		playlist: {
			get: function(pid, arr) { return MP.copyObject(MP.api.playlist.get(pid, arr)); },
			create: MP.api.playlist.create,
			delete: MP.api.playlist.delete,
			getActive: MP.api.playlist.getActive,
			activate: MP.api.playlist.activate,
			getNextSong: MP.api.playlist.getNextSong,
			addSong: MP.api.playlist.addSong,
			removeSong: MP.api.playlist.removeSong,
			moveSong: MP.api.playlist.moveSong,
			getContents: MP.api.playlist.getContents,
			import: MP.api.playlist.playlistImport,
			shuffle: MP.api.playlist.shuffle,
			export: function(pid, format, callback){
				if(!(pid = pid || MP.session.viewedPl)) return false;
				format = format || API.DATA.EXPORT.FORMAT.JSON;
				callback = callback || API.DATA.EXPORT.CALLBACK.DOWNLOAD;
				MP.getPlaylistContents(pid, function(err, data){
					if(err) return;
					var out = {
						name: MP.api.playlist.get(pid).name,
						content: [],
					};
					for(var k in data.content){
						out.content.push({
							title: data.content[k].title,
							cid: data.content[k].cid,
							duration: {
								h: ~~(data.content[k].duration / 360),
								m: ~~(data.content[k].duration % 360 / 60),
								s: data.content[k].duration % 60,
							},
						});
					}
					callback(MP.copyObject(out));
				});
				return true;
			},
		},
		util: {
			makeAlertModal: MP.api.util.makeAlertModal,
			makeCustomModal: MP.api.util.makeCustomModal,
			showBanModal: MP.api.util.showBanModal,
			showRoleModal: MP.api.util.showRoleModal,
			showRestrictionModal: MP.api.util.showRestrictionModal,
			objectToArray: MP.api.util.objectToArray,
			timeConvert: MP.api.util.timeConvert,
			youtube_parser: MP.api.util.youtube_parser,
			colourNameToHex: MP.api.util.colourNameToHex,
			makeStyleString: MP.api.util.makeStyleString,
			toggle_images: MP.api.util.toggle_images,
			showImageModal: MP.chatImage.showModal,
			hasPermission: function(user, permission){
				if("string" == typeof user){
					permission = user;
					user = null;
				}

				user = MP.api.room.getUser(user);

				return Boolean(user && MP.getRole(user.role).permissions.indexOf(permission) + 1);
			},
		},
		emotes: {
			load: MP.loadEmoji,
			match: MP.emojiReplace,
			getEmotes: function(ascii){ return MP.copyObject(ascii ? MP.emotes_ascii : MP.emotes); },
		},
		on: function(event, cb){
			return MP.on(event, cb, true);
		},
		off: function(event, cb){
			return MP.off(event, cb, true);
		},
		once: function(event, cb){
			return MP.once(event, cb, true);
		},
		fullscreen: function() {
			$('.playback').toggleClass('fullscreen');
			if (($('.btn-fullscreen > div').hasClass('mdi-fullscreen'))){
				$('.btn-fullscreen > div').removeClass('mdi-fullscreen').addClass('mdi-fullscreen-exit');
				//$(".playback").draggable({disabled:true}).resizable({disabled:true}).attr('style', '');
			}
			else {
				$('.btn-fullscreen > div').removeClass('mdi-fullscreen-exit').addClass('mdi-fullscreen');
				//$(".playback").draggable({disabled:false}).resizable({disabled:false});
			}
		},
		player: {
			setVolume: function(vol){
				var voldiv = $('.btn-volume div');
				vol = ~~(Math.max(0, Math.min(vol, 100)));
				$('.volume-val').text(vol + "%");
				$('.volume').val(vol+'');

				if (!MP.mediaPreview.isOpened()){
					API.player.getPlayer().setVolume(vol);
				}
				voldiv.removeClass('mdi-volume-off').removeClass('mdi-volume-low').removeClass('mdi-volume-medium').removeClass('mdi-volume-high');
				if(vol == 0){
					voldiv.addClass('mdi-volume-off');
				} else if (vol <= 25) {
					voldiv.addClass('mdi-volume-low');
				} else if (vol >= 75) {
					voldiv.addClass('mdi-volume-high');
				} else {
					voldiv.addClass('mdi-volume-medium');
				}

				var settings = JSON.parse(localStorage.getItem("settings"));
				var oldVol = settings.player.volume;

				if (oldVol != vol && vol > 0){
					settings.player.mute = false;
				}

				if(!settings.player.mute) settings.player.volume = vol;
				localStorage.setItem("settings", JSON.stringify(settings));
			},
			setMute: function(mute){
				mute = mute || false;

				var settings = JSON.parse(localStorage.getItem("settings"));

	/*			if (mute == settings.player.mute){
					return;
				}
	*/			settings.player.mute = mute;
				localStorage.setItem("settings", JSON.stringify(settings));

				if (mute){
					$('.volume').val("0");
					$('.btn-volume div').removeClass('mdi-volume-low').removeClass('mdi-volume-medium').removeClass('mdi-volume-high').addClass("mdi-volume-off");
					$('.volume-val').text("0%");
					if (!MP.mediaPreview.isOpened()){
						API.player.setVolume(0);
					}
				} else {
					this.setVolume(settings.player.volume);
				}
			},
			refresh: function(){
				//var seekto = API.player.getPlayer().getCurrentTime();
				MP.session.snooze = false;
				API.player.getPlayer().unMute();
				API.player.getPlayer().loadVideoById(API.player.getPlayer().getVideoData().video_id);
				var settings = JSON.parse(localStorage.getItem("settings"));
				if (settings.player.hd){
					API.player.getPlayer().setPlaybackQuality('hd720');
				}
				API.player.getPlayer().seekTo(API.seekTo);
			},
			snooze: function(snooze){
				snooze = snooze || MP.session.snooze;
				if(snooze){
					API.player.getPlayer().unMute();
					MP.session.snooze = false;
				} else {
					API.player.getPlayer().mute();
					MP.session.snooze = true;
				}
				MP.applyModels();
			},
		},
		tour: {
			start: function(){
				if(!$('.logo-menu').hasClass('logo-menu-expanded'))
					$('.btn-logo').click();
				delete localStorage.tour_current_step;
				delete localStorage.tour_end;
				var steps = [
				  {
				    element: ".btn-logo",
				    placement: "bottom",
				    content: "Click the musiqpad logo to show playlists, settings, pad dj history, and logout. Pro tip: use ESC key as a shortcut!",
				    onShown: function() {
				    	$('.popover.tour .modal-controls div[data-role="prev"]').hide();
				    }
				  },
				  {
				    element: ".nav.logo-btn-home",
				    placement: "right",
				    content: "Here you can browse various pads, hover over the rooms to see how many users are online and what is currently djing.",
				    onShow: function() {
				    	if(!$('.logo-menu').hasClass('logo-menu-expanded'))
								$('.btn-logo').click();
				    	$('.nav.logo-btn-home').click();
				    },
				    onShown: function() {
				    	$('.popover.tour .modal-controls div[data-role="prev"]').show();
				    }
				  },
				  {
				    element: ".nav.logo-btn-settings",
				    placement: "right",
				    content: "In this menu you can customize your musiqpad experience, set various settings and even design your own badge!",
				    onShow: function() {
							if(!$('.logo-menu').hasClass('logo-menu-expanded'))
								$('.btn-logo').click();
				    	$('.nav.logo-btn-settings').click();
				    }
				  },
				  {
				    element: ".nav.logo-btn-library",
				    placement: "right",
				    content: "Here you can manage your music library and browse YouTube for new music.",
				    onShow: function() {
							if(!$('.logo-menu').hasClass('logo-menu-expanded'))
								$('.btn-logo').click();
				    	$('.nav.logo-btn-library').click();
				    }
				  },
				  {
				    element: ".nav.logo-btn-history",
				    placement: "right",
				    content: "This is the place to look for great music other users played.",
				    onShow: function() {
							if(!$('.logo-menu').hasClass('logo-menu-expanded'))
								$('.btn-logo').click();
				    	$('.nav.logo-btn-history').click();
				    }
				  },
				  {
				    element: ".nav.logo-btn-tour",
				    placement: "right",
				    content: "By clicking this button you can bring up this tour again whenever you need it.",
				    onShow: function() {
							if(!$('.logo-menu').hasClass('logo-menu-expanded'))
								$('.btn-logo').click();
				    }
				  },
				  {
				    element: ".nav.logo-btn-logout",
				    placement: "right",
				    content: "Clicking here will log you out of musiqpad.",
				    onShow: function() {
				    	if(!$('.logo-menu').hasClass('logo-menu-expanded')) $('.btn-logo').click();
				    }
				  },
				  {
				    element: ".btn-login",
				    placement: "bottom",
				    content: "Clicking here will bring up your account settings or, in case you are not logged in yet, the signup / login form.",
				    onShow: function() {
				    	if($('.logo-menu').hasClass('logo-menu-expanded')) $('.btn-logo').click();
				    }
				  },
				  {
				    element: ".btn-downvote",
				    placement: "top",
				    content: "If there is an active DJ, click this button in case you'd like to tell others this song is not your cup of tea.",
				    onShow: function() {
				    	if($('.logo-menu').hasClass('logo-menu-expanded')) $('.btn-logo').click();
				    }
				  },
				  {
				    element: ".btn-snooze",
				    placement: "top",
				    content: "Click this button to mute the current song, the volume will go back to it's original value after the song ends.",
				    onShow: function() {
				    	if($('.logo-menu').hasClass('logo-menu-expanded')) $('.btn-logo').click();
				    }
				  },
				  {
				    element: ".btn-join",
				    placement: "top",
				    content: "Clicking this button will add you to the DJ queue if you have an active playlist with at least one song.",
				    onShow: function() {
				    	if($('.logo-menu').hasClass('logo-menu-expanded')) $('.btn-logo').click();
				    }
				  },
				  {
				    element: ".ctrl .btn-grab",
				    placement: "top",
				    content: "Click this to add the current song to one of your playlists.",
				    onShow: function() {
				    	if($('.logo-menu').hasClass('logo-menu-expanded')) $('.btn-logo').click();
				    }
				  },
				  {
				    element: ".btn-upvote",
				    placement: "top",
				    content: "Show your love to the current song to everyone by clicking this button!",
				    onShow: function() {
				    	if($('.logo-menu').hasClass('logo-menu-expanded')) $('.btn-logo').click();
				    }
				  },
				  {
				    element: ".dash .tray .btn-chat",
				    placement: "bottom",
				    content: "Click here to show the chat tab.",
				    onShow: function() {
				    	$('.btn-chat').click();
				    	if($('.logo-menu').hasClass('logo-menu-expanded')) $('.btn-logo').click();
				    }
				  },
				  {
				    element: ".dash .tray .btn-people",
				    placement: "bottom",
				    content: "Click here to view online users and staff members.",
				    onShow: function() {
				    	$('.btn-people').click();
				    	if($('.logo-menu').hasClass('logo-menu-expanded')) $('.btn-logo').click();
				    }
				  },
				  {
				    element: "#app-right .tray .btn-people",
				    placement: "bottom",
				    content: "Click here to view online users.",
				    onShow: function() {
				    	$('.btn-people').click();
				    	if($('.logo-menu').hasClass('logo-menu-expanded')) $('.btn-logo').click();
				    }
				  },
				  {
				    element: "#app-right .tray .btn-staff",
				    placement: "bottom",
				    content: "Click here to view all staff members.",
				    onShow: function() {
				    	$('.btn-staff').click();
				    	if($('.logo-menu').hasClass('logo-menu-expanded')) $('.btn-logo').click();
				    }
				  },
				  {
				    element: "#app-right .tray .btn-banned",
				    placement: "bottom",
				    content: "Click here to view all banned users.",
				    onShown: function() {
				    	$('.btn-banned').click();
				    	if($('.logo-menu').hasClass('logo-menu-expanded')) $('.btn-logo').click();
				    }
				  },
				  {
				    element: ".dash .tray .btn-waitlist",
				    placement: "bottom",
				    content: "Check who is the current dj and who will play next.",
				    onShown: function() {
				    	$('.popover .modal-controls div[data-role="next"]').show();
				    },
				    onShow: function() {
				    	$('.btn-waitlist').click();
				    	if($('.logo-menu').hasClass('logo-menu-expanded')) $('.btn-logo').click();
				    }
				  },
			      {
				    element: ".playback",
				    placement: "top",
				    content: "Hover over the video player to toggle dj cycle and other video settings.",
				    onShown: function() {
				    	$('.popover .modal-controls div[data-role="next"]').hide();
				    },
				    onShow: function() {
				    	$('.btn-banned').click();
				    	if($('.logo-menu').hasClass('logo-menu-expanded')) $('.btn-logo').click();
				    }
				  }
				];
				var max = steps.length;
				var tour = new Tour({
				  template: '<div class="popover tour">\
								 <div class="arrow"></div>\
								 <div class="modal-title"></div>\
								 <div class="popover-content modal-text"></div>\
								 <div class="modal-controls">\
									 <div class="modal-ctrl" data-role="prev"><div class="mdi mdi-skip-previous"></div></div>\
									 <div class="modal-ctrl" data-role="end"><div class="mdi mdi-pause"></div></div>\
									 <div class="modal-ctrl" data-role="next"><div class="mdi mdi-skip-next"></div></div>\
								 </div>\
							 </div>',
				  onEnd: function() {
				  	$('#app-right .tray .btn-people').click();
				  	$('.dash .tray .btn-chat').click();
				  	$('.nav.logo-btn-library').click();
				  	if($('.logo-menu').hasClass('logo-menu-expanded')) $('.logo-menu').click();
				  },
				  steps: steps
				}).init().start();
			}
		},
		user: {
			isBlocked: MP.api.user.isBlocked,
			block: MP.api.user.block,
			unblock: MP.api.user.unblock,
		},
		DATA: {
			PLAYER: {
				QUALITY: {
					HD2160: "hd2160",
					HD1440: "hd1440",
					HD1080: "hd1080",
					HD720:  "hd720",
					LQ480:  "large",
					MQ360:  "medium",
					SQ240:  "small",
					TQ144:  "tiny",
					AUTO:   "auto"
				}
			},
			USER: {
				RESTRICT: {
					MIN5:   { text: '5 minutes',  duration: 'PT5M'   },
					MIN30:  { text: '30 minutes', duration: 'PT30M'  },
					HOUR:   { text: '1 hour',     duration: 'PT1H'   },
					HOUR12: { text: '12 hours',   duration: 'PT12H'  },
					DAY:    { text: '1 day',      duration: 'P1DT'   },
					DAY10:  { text: '10 days',    duration: 'P10DT'  },
					DAY30:  { text: '30 days',    duration: 'P30DT'  },
					PERMA:  { text: 'Permanent',  duration: 'P100YT' }
				},
			},
			CHAT: {
				TSFORMAT: {
					HR12: '12hr',
					HR24: '24hr'
				},
			},
			EXPORT: {
				FORMAT: {
					JSON: 'json',
				},
				CALLBACK: {
					DOWNLOAD: function(data){
					  var el = document.createElement('a');
					  el.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(JSON.stringify(data)));
					  el.setAttribute('download', data.name + '.json');
					  el.style.display = 'none';
					  document.body.appendChild(el);
					  el.click();
					  document.body.removeChild(el);
					},
				},
			},
			EVENTS: {
				ADVANCE: 'advance',
				CHAT: 'chat',
				DELETE_CHAT: 'deleteChat',
				DJ_QUEUE_CYCLE: 'djQueueCycle',
				DJ_QUEUE_LOCK: 'djQueueLock',
				DJ_QUEUE_SKIP: 'djQueueSkip',
				DJ_QUEUE_MOD_SKIP: 'djQueueModSkip',
				DJ_QUEUE_MOD_MOVE: 'djQueueModMove',
				DJ_QUEUE_MOD_SWAP: 'djQueueModSwap',
				DJ_QUEUE_ADD: 'djQueueModAdd',
				DJ_QUEUE_REMOVE: 'djQueueModRemove',
				DJ_QUEUE_LIMIT: 'djQueueLimit',
				USER_JOINED: 'userJoined',
				USER_JOINED_QUEUE: 'userJoinedQueue',
				USER_LEFT: 'userLeft',
				USER_LEFT_QUEUE: 'userLeftQueue',
				USER_UPDATE: 'userUpdate',
				VOTE_UPDATE: 'voteUpdate',
				USER_RESTRICTED: 'userRestricted',
				USER_UNRESTRICTED: 'userUnrestricted',
				USER_ROLE_CHANGE: 'moderateSetRole',
				SYSTEM_MESSAGE: 'systemMessage',
				BROADCAST_MESSAGE: 'broadcastMessage',
				SERVER_RESPONSE: 'response',
				PRIVATE_MESSAGE: 'privateMessage',
				CHAT_COMMAND: 'chatCommand'
			}
		},
		test: function(){ console.log(MP.user.playlists); },
	};

	var mentionSound = new Audio('../pads/lib/sound/mention.wav');

	var checkForUpdates = function () {
		if(MP.checkPerm('server.checkForUpdates')) {
			var obj = {
				type: 'checkForUpdates',
				data: {},
			};
			obj.id = MP.addCallback(obj.type, function(err, data) {
				if(data.update)
					MP.addMessage('Update available: ' + data.update.current + " → " + data.update.latest, "system");
			});
			socket.sendJSON(obj);
		}
	};

	var onLogin = function(err, data, callback){ // There's probably a better place for this...
		if (err){
			alert('There was an error signing up or logging in: ' + err);
			MP.cookie.setCookie(MP.getTokenName(), '', -1);
			if (callback) callback(err);
			return;
		}

		MP.user = data.user;
		if (MP.userList.guests > 0 ) MP.userList.guests--;

		MP.seenUsers[MP.user.uid] = MP.user;
		MP.session.blockedusers = data.user.blocked;

//		if (MP.user && data.users[i].uid == MP.user.uid) MP.user.role = data.users[i].role;

		if (MP.userList.users.indexOf(MP.user.uid) == -1){
			MP.userList.users.push(MP.user.uid);
		}

		MP.session.viewedPl = MP.user.activepl;
		MP.session.lastdj = data.user.lastdj;

		MP.applyModels();

		if (data.token){
			MP.cookie.setCookie(MP.getTokenName(), data.token, 7);
		}

		MP.api.chat.getConversations(onLoadConversations);
	};

	var onLoadConversations = function(err, data) {
	    if (err) {

	    } else {
	        if (!data.conversations) return;
	        MP.pms = {};
	        for (var i in data.conversations) {
	            var convo = data.conversations[i];
	            convo.__init = false;
	            MP.pms[convo.user.un] = convo;
	        }
	        MP.applyModels();
	    }
	};

	var socketPort = config.serverPort;

	var socketDomain = config.serverHost || document.location.hostname;

	var socket = null;


	function initSocket(){
		socket = new WebSocket((config.useSSL ? 'wss' : 'ws') + '://' + socketDomain + ':' + socketPort);

		socket.sendJSON = function(inObj){ socket.send( JSON.stringify(inObj) );};
		/*DEBUG*/
		API.sendSocket = socket.sendJSON;
		/*END DEBUG*/

		socket.onopen = function(e){
			if (typeof MP.onConnect === 'function') MP.onConnect.call(window);
		};

		socket.onerror = function(){
			socket.close();
		};
		socket.onclose = function(e){
			//API.player.getPlayer().destroy();
			//API.player.getPlayer().loadVideoById( null );
			var data = null;
			try{
				data = JSON.parse( e.reason );

				if (!data.type){
					throw new Error('No Type');
				}

				switch (data.type){
					case 'ConnectedElsewhere':
						MP.makeAlertModal({
							content: 'You have logged in elsewhere.  This session has been disconnected.',
							dismissable: false
						});
						break;
					case 'banned':
						MP.makeAlertModal({
							content: 'You have been banned until ' + (new Date(data.data.end)).toString() + '<br>Reason: ' + data.data.reason + '<br><b>You now have the permissions of a Guest</b>',
							dismissable: false,
							onDismiss: function(){
								document.location.reload();
							}
						});
						break;
					case 'ratelimit':
						break;
				}
			}catch(e){
				if (!$('.modal-bg').length){
					MP.makeCustomModal({
						content: 'Reconnecting...',
						buttons: [],
						dismissable: false
					});
				}
				delete MP.user;
				setTimeout(initSocket, 5e3);
	/*			MP.makeAlertModal({
					content: 'Connection lost.',
					dismissable: false,
					callback: function(){
						document.location.reload();
					}
				});*/
			}
		};

		socket.onmessage = function(e){
			if ( e.data == 'h') return;

			//DEBUG
			console.log(e.data);
			//END DEBUG

			var data = null;

			try {
				data = JSON.parse(e.data);
			} catch (e) {
				return;
			}

			// This should ONLY be incoming events.  No callbacks.
			var settings = JSON.parse(window.localStorage.getItem("settings"));
			switch(data.type){
				case API.DATA.EVENTS.CHAT:
					MP.addMessage(data.data);
					break;
				case API.DATA.EVENTS.SYSTEM_MESSAGE:
					MP.addMessage(data.data, 'system');
					break;
				case API.DATA.EVENTS.BROADCAST_MESSAGE:
					if (typeof data.data == 'object' && data.data.error) return;
					MP.addMessage(data.data, 'broadcast');
					break;
				case API.DATA.EVENTS.USER_JOINED:
					MP.userList.guests = data.data.guests;
					var user = data.data.user;

					if (user){
						MP.seenUsers[ user.uid ] = user;
						if (MP.userList.users.indexOf(user.uid) == -1){
							MP.userList.users.push(user.uid);
							
							//Chat
							if(settings.roomSettings.notifications.chat.join)
								MP.addMessage('<span data-uid="'+ user.uid +'" class="uname" style="' + MP.makeUsernameStyle(user.role) + '">' + user.un + '</span>joined', 'system');
							
							//Desktop
							if(settings.roomSettings.notifications.desktop.join){
								MP.api.util.desktopnotif.showNotification("musiqpad", "@" + user.un + " joined");
							}
							
							//Sound
							if(settings.roomSettings.notifications.sound.join){
								mentionSound.play();
							}
						}
						console.log( 'User joined: ' + data.data.user.uid + ': ' + data.data.user.un);
					}else{
						console.log('Guest joined room');
					}

					MP.applyModels();
					break;
				case API.DATA.EVENTS.USER_LEFT:
					MP.userList.guests = data.data.guests;
					var user = data.data.user;

					if (user){
						var ind = MP.userList.users.indexOf(user.uid);
						if (ind != -1){
							MP.userList.users.splice( ind, 1);
							//Chat
							if(settings.roomSettings.notifications.chat.leave)
								MP.addMessage('<span data-uid="'+ user.uid +'" class="uname" style="' + MP.makeUsernameStyle(user.role) + '">' + user.un + '</span>left', 'system');
							
							//Desktop
							if(settings.roomSettings.notifications.desktop.leave){
								MP.api.util.desktopnotif.showNotification("musiqpad", "@" + user.un + " left");
							}
							
							//Sound
							if(settings.roomSettings.notifications.sound.leave){
								mentionSound.play();
							}
						}

						console.log( 'User left: ' + data.data.user.uid + ': ' + data.data.user.un);
					} else {
						console.log('Guest left room');
					}
					MP.applyModels();
					break;
				case API.DATA.EVENTS.USER_JOINED_QUEUE:
					MP.session.queue.users = data.data.queueList;
					MP.applyModels();
					break;
				case API.DATA.EVENTS.USER_LEFT_QUEUE:
					MP.session.queue.users = data.data.queueList;
					MP.applyModels();
					break;
				case API.DATA.EVENTS.ADVANCE:
					MP.session.snooze = false;
					var playerSettings = settings.player;
					var player = API.player.getPlayer();

					player.unMute();

					if (data.data.next.song && playerSettings.stream){
						player.loadVideoById(data.data.next.song.cid);
						if (settings.player.hd){
							player.setPlaybackQuality('hd720');
						}
						player.setVolume(settings.player.mute || MP.mediaPreview.isOpened() ? 0 : settings.player.volume);
					}else{
						player.loadVideoById(null);
					}

					//Changing the DJ's badge
					if((MP.session.queue.currentdj || {}).uid != data.data.next.uid){
						if(MP.session.queue.currentdj) {
							var elem = $('#messages .cm.message .text .uname[data-uid=' + MP.session.queue.currentdj.uid + ']').parent().parent();
							elem.find('.bdg-icon.bdg-icon-dj').remove();
							elem.find('.bdg').attr('class', 'bdg');
						}
						if(data.data.next.uid) {
							var elem = $('#messages .cm.message .text .uname[data-uid=' + data.data.next.uid + ']').parent().parent();
							elem.find('.bdg').attr('class', 'bdg hidden');
							elem.filter(function(_, e){ return $(e).find('.bdg-icon-dj').length == 0; }).find('svg').after('<div class="mdi mdi-headphones bdg-icon bdg-icon-dj"></div>')
							$('.bdg-icon.bdg-icon-dj').css('color', (MP.getRole(MP.api.room.getUser(data.data.next.uid).role).style || { color: 'white', }).color);
						}
					}

                    //Do last DJ notifications
                    if(data.data.last.uid){
                        var lastdj = MP.findUser(data.data.last.uid);

                        //Chat
                        if(settings.roomSettings.notifications.chat.advance_last)
                            MP.addMessage('<span data-uid="'+ lastdj.uid +'" class="uname" style="' + MP.makeUsernameStyle(lastdj.role) + '">' + lastdj.un + '</span>just played ' + data.data.last.song.title, 'system');

                        //Desktop
                        if(settings.roomSettings.notifications.desktop.advance_last){
                            MP.api.util.desktopnotif.showNotification("musiqpad", "@" + lastdj.un + " just played\n" + data.data.last.song.title, "//i.ytimg.com/vi/" + data.data.last.song.cid + "/default.jpg");
                        }

                        //Sound
                        if(settings.roomSettings.notifications.sound.advance_last){
                            mentionSound.play();
                        }
                    }

                    //Load data from received JSON
					MP.session.queue.votes = {};
					MP.session.queue.currentdj = (data.data.next.uid ? MP.findUser(data.data.next.uid) : null);
					MP.session.queue.currentsong = data.data.next.song;
					MP.media.media = data.data.next.song;
					MP.media.start = data.data.next.start;
					if (MP.user && data.data.last.uid == MP.user.uid) MP.session.lastdj = false;

                    //Do next DJ notifications
                    if(data.data.next.uid){
                        var nextdj = MP.findUser(data.data.next.uid);

                        //Chat
                        if(settings.roomSettings.notifications.chat.advance_next)
                            MP.addMessage('<span data-uid="'+ nextdj.uid +'" class="uname" style="' + MP.makeUsernameStyle(nextdj.role) + '">' + nextdj.un + '</span>just started playing ' + data.data.next.song.title, 'system');

                        //Desktop
                        if(settings.roomSettings.notifications.desktop.advance_next)
                            MP.api.util.desktopnotif.showNotification("musiqpad", "@" + nextdj.un + " just started playing\n" + data.data.next.song.title, "//i.ytimg.com/vi/" + data.data.next.song.cid + "/default.jpg");

                        //Sound
                        if(settings.roomSettings.notifications.sound.advance_next)
                            mentionSound.play();
                    }

					if(data.data.next.song){
						MP.media.timeRemaining = data.data.next.song.duration;
						MP.startTimeRemaining();
					}else{
						MP.media.timeRemaining = 0;
					}

					MP.addCurrentToHistory();

					MP.session.queue.users.shift();
					if (data.data.next.uid && MP.user && data.data.next.uid == MP.user.uid){
						var song = MP.user.playlists[ MP.user.activepl ].content.splice(0, 1)[0];
						MP.user.playlists[ MP.user.activepl ].content.push(song);
						//MP.api.util.changefavicon('/pads/lib/img/icon_dj.png');
					}// else MP.api.util.changefavicon('/pads/lib/img/icon.png');

					MP.applyModels();
					break;
				case API.DATA.EVENTS.DJ_QUEUE_LOCK:
					if(!data.data.error){
						MP.session.queue.lock = data.data.state;
						MP.applyModels();

						var user = MP.findUser(data.data.mid);
						MP.addMessage('The DJ queue has been ' + (data.data.state ? 'locked' : 'unlocked') + ' by '+(user ? '<span data-uid="'+ user.uid +'" class="uname" style="' + MP.makeUsernameStyle(user.role) + '">' + user.un + '</span>' : 'Unknown'), 'system');
					}
					break;
				case API.DATA.EVENTS.DJ_QUEUE_CYCLE:
					if(!data.data.error){
						$('.btn-cycle div').removeClass('mdi-sync').removeClass('mdi-sync-disabled').addClass(data.data.state ? 'mdi-sync' : 'mdi-sync-disabled');
						MP.session.queue.cycle = data.data.state;
						MP.applyModels();

						var user = MP.findUser(data.data.mid);
						MP.addMessage('DJ cycling has been ' + (data.data.state ? 'enabled' : 'disabled') + ' by '+(user ? '<span data-uid="'+ user.uid +'" class="uname" style="' + MP.makeUsernameStyle(user.role) + '">' + user.un + '</span>' : 'Unknown'), 'system');
					}
					break;
				case API.DATA.EVENTS.DJ_QUEUE_SKIP:
					var user = MP.findUser(data.data.uid);
					MP.addMessage( (user ? '<span data-uid="'+ user.uid +'" class="uname" style="' + MP.makeUsernameStyle(user.role) + '">' + user.un + '</span>' : 'Unknown ') + 'has skipped', 'system');
					break;
				case API.DATA.EVENTS.DJ_QUEUE_MOD_SKIP:
					var user = MP.findUser(data.data.mid);
					var lsmsg = (typeof data.data.lockSkipPosition == 'number' ? (data.data.lockSkipPosition == 0 ? ' and repositioned the DJ to the booth' : ' and repositioned the DJ to spot ' + data.data.lockSkipPosition + ' in the DJ queue') : '');
					MP.addMessage( (user ? '<span data-uid="'+ user.uid +'" class="uname" style="' + MP.makeUsernameStyle(user.role) + '">' + user.un + '</span>' : 'Unknown' ) + 'has mod skipped' + lsmsg, 'system');
					break;
				case API.DATA.EVENTS.VOTE_UPDATE:
					var vote = data.data;

					MP.session.queue.votes = vote.votes;

					//Do notifications
					if(vote.voted == 1){
						var user = MP.findUser(vote.uid);

						if(vote.action == 'like'){
							//Chat
							if(settings.roomSettings.notifications.chat.like)
								MP.addMessage('<span data-uid="'+ user.uid +'" class="uname" style="' + MP.makeUsernameStyle(user.role) + '">' + user.un + '</span>liked the song', 'system');

							//Desktop
							if(settings.roomSettings.notifications.desktop.like)
								MP.api.util.desktopnotif.showNotification("musiqpad", "@" + user.un + " liked the song");

							//Sound
							if(settings.roomSettings.notifications.sound.like)
								mentionSound.play();
						} else if(vote.action == 'grab'){
							//Chat
							if(settings.roomSettings.notifications.chat.grab)
								MP.addMessage('<span data-uid="'+ user.uid +'" class="uname" style="' + MP.makeUsernameStyle(user.role) + '">' + user.un + '</span>grabbed the song', 'system');

							//Desktop
							if(settings.roomSettings.notifications.desktop.grab)
								MP.api.util.desktopnotif.showNotification("musiqpad", "@" + user.un + " grabbed the song");

							//Sound
							if(settings.roomSettings.notifications.sound.grab)
								mentionSound.play();
						}
					}


					if (MP.historyList.historyInitialized) {
						if (MP.historyList.history[0] && MP.session.queue.currentsong == MP.historyList.history[0].song) {
							MP.historyList.history[0].votes = vote.votes;
						}
					}

					MP.applyModels();
					break;
				case API.DATA.EVENTS.USER_UPDATE:
					if (MP.user && data.data.user.uid == MP.user.uid) $.extend(MP.user, data.data.user);

					//Update seen users list
					if(MP.seenUsers[data.data.user.uid]) $.extend(MP.seenUsers[data.data.user.uid], data.data.user);

					//Update staff list
					if (MP.session.roomStaff.length){
						for (var i = 0; i < MP.session.roomStaff.length; i++){
							if (MP.session.roomStaff[i].uid == data.data.user.uid){
								MP.session.roomStaff.splice(i, 1);
								break;
							}
						}

						if (MP.isStaffMember(data.data.user.uid)){
							MP.session.roomStaff.push(data.data.user);
						}
					}

					MP.applyModels();
					break;
				case API.DATA.EVENTS.DELETE_CHAT:
					// TODO delete messages by a specific user: $('span[data-uid="data.data.uid"]').closest('.cm').remove();
					// TODO clear chat: $('.cm.message').remove();

					if (MP.checkPerm('chat.delete')) {
						$('#cm-' + data.data.cid).fadeTo(250, 0.3).addClass('deleted');
					}
					else {
						$('#cm-' + data.data.cid).slideUp( function(){ this.remove(); } );
					}
					break;
				case API.DATA.EVENTS.USER_RESTRICTED:
					var target = MP.findUser(data.data.uid);
					var source = MP.findUser(data.data.source);


					if(data.data.type == "BAN" && target){
						MP.session.bannedUsers.push(target);
					}
					
					MP.applyModels();
					
					var verbs = {
						BAN: 'banned',
						MUTE: 'muted',
						SILENT_MUTE: 'muted (silent)'
					};

					if (source && target)
						MP.addMessage('<span data-uid="'+ target.uid +'" class="uname" style="' + MP.makeUsernameStyle(target.role) + '">' + target.un + '</span>was ' + (verbs[data.data.type] || ('restricted (' + data.data.type + ')')) + ' by <span data-uid="'+ source.uid +'" class="uname" style="' + MP.makeUsernameStyle(source.role) + '">' + source.un + '</span>', 'system');
					break;
				case API.DATA.EVENTS.USER_UNRESTRICTED:
					var target = MP.findUser(data.data.uid);
					var source = MP.findUser(data.data.source);

					if(data.data.type == "BAN" && target){
						for(var i in MP.session.bannedUsers){
							if(MP.session.bannedUsers[i].uid == data.data.uid){
								MP.session.bannedUsers.splice(i, 1);
								break;
							}
						}
					}
					
					MP.applyModels();
					
					var verbs = {
						BAN: 'unbanned',
						MUTE: 'unmuted',
						SILENT_MUTE: 'unmuted (silent)',
					};

					if (source && target)
						MP.addMessage('<span data-uid="'+ target.uid +'" class="uname" style="' + MP.makeUsernameStyle(target.role) + '">' + target.un + '</span>was ' + (verbs[data.data.type] || ('unrestricted (' + data.data.type + ')')) + ' by <span data-uid="'+ source.uid +'" class="uname" style="' + MP.makeUsernameStyle(source.role) + '">' + source.un + '</span>', 'system');
					break;
				case API.DATA.EVENTS.USER_ROLE_CHANGE:
					var setter = MP.findUser(data.data.mid);
					var settee = MP.findUser(data.data.uid);
					var role = MP.getRole(data.data.role);

					MP.addMessage('<span data-uid="'+ setter.uid +'" class="uname" style="' + MP.makeUsernameStyle(setter.role) + '">' + setter.un + '</span>changed <span data-uid="'+ settee.uid +'" class="uname" style="' + MP.makeUsernameStyle(settee.role) + '">' + settee.un + '</span>\'s role', 'system');
					break;
				case API.DATA.EVENTS.DJ_QUEUE_REMOVE:
					if(!data.data.mid || !data.data.uid) return;
					var remover = MP.findUser(data.data.mid);
					var removee = MP.findUser(data.data.uid);

					MP.addMessage('<span data-uid="' + remover.uid + '" class="uname" style="' + MP.makeUsernameStyle(remover.role) + '">' + remover.un + '</span>removed <span data-uid="' + removee.uid + '" class="uname" style="' + MP.makeUsernameStyle(removee.role) + '">' + removee.un + '</span> from the DJ queue', 'system');
					break;
				case API.DATA.EVENTS.DJ_QUEUE_MOD_SWAP:
					//STAHP EDITING MY CODE
					MP.session.queue.users = data.data.queueList;

					var mod = MP.findUser(data.data.mid);
					var u1 = MP.findUser(data.data.uid1);
					var u2 = MP.findUser(data.data.uid2);

					MP.addMessage('<span data-uid="' + mod.uid + '" class="uname" style="' + MP.makeUsernameStyle(mod.role) + '">' + mod.un + '</span>swapped <span data-uid="' + u1.uid + '" class="uname" style="' + MP.makeUsernameStyle(u1.role) + '">' + u1.un + '</span> (position ' + (data.data.pos1 + 1) + ') with <span data-uid="' + u2.uid + '" class="uname" style="' + MP.makeUsernameStyle(u2.role) + '">' + u2.un + '</span> (position ' + (data.data.pos2 + 1) + ')', 'system');
					MP.applyModels();
					break;
				case API.DATA.EVENTS.DJ_QUEUE_MOD_MOVE:
					MP.session.queue.users = data.data.queueList;

					var mod = MP.findUser(data.data.mid);
					var user = MP.findUser(data.data.uid);

					MP.addMessage('<span data-uid="' + mod.uid + '" class="uname" style="' + MP.makeUsernameStyle(mod.role) + '">' + mod.un + '</span>moved <span data-uid="' + user.uid + '" class="uname" style="' + MP.makeUsernameStyle(user.role) + '">' + user.un + '</span> from ' + (data.data.from + 1) + ' to ' + (data.data.to + 1), 'system');

					MP.applyModels();
					break;

				case API.DATA.EVENTS.DJ_QUEUE_ADD:
					var mod = MP.findUser(data.data.mid);
					var user = MP.findUser(data.data.uid);
					var position = (typeof data.data.position == 'number' ? data.data.position + 1 : null);

					MP.addMessage('<span data-uid="' + mod.uid + '" class="uname" style="' + MP.makeUsernameStyle(mod.role) + '">' + mod.un + '</span>added <span data-uid="' + user.uid + '" class="uname" style="' + MP.makeUsernameStyle(user.role) + '">' + user.un + '</span> to the DJ queue' + (position ? ' at position ' + position : ''), 'system');
					break;

				case API.DATA.EVENTS.DJ_QUEUE_LIMIT:
					//TODO save new limit in session attributes
					var mod = MP.findUser(data.data.mid);

					MP.addMessage('<span data-uid="' + mod.uid + '" class="uname" style="' + MP.makeUsernameStyle(mod.role) + '">' + mod.un + '</span>has changed the queue limit to ' + data.data.limit, 'system');
					break;

				case API.DATA.EVENTS.PRIVATE_MESSAGE:
					MP.session.lastPMUid = data.data.uid;
					var user = MP.findUser(data.data.uid);

                    var msg = MP.escape(data.data.message);

					if (!MP.session.hasfocus){
						document.title = '! ' + document.title;
					}

					//Chat
                    if(settings.roomSettings.notifications.chat.pm)
                        API.chat.log('<br>' + msg, '<span onclick="$(\'#msg-in\').val(\'/pm '+ user.un + ' \').focus();">Private Message received from </span><span data-uid="'+ user.uid +'" class="uname" style="' + MP.makeUsernameStyle(user.role) + '">' + user.un + '</span>');

                    //Desktop
                    if(settings.roomSettings.notifications.desktop.pm)
                        MP.api.util.desktopnotif.showNotification("musiqpad", "@" + user.un + " sent you a private message\n" + msg);

                    //Sound
                    if(settings.roomSettings.notifications.sound.pm)
                        mentionSound.play();

					MP.addPrivateMessage(user, data.data.message, data.data.uid);
					break;

				case API.DATA.EVENTS.SERVER_RESPONSE:
					if (data.id) MP.callCallback(data);
					break;
			}

			MP.callListeners(data);
		};
	}
	initSocket();

	var getAutocompleteIndex = function(ind){
		var $elem = $('#chat-back > .autocomplete li.active');

		if (!$elem.length) return -1;

		return $elem.index();
	};

	var changeAutocompleteIndex = function(ind){
		var len = $('#chat-back > .autocomplete li').length;

		if (!len) return;

		if (ind < 0) ind = 0;
		if (ind > len-1) ind = len-1;

		$('#chat-back > .autocomplete li.active').removeClass('active');
		$('#chat-back > .autocomplete li:eq(' + ind + ')').addClass('active');
	};

	var acceptAutocomplete = function(){
		var mentionVal = $('#chat-back > .autocomplete li.active').text().replace(/\t/g, '');
		var $target = $('#msg-in');
		var pos = $target.caret();
		var val = $target.val();

		//Check if completing emoji or username
		if($('#chat-back > .autocomplete.ac-user').length != 0){

			var parts = [ val.slice(0, val.slice(0, pos).lastIndexOf('@')), val.slice(val.slice(0, pos).lastIndexOf('@'), pos), val.slice(pos) ];
			parts[1] = "@" + mentionVal + (parts[2][0] == ' ' ? '' : ' ');
			$target.val(parts.join(''));
			$target.trigger('input');

			return parts[0].length + parts[1].length;

		} else if($('#chat-back > .autocomplete.ac-emote').length != 0){

			var parts = [ val.slice(0, val.slice(0, pos).lastIndexOf(':')), val.slice(val.slice(0, pos).lastIndexOf(':'), pos), val.slice(pos) ];
			parts[1] = ':' + mentionVal + ':' + (parts[2][0] == ' ' ? '' : ' ');
			$target.val(parts.join(''));
			$target.trigger('input');

			return parts[0].length + parts[1].length;

		} else if($('#chat-back > .autocomplete.ac-cmd').length != 0){

			$target.val(mentionVal + ' ');
			$target.trigger('input');

			return mentionVal.length + 1;
		}
	};

	$('#pm-msg-in').on('keydown', function(e){
	    if (e.which == 13) {
	        e.preventDefault();
	        var $input = $(this);
	        var $chat = $('#pm-chat');

	        if (!$input.val()) return;

	        //MP.session.lastMessage = $input.val();
	        //MP.sendMessage($input.val());
	        var activepm = angular.element($('body')).scope().activepm;
	        if (!activepm) {
	            return;
	        }
	        MP.api.room.getUser(activepm.user.uid, function(err, user) {
	            if (!user) {
	                return;
	            }
	            var msg = $input.val();
	            MP.privateMessage(user.uid, msg, function(err, data){

	            });
	            $chat.scrollTop( $chat[0].scrollHeight );
	            $input.val('');
	        });
	        return true;
	    }
	});

	// Chat text box
	$('#msg-in')
		/*.on('submit', function(e){
			e.preventDefault();
			var $input = $(this).find('input');
			var $chat = $('#chat');

			if (!$input.val()) return;

			MP.session.lastMessage = $input.val();
			MP.sendMessage($input.val());
			$chat.scrollTop( $chat[0].scrollHeight );
			$input.val('');
			return true;
		})*/
		.on('keydown', function(e){
			var $input = $(this).find('input');
			var autocomplete = $('#chat-back > .autocomplete');
			var isAutocompleteUp = autocomplete.length;

			if (e.which == 9) e.preventDefault();

			if (e.which == 38) { // Up key
				if (isAutocompleteUp){
					e.preventDefault();
					changeAutocompleteIndex( getAutocompleteIndex() - 1 );
				}else{
					$input.val(MP.session.lastMessage);

					// .val is apparently not immediate...?
					setTimeout(function(){$input.caret(-1);}, 1);
				}
			}else if (e.which == 40) { // Down key
				if (isAutocompleteUp){
					e.preventDefault();
					changeAutocompleteIndex( getAutocompleteIndex() + 1 );
				}
			}else if (e.which == 9 || e.which == 13){ // Tab key / Enter key
				if (isAutocompleteUp){
					e.preventDefault();

					var newPos = acceptAutocomplete();

					$('#msg-in').caret(newPos + 1);
				}else{
					if (e.which == 13){
						e.preventDefault();
						var $input = $(this);
						var $chat = $('#chat');

						if (!$input.val()) return;

						MP.session.lastMessage = $input.val();
						MP.sendMessage($input.val(), $input.hasClass('msg-staffchat'));
						$chat.scrollTop( $chat[0].scrollHeight );
						$input.val('');
						return true;
					}
				}
			}
		}).on('input', function(e){
			var $target = $(e.target);
			var pos = $target.caret();
			var val = $target.val();

			if (pos == 3 && MP.session.lastPMUid && /^\/r\s/i.test(val)){
				var user = MP.findUser(MP.session.lastPMUid);
				if (user){
					$('#msg-in').val('/pm ' + user.un + ' ');
				}
			}

			$('#chat-back > .autocomplete').remove();

			if (pos != 0){
				var settings = JSON.parse(window.localStorage.getItem("settings"));

				var un = (val.substr(0, pos).match(/(^|.*\s)@([a-z0-9_-]*)$/i) || []).slice(2);
				var doWeAutocompleteUsername = un.length == 1 && un[0];

				var em = (val.substr(0, pos).match(/(^|.*\s):([+a-z0-9_-]*)$/i) || []).slice(2);
				var doWeAutocompleteEmotes = em.length == 1 && em[0] && settings.roomSettings.enableEmojis;

				var cm = val.match(/^\/[a-z]*$/i);
				var doWeAutocompleteCommand = Boolean(cm);

				var list = [];

				if(doWeAutocompleteUsername){
					list = MP.userAutocomplete(un);

					if(list.length == 0) return;
					$('#chat-back').append('<div class="autocomplete ac-user">\
						<ul>'+
							(function(){
								var first = true;
								var out = '';

								for (var i in list){
									out += '<li ' + (first ? 'class="active"' : '') + ' style="' + MP.makeUsernameStyle(list[i].role) + '">' + MP.makeBadgeStyle({ user: list[i] }) + list[i].un + '</li>';
									first = false;
								}

								return out;
							})()
						+'</ul>\
					</div>');
				} else if (doWeAutocompleteEmotes && MP.session.allowemojis){
					em = em[0];

					//Check for ASCII emotes
					for(var e in MP.emotes_ascii){
						if(e.slice(1) == em) return;
					}

					//Show autocomplete menu
					list = MP.emojiAutocomplete(em);
					if(list.length == 0) return;
					$('#chat-back').append('<div class="autocomplete ac-emote">\
						<ul>'+
							(function(){
								var first = true;
								var out = '';

								for (var i in list){
									out += '<li ' + (first ? 'class="active"' : '') + '><img align="absmiddle" alt=":' + i + ':" class="emoji" src="' + list[i] + '" title=":' + i + ':" />' + i + '</li>';
									first = false;
								}

								return out;
							})()
						+'</ul>\
					</div>');
				} else if (doWeAutocompleteCommand){
					list = MP.commandAutocomplete(cm[0].slice(1));

					if(list.length == 0) return;
					$('#chat-back').append('<div class="autocomplete ac-cmd">\
						<ul>'+
							(function(){
								var first = true;
								var out = '';

								for (var i in list){
									out += '<li ' + (first ? 'class="active"' : '') + '>/' + list[i] + '</li>';
									first = false;
								}

								return out;
							})()
						+'</ul>\
					</div>');
				}
				/*var atPos = val.lastIndexOf('@', pos-1);
				var spacePos = val.lastIndexOf(' ', pos-1);
				var nextSpacePos = val.indexOf(' ', atPos);

				if (atPos == -1 || spacePos > atPos || pos == atPos+1 || (atPos != 0 && val.charAt(atPos-1) != ' ')) return;

				var stringVal = val.substr(atPos+1, (nextSpacePos > -1 ? nextSpacePos - atPos-1 : undefined));

				var list = MP.userAutocomplete(stringVal);

				if (!list.length) return;

				$('#chat-back').append('<div class="mention-autocomplete">\
					<ul>'+
						(function(){
							var first = true;
							var out = '';

							for (var i in list){
								out += '<li ' + (first ? 'class="active"' : '') + ' style="' + MP.makeUsernameStyle(list[i].role) + '">' + MP.makeBadgeStyle(list[i].badge.top, list[i].badge.bottom, MP.getRole(list[i].role).style.color) + list[i].un + '</li>';
								first = false;
							}

							return out;
						})()
					+'</ul>\
				</div>');*/
			}
		});
		var newMsgs;
	function checkMoreMessages() {
		var distance = $('#messages')[0].clientHeight - $('#chat')[0].clientHeight;
		var scroll = $('#chat').scrollTop();
		if (!(distance > scroll + 100)) {
			newMsgs = false;
			if(!$(".more-messages-indicator").hasClass("hidden")){
				 $(".more-messages-indicator").addClass("hidden");
			}
		}
		else {
			newMsgs = true;
		}
	}
	MP.on("chat", function () {
		if (newMsgs) {
			console.log("Chat + scrolled up");
			if($(".more-messages-indicator").hasClass("hidden")){
				 $(".more-messages-indicator").removeClass("hidden");
			}
		}
	});
	var chatScrollTimeout;
	$('#chat').on('scroll', function () {
		if (chatScrollTimeout) {
        clearTimeout(chatScrollTimeout);
        chatScrollTimeout = null;
    }
    chatScrollTimeout = setTimeout(checkMoreMessages, 250);
	});
	$('.more-messages-indicator').click(function () {
		$('#chat').scrollTop($('#messages')[0].clientHeight - $('#chat')[0].clientHeight);
		if(!$(".more-messages-indicator").hasClass("hidden")){
			 $(".more-messages-indicator").addClass("hidden");
		 }
	});
	$(document)
		// Changing and accepting mentions
		.on('mouseover', '.autocomplete li', function(){
			var $ul = $(this).parents('ul');

			$ul.find('li.active').removeClass('active');
			$(this).addClass('active');
		})
			// Create a new Private Message
		.on('click', '.btn-new-pm', function() {
			var users = MP.getUsersInRoom();
			var userHtml = "";
			for (var uid in users) {
				userHtml += '<li>\
								<div class="new-pm-user" data-pmuid="' + uid + '">\
									<div>' + MP.makeBadgeStyle({user: users[uid], type: 'pmList' }) + '</div><div class="username" style="' + MP.makeUsernameStyle(users[uid].role) + '">' + users[uid].un + '</div>\
								</div>\
							</li>';
			}
			MP.makeCustomModal({
				content: '<div class="model-new-pm">\
							<h3>Select User</h3>\
							<ul class="pm-user-list">' +
								userHtml +
							'</ul>\
							<div class="offline-user">\
							<input id="offline-pm-user" type="text" maxlength="255" placeholder="Type Offline Username" autocomplete="off" data-ng-show="isLoggedIn" class="">\
							</div>\
						  </div>',
				buttons: [
					{
						icon: 'mdi-close',
						handler: function(){
							$('.modal-bg').remove();
						},
						classes: 'modal-ctrl modal-no'
					},
					{
						icon: 'mdi-check',
						handler: function(){
							var pmuid = $('.pm-user-list li.selected div').attr('data-pmuid');

							var offlineUsername = $('#offline-pm-user').val().replace(" ", "");

							function userCallback(user) {

								if (user)
								{
									console.log('Selected User ' + user.uid);
									$('.modal-bg').remove();

									MP.makeCustomModal({
										content: '<div class="model-new-pm-message">\
													<h3>Sending PM to ' + user.un + '</h3>\
													<input id="pm-in" type="text" maxlength="255" placeholder="Type message" autocomplete="off" data-ng-show="isLoggedIn" class="">\
						  						  </div>',
										buttons: [{
											icon: 'mdi-close',
											handler: function(){
												$('.modal-bg').remove();
											},
											classes: 'modal-ctrl modal-no'
										},
										{
											icon: 'mdi-check',
											handler: function(){
												var pmmessage = $('#pm-in').val();

												console.log('Selected Message "' + pmmessage + '" sending to ID "' + user.uid + '" with UserName "' + user.un + '"');
												MP.api.chat.sendPrivate(user.uid, pmmessage, function(err, data){
													if (err) {
														console.log(err);
													} else {
														console.log(data);
														if (data.success == true)
														{
															$('.modal-bg').remove();
														}
													}
												});
											},
											classes: 'modal-ctrl modal-yes'
										}],
										dismissable: true
									});
								}
							}

							if (offlineUsername && offlineUsername.length > 0)
							{
								var user = MP.api.room.getUserByName(offlineUsername, function(err, data){
									if (err) {
										if (err == "UserNotFound") {
											MP.makeAlertModal({
												content: 'The username you entered does not match a user from this server.'
											});
										} else {
											MP.makeAlertModal({
												content: 'An error occurred. Please try again later.'
											});
										}
									} else {
										userCallback(data);
									}
								});
							}
							else {
								userCallback(MP.findUser(pmuid));
							}
						},
						classes: 'modal-ctrl modal-yes'
					}
				],
				dismissable: true
			});
		})
		.on('click', '.pm-user-list > li', function(){
			$(this).addClass("selected").siblings().removeClass("selected");
			$('#offline-pm-user').val('');
		})
		.on('input', '#offline-pm-user', function() {
			var val = $(this).val();
			if (val && val.length > 0) {
				$('.pm-user-list > li').removeClass("selected");
			}
		})
		.on('click', '.autocomplete li.active', function(){
			var newPos = acceptAutocomplete();

			$('#msg-in')
				.focus()
				.caret(newPos + 1);
		})
		// Changing viewed playlist
		.on('click', '.lib-fdr', function(){
			var pid = $(this).attr('data-pid');

			if (MP.user.playlists[pid]){
				MP.session.viewedPl = pid;
				MP.applyModels();

				if (MP.user.playlists[pid].num != MP.user.playlists[pid].content.length){
					MP.getPlaylistContents(pid);
				}
			}
		})

		// Changing active playlist
		.on('dblclick taphold', '.lib-fdr', function(){
			var pid = $(this).attr('data-pid');

			if (MP.user.playlists[pid]){
				MP.playlistActivate(pid);
			}
		})
		.on('click', '.btn-activate-playlist', function(){
			var pid = $(this).parent().parent().data('pid')

			if (MP.user.playlists[pid]){
				MP.playlistActivate(pid);
			}
		})

		// Deleting playlist
		.on('click', '.btn-delete-playlist', function(e){
			if (!MP.session.viewedPl) return;

			MP.makeConfirmModal({
				content: 'Are you sure you want to delete the playlist ' + $('<b></b>').text(MP.api.playlist.get(MP.session.viewedPl).name).prop('outerHTML') + '?',
				dismissable: true,
				callback: function(res){
					if (res)
						MP.playlistDelete( MP.session.viewedPl );
				}
			});
		})

		// Removing song
		.on('click', '.btn-remove-song', function(){
			var $base = $(this).parents('.lib-sng');

			MP.playlistRemove(MP.session.viewedPl, $base.attr('data-cid'));
		})

		// Move song to bottom
		.on('click', '.btn-song-bot', function(){
			var $base = $(this).parents('.lib-sng');

			MP.playlistMove(MP.session.viewedPl, $base.attr('data-cid'), MP.user.playlists[ MP.session.viewedPl ].content.length);
		})
		// On arrow_up right_click move to bottom
		.on('contextmenu taphold', '.lib-sng:not(:first-child) .btn-song-top', function(){
			var $base = $(this).parents('.lib-sng');

			MP.playlistMove(MP.session.viewedPl, $base.attr('data-cid'), MP.user.playlists[ MP.session.viewedPl ].content.length);
			return false;
		})

		//Move song to top
		.on('click', '.btn-song-top', function(){
			var $base = $(this).parents('.lib-sng');

			MP.playlistMove(MP.session.viewedPl, $base.attr('data-cid'), 0);
		})
		// On arrow_down right_click move to top
		.on('contextmenu taphold', '.lib-sng:first-child .btn-song-bot', function(){
			var $base = $(this).parents('.lib-sng');

			MP.playlistMove(MP.session.viewedPl, $base.attr('data-cid'), 0);
			return false;
		})

		//Edit playlist name
		.on('click', '.btn-rename-playlist', function(){
			MP.showEditPlaylistModal(MP.session.viewedPl);
		})

		//Edit song name
		.on('click', '.btn-rename-song', function(){
			var $base = $(this).parents('.lib-sng');

			MP.showEditPlaylistModal(MP.session.viewedPl, $base.attr('data-cid'));
		})

		// Open video to preview
		.on('dblclick', '.lib-sng,.yt-sng,.hist-sng', function(){
			var cid = $(this).attr('data-cid');

			MP.mediaPreview.open(cid);
		})
		.on('click', '.yt-blocked-sng', function(){
			var cid = $(this).attr('data-cid');
			var player = API.player.getPlayer();
			player.loadVideoById(cid);
			API.player.getPlayer().seekTo(MP.models.songDuration - MP.models.secondsLeftInSong)
			$('.video-blocked-bg').attr("style", "");
		})
		// Closing media preview
		.on('click', '.logo-menu .modal-bg, .btn-logo', function(e){
			if (!$(e.target).closest('.modal').length){
				MP.mediaPreview.close();
				$('.logo-menu .modal-bg').remove();
			}
		})
		// Closing modals
		.on('click', '.modal-bg',function(e, dismissable){
			e.originalEvent.dismissable = (typeof e.originalEvent.dismissable !== 'undefined' ? e.originalEvent.dismissable : true);

			if (!$(e.target).closest('.modal').length && e.originalEvent.dismissable)
				$(this).remove();
		})
		// ESC key logo menu shortcut
		.on('keydown', function(e){
			var scope = angular.element($('body')).scope();

			if(!scope.roomSettings.shortcuts) return;

			var keyMenuBinding = {
				76: 1,	// L -> Lobby
				83: 2,	// S -> Settings
				80: 3,	// P -> Playlists
				72: 4	// H -> History
			};

			// Anything after this will be cancelled if keydown is input
			if ($(e.target).closest("input")[0]) {
    			return;
			} else if (e.which == 8) { // Backspace -> Cancels
				e.preventDefault();
				return;
			} else if (e.which == 107 || e.which == 187){ // + -> Increase Volume
				var currentVol = API.player.getPlayer().getVolume();
				var vol_val = 0;
				if (currentVol >= 98){
					vol_val = 100;
				}
				else {
					vol_val = currentVol + 2;
				}

				API.player.setVolume(vol_val);
			} else if (e.which == 109 || e.which == 189){ // - -> Decrease Volume
				var currentVol = API.player.getPlayer().getVolume();
				var vol_val = 0;
				if (currentVol <= 2){
					vol_val = 0;
				}
				else {
					vol_val = currentVol - 2;
				}

				API.player.setVolume(vol_val);
			} else if (e.which == 77) { // M -> Mute/Unmute
				var settings = JSON.parse(localStorage.getItem("settings"));

				API.player.setMute(!settings.player.mute);
			} else if (keyMenuBinding[e.which]) {
				if (!$('.logo-menu').hasClass('logo-menu-expanded')) {
					$('div.ico-logo').click();
				}
				else if (scope.prop.t == keyMenuBinding[e.which]) {
					$('div.ico-logo').click();
				}
				scope.prop.t = keyMenuBinding[e.which];
				scope.$apply();
			}
		})


		// Onclick username mention
		.on('contextmenu taphold','.cm .uname,.people-user .uname',function(){
			var uname = $(this).text();
			var val = $('#msg-in').val();
			$('#msg-in').val(val + '@' + uname + ' ');
			$('.btn-chat').click();
			$('#msg-in').focus();
			return false;
		})


		//OnRightClick or TapHold show user menu
		.on('click','.cm .uname', function(){
			var user = MP.seenUsers[parseInt($(this).attr('data-uid'))];
			var $this = $(this).closest('.cm');
			MP.showUserMenu(user,$this);
		})
		.on('click','#app-right .uname',function(){
			var user = MP.seenUsers[parseInt($(this).attr('data-uid'))];
			var $this = $(this);
			MP.showUserMenu(user,$this);
		})
		.on('click','.user-menu .restrict',function(){
			MP.showRestrictionModal(parseInt($(this).parent().attr('data-uid')));
		})
		.on('click','.user-menu .mute',function(){
			var uid = parseInt($(this).parent().attr('data-uid'));

			if(MP.api.user.isBlocked(uid)) {
				MP.api.user.unblock(uid, function(err) {
					if(err) {
						var messages = {
							'UserNotBlocked': 'This user is not blocked.',
						}

						MP.makeAlertModal({
							content: messages[err] || err,
						});
					}
				});
			} else {
				MP.api.user.block(uid, function(err) {
					if(err) {
						var messages = {
							'UserAlreadyBlocked': 'This user is already blocked',
							'CannotBlockSelf': 'You cannot block yourself!',
						}

						MP.makeAlertModal({
							content: messages[err] || err,
						});
					}
				});
			}
		})
		.on('click','.user-menu .set-role',function(){
			MP.showRoleModal(parseInt($(this).parent().attr('data-uid')));
		})
		.on('click','.user-menu .add-dj',function(){
			MP.djQueueModAdd(parseInt($(this).parent().attr('data-uid')));
		})
		.on('click','.user-menu .remove-dj',function(){
			MP.djQueueModRemove(parseInt($(this).parent().attr('data-uid')));
		})
		.on('click','.user-menu .menu-mention',function(){
			var val = $('#msg-in').val();
			$('#msg-in').val(val + '@' + MP.seenUsers[parseInt($(this).parent().attr('data-uid'))].un + ' ');
			$('.btn-chat').click();
			$('#msg-in').focus();
		})


		//Hide user menu on outside click
		.on('click contextmenu taphold', function() {
			$('.user-menu').remove();
		})
		.on('click contextmenu taphold', '.user-menu, .uname', function(e) {
			e.stopPropagation();
		})
		.on('click','.user-menu .modal-ctrl', function() {
    		$('.user-menu').remove();
		})
		.on('click','#video-blocked-button', function() {
				$('.video-blocked-bg').attr('style', "");
		})
		//Onclick delete message
		.on('click','.cm.message .msg-del-btn',function(){
			var cid = $(this).parent().attr('id').match(/\d{1,}/);
			if (!cid || cid.length == 0){
				return;
			}
			MP.deleteChat(parseInt(cid[0]));
		});

	var addPlaylistButton = function(e){
		e.preventDefault();
		var $input = $('#lib-add');

		if (!$input.val()) return;

		MP.playlistCreate($input.val(), function(err, data){
			if (err){
                MP.makeAlertModal({
                    content: 'There was a problem adding the playlist: ' + err,
                });
                return;
            }

			$input.val('');
		});
		return true;
	};

	// Adding playlist by clicking the add button
	$('.btn-add-playlist').on('click', addPlaylistButton);

	// Adding playlist by hitting the enter key while the input is focused
	$('#lib-add').on('keydown', function(e){
		if (e.which == 13) {
			addPlaylistButton(e);
		}
	});

	//Youtube search
	$('#lib-search')
		// Hide search when the text input goes empty
		.on('input', function(e){
			// if ( $(this).val() == '' ){
			// 	//MP.session.songSearch = false;
			// 	MP.session.searchResults = null;
			// 	MP.applyModels();
			// }
		})

		// Show search again if the text box isn't empty
		.on('click', function(e){
			if ( $(this).val() != '' && MP.session.searchResults ){
				MP.session.viewedPl = null;
				MP.applyModels();
			}
		})

		// Execute search when the enter key is pressed
		.on('keydown', function(e){
			if (e.which == 13 && $(this).val() != '') {
				//MP.session.songSearch = true;

				/*if ( $(this).val() == '' ){
					//MP.session.songSearch = false;
					MP.session.searchResults = null;
					MP.applyModels();
					return;
				}*/

				MP.youtubeSearch($(this).val(), function(err, res){
					MP.session.searchResults = res;
					MP.session.viewedPl = null;
					MP.applyModels();

					$('.lib-search-list').scrollTop(0);

					$('.yt-sng')
						.draggable({
							appendTo: '#app',
							helper: function(){
								return $(this).clone().css({'width': $(this).css('width'), 'font-weight': 'bold'});
							},
							opacity: 0.7,
							cursor: 'grabbing',
							zIndex: 10000000,
							cursorAt: { top: 10, left: 10 }
						})
						.on('dragstart', function(){
							$('.lib-fdr').droppable({
								accept: '.yt-sng',
								hoverClass: 'draghover',
								tolerance: 'pointer',
								drop: function(e, ui){
									var pid = $(this).attr('data-pid');
									var cid = $(ui.draggable).attr('data-cid');

									MP.playlistAdd(pid, cid, 'top', function(err, data){
										if(err == "SongAlreadyInPlaylist"){
											MP.makeConfirmModal({
												content: "Song is already in your playlist, would like to move it to the top?",
												callback: function(res){
													if(res) MP.api.playlist.moveSong(pid, cid, 'top');
												}
											});
										}
									});
								}
							});
						})
						.on('dragstop', function(){
							setTimeout(function() { $('.lib-fdr').droppable('destroy'); }, 100);
						});
				});

			}
		});
	//Playlist import
	$('#lib-import').on('keydown', function(e){
		if(e.which == 13 && $(this).val() != ''){
			$('.btn-import').click();
		}
	});
	$('.btn-import').on('click', function(){
		MP.makeCustomModal({
			content: '<div class="modal-import">\
						<h3>Playlist Import</h3>\
						<form action="" onsubmit="return false;">\
						<div class="text">YouTube:</div><input id="yt-pl-import" type="text" placeholder="YouTube Playlist Link/ID" autocomplete="off"></input><br>\
						<div class="text">musiqpad:</div><input id="mp-pl-import" type="file" /><br>\
						<div class="text">Plug.DJ:</div><input id="plug-pl-import" type="file" /><br>\
						<div class="text">Dubtrack.fm:</div><input id="dt-pl-import" type="file" />\
						</form>\
					  </div>',
			buttons: [
				{
					icon: 'mdi-close',
					handler: function(){
						$('.modal-bg').remove();
						MP.mediaPreview.close();
					},
					classes: 'modal-no'
				},
				{
					icon: 'mdi-import',
					handler: function(){
						var ytPl = document.getElementById("yt-pl-import").value;
						var mpFile = document.getElementById("mp-pl-import").value;
						var plugFile = document.getElementById("plug-pl-import").value;
						var dtFile = document.getElementById("dt-pl-import").value;

						if (!(!ytPl != !mpFile != !plugFile != !dtFile)) {
							console.log(ytPl, mpFile, plugFile, dtFile);
							MP.makeAlertModal({
								content: 'You have specified more than 1 different import type. Please ensure that you only attempt to import 1 playlist type at a time.',
							});
						} else {
							if (ytPl) {
								var el = $('#yt-pl-import');
								var pid = (el.val().match(/list=[a-z0-9_-]+(?=&|$)/i) || el.val().match(/^([a-z0-9_-]+)$/i) || [])[0];

								if(pid && pid != ''){
									pid = pid.replace(/^list=/, '');
									MP.makeCustomModal({
										content: 'Your playlist is being imported, please wait...',
										buttons: [],
										dismissable: false,
									});
									MP.api.playlist.import(pid, false, function(err, data){
										if(err){
											var errors = ['PlaylistNotFound', 'PlaylistEmpty', 'ConnectionError'];
											var errmsgs = ['The specified playlist was not found, make sure the playlist exists and is either public ounlisted', 'The playlist you are trying to import is empty', 'Could not connect to YouTube Data APIplease contact the pad owner'];
											MP.makeAlertModal({
												content: errmsgs[errors.indexOf(err)],
											});
										} else {
											var names = '<b>' + data.content[0].name + '</b>';
											if(data.content.length > 1)
												for(var i = 1; i < data.content.length; i++)
													names += ', ' + $('<b></b>').text(data.content[i].name).prop('outerHTML');
											$('#lib-import').val('');
											MP.makeAlertModal({
												content: 'Playlist' + (data.content.length > 1 ? 's' : '') + ' ' + names + ' successfuly imported',
											});
										}
									});
								} else {
									MP.makeAlertModal({
										content: 'Invalid link or playlist ID',
									});
								}
							} else if (mpFile || plugFile || dtFile) {
								if (window.File && window.FileReader && window.FileList && window.Blob) {
									var fileReader = new FileReader();
									var element = document.getElementById(mpFile ? 'mp-pl-import' : ( plugFile ? 'plug-pl-import' : 'dt-pl-import'));
									fileReader.onload = function () {
										var data = fileReader.result;
										if (data) {
											try {
												data = JSON.parse(data);
											}
											catch (e) {
												MP.makeAlertModal({
													content: 'Cannot parse the JSON in the file. Please make sure this is a valid JSON file.',
												});
												return;
											}
											if (mpFile) {
												if (data.name && data.content && Array.isArray(data.content)) {
													MP.makeCustomModal({
														content: 'Importing playlist <b>"' + data.name + '"</b> containing ' + data.content.length + ' songs.<br>This may take a while.',
														buttons: [],
														dismissable: false,
													});
													var content = data.content;
													MP.api.playlist.create(data.name, function(err, data) {
														if (!err) {
															var pl = data;
															var songs = [];
															for (var i = 0, len = content.length; i < len; i++) {
																songs.push(content[i].cid);
															}
															MP.api.playlist.addSong(data.id, songs, function (err, data) {
														   		$('.modal-bg').remove();
														   		if (!err) {
														   			MP.makeAlertModal({
																		content: 'Imported <b>' + pl.playlist.name + '</b> playlists successfully.',
																	});
														   		}
														   		else {
														   			MP.makeAlertModal({
																		content: 'Failed to add songs to playist <b>' + pl.playlist.name + '</b>. Removing playlist due to it being empty.',
																	});
																	MP.api.playlist.delete(pl.id);
														   		}
															});
														}
														else {
															$('.modal-bg').remove();
														   	MP.makeAlertModal({
																content: 'Failed to create playlist with the name <b>' + data.name + '</b>.',
															});
														}
													});
												}
												else {
													MP.makeAlertModal({
														content: 'The JSON file selected does not appear to be using the correct format. This import only works using playlists exported from other musiqpad servers.',
													});
												}
											} else if(plugFile) {
												if (data.is_plugdj_playlist && data.playlists) {
													try {
														var loopPlaylists = function(plNames, arr, pl, sleep) {
															var plName = plNames[pl];
															var songCount = data.playlists[plName].length;
															$('.modal-bg').remove();
															MP.makeCustomModal({
																content: 'Importing playlist <b>"' + plName + '"</b> containing ' + songCount + ' songs.<br>This may take a while.',
																buttons: [],
																dismissable: false,
															});
															if (sleep) {
																setTimeout(function() {
																	loopPlaylists(plNames, arr, pl, !sleep);
																}, 1000);
																return;
															}
														    MP.api.playlist.create(plName, function(err, data) {
																if (!err) {
																	var songs = [];
																	var playlist = arr[data.playlist.name];
																	for (var i = 0, len = playlist.length; i < len; i++) {
																		if (playlist[i].type == "1") {
																			songs.push(playlist[i].id);
																		}
																	}
																	MP.api.playlist.addSong(data.id, songs, function (err, data) {
																		pl++;
														    			$('.modal-bg').remove();
																		if(pl < plNames.length) {
														    				loopPlaylists(plNames, arr, pl, !sleep);
														    			}
														    			else {
														    				MP.makeAlertModal({
																				content: 'Imported ' + plNames.length + ' playlists successfully.',
																			});
														    			}
																	});
																} else {
														      		pl++;
														    		$('.modal-bg').remove();
																	if(pl < plNames.length) {
														    			loopPlaylists(plNames, arr, pl, !sleep);
														    		}
														    		else {
														    			MP.makeAlertModal({
																			content: 'Imported ' + plNames.length + ' playlists successfully.',
																		});
														    		}
														      	}
															});
														}
														var playlistNames = Object.getOwnPropertyNames(data.playlists);
														loopPlaylists(playlistNames, data.playlists, 0, false);
													} catch (e) {
														MP.makeAlertModal({
															content: 'An error occurred whilst attempting to import your playlists. Please submit a buto a member of the musiqpad team including a screenshot of your console and a copy oyour JSON file.',
														});
													}
												} else {
													MP.makeAlertModal({
														content: 'The JSON file selected does not appear to be using the correct format. This import only works using playlists exported from Plug.DJ using pye.sq10.net',
													});
												}
											} else {
												if(data.status == "ok" && data.data && data.meta && data.meta.name){
													var plName = data.meta.name;
													var songCount = data.data.length;

													$('.modal-bg').remove();
													MP.makeCustomModal({
														content: 'Importing playlist <b>"' + plName + '"</b> containing ' + songCount + ' songs.<br>This may take a while.',
														buttons: [],
														dismissable: false,
													});

													MP.api.playlist.create(plName, function(err, pldata){
														if(!err){
															var songs = [];
															for(var i = 0; i < songCount; i++)
																if((data.data[i] || {}).format == "1")
																	songs.push(data.data[i].cid);

															MP.api.playlist.addSong(pldata.id, songs, function(err, data){
																MP.makeAlertModal({
                                  content: 'Playlist ' + plName + ' imported successfully (imported ' + data.video.length + ').',
																});
															});
														} else {

														}
													});
												} else {
													MP.makeAlertModal({
														content: 'The JSON file selected does not appear to be using the correct format. This import only works using playlists exported from Dubtrack.fm using github.com/JTBrinkmann/Dubtrack-Playlist-Pusher',
													});
												}
											}
										} else {
											// Some Error
										}
									};
									fileReader.readAsText(element.files[0]);
								} else {
									MP.makeAlertModal({
										content: 'The browser you are using does not support the File APIs. Your import has been cancelled.',
									});
								}
							}
						}
					},
					classes: 'modal-yes'
				}
			],
			dismissable: true
		});
	});

	//Join DJ queue
	$('.btn-join').on('click', function(){
		if (!MP.isLoggedIn()) return;
		if (!MP.session.queue.users) return;

		var pos = MP.session.queue.users.indexOf(MP.user.uid);
		var cb = function(err){
			if (err){
				MP.makeAlertModal({
					content: 'Could not join/leave the waitlist: ' + err,
					dismissable: true
				})
			}
		};

		if ( MP.session.queue.users.indexOf(MP.user.uid) > -1 || (MP.session.queue.currentdj && MP.session.queue.currentdj.uid == MP.user.uid) ) {
			MP.makeConfirmModal({
				content: 'Are you sure you want to leave the DJ queue?',
				dismissable: true,
				callback: function(res){
					if (res)
						MP.djQueueLeave(cb);
				}
			});
		} else if (pos == -1) {
			MP.djQueueJoin(cb);
		}
	});

	//Skip song
	$('.btn-skip').on('click', function(){
		MP.djQueueSkip();
	});

	//Set last play before leave
	$('.btn-lastdj').on('click', function(){
		MP.toggleLastDj();
	});

	//Toggle cycle
	$('.btn-cycle').on('click', function(){
		MP.djQueueCycle();
	});

	//Toggle lock
	$('.btn-lock').on('click', function(){
		MP.djQueueLock();
	});

	// Remove active class on advance
	MP.on('advance', function(){
		$('.btn-grab.active, .btn-upvote.active, .btn-downvote.active').removeClass('active');
	});

	// Grab button
	$('.btn-grab').on('click', function(e){
		if (!MP.isLoggedIn()) return;

		if ($(e.target).closest('.popup').length) return;
		if (Object.keys(MP.user.playlists) == 0) {
			MP.makeAlertModal({
				content: 'You have no playlists. Please create a playlist in order to grab a song',
			});
			return;
		}
		var id = (MP.media.media ? MP.media.media.cid : null);
		if (MP.user && MP.user.activepl && id !== false){
			MP.playlistAdd(MP.user.activepl, id, 'bottom', function(err, data){
				if(err == "SongAlreadyInPlaylist"){
					MP.makeConfirmModal({
						content: "Song is already in your playlist, would like to move it to the top?",
						callback: function(res){
							if(res) MP.api.playlist.moveSong(MP.user.activepl, id, 'top');
						}
					});
				}
			});
			if(!$(this).hasClass('btn-grab-history'))
				MP.vote('grab');
		}
	});

	$(document).on("click", ".playlists-grab-history", function(e){
		if (!MP.isLoggedIn()) return;

		var id = $(this).parent().parent().data('cid');

		if(!$(e.target).hasClass('pl-grab-create')){
			var pid = e.target.attributes['data-pid'].textContent;
			if (MP.user && pid && id !== false) {
				MP.playlistAdd(pid, id, 'bottom', function(err, data){
					if(err == 'SongAlreadyInPlaylist'){
						MP.makeConfirmModal({
							content: "Song is already in your playlist, would like to move it to the top?",
							callback: function(res){
								if(res) MP.api.playlist.moveSong(pid, id, 'top');
							}
						});
					}
				});

			}
		} else {
			MP.makeCustomModal({
				content: '<div>\
					<h3>Please enter the name of your playlist</h3>\
					<input type="text" class="new-playlist" id="new-playlist"/>\
					</div>',
				dismissable: true,
				buttons: [
					{
						icon: 'mdi-close',
						classes: 'modal-no',
						handler: function(e){
							$('.modal-bg').remove();
						}
					},
					{
						icon: 'mdi-check',
						classes: 'modal-yes',
						handler: function(e){
							var name = $('#new-playlist').val();

							MP.playlistCreate(name, function(err, data){
								if (err) return; //add a alert or another modal here

								MP.playlistAdd(data.id, id, 'top');
								$('.modal-bg').remove();
							});
						}
					}
				]
			});
		}
	});

	$('.playlists-grab').on('click', function(e){
		if (!MP.isLoggedIn()) return;

		var id = API.player.getPlayer().getVideoData()['video_id'];

		if (id == null) return;

		if(!$(e.target).hasClass('pl-grab-create')){
			var pid = e.target.attributes['data-pid'].textContent;
			if (MP.user && pid && id !== false) {
				MP.playlistAdd(pid, id, 'top', function(err, data){
					if(err == 'SongAlreadyInPlaylist'){
						MP.makeConfirmModal({
							content: "Song is already in your playlist, would like to move it to the top?",
							callback: function(res){
								if(res) MP.api.playlist.moveSong(pid, id, 'top');
							}
						});
					}
				});

				MP.vote('grab');
			}
		} else {
			MP.makeCustomModal({
				content: '<div>\
					<h3>Please enter the name of your playlist</h3>\
					<input type="text" class="new-playlist" id="new-playlist"/>\
					</div>',
				dismissable: true,
				buttons: [
					{
						icon: 'mdi-close',
						classes: 'modal-no',
						handler: function(e){
							$('.modal-bg').remove();
						}
					},
					{
						icon: 'mdi-check',
						classes: 'modal-yes',
						handler: function(e){
							var name = $('#new-playlist').val();

							MP.playlistCreate(name, function(err, data){
								if (err) return; //add a alert or another modal here

								MP.playlistAdd(data.id, id, 'top');
								MP.vote('grab');
								$('.modal-bg').remove();
							});
						}
					}
				]
			});
		}
	});

	// Snooze button
	$('.btn-snooze').on('click', function(){
		API.player.snooze();
	});

	// Like button
	$('.btn-upvote').on('click', function(){
		MP.vote('like');
	});

	// Dislike button
	$('.btn-downvote').on('click', function(){
		MP.vote('dislike');
	});

	// Stream toggle button
	$('.btn-stream').on('click',function(){
		MP.toggleVideoStream();
	});

	//Toggle HD
	$('.btn-hd').on('click',function(){
		MP.toggleHighDefinitionQuality();
	});

	//Reset player position
	$('.playback .navbar .draggable').on('contextmenu', function(e){
	    var scope = angular.element($('body')).scope();
  	    scope.roomSettings.playerStyle = '';
  		scope.saveUISettings();
  		$('.playback').attr('style', '');
	    return false;
	});

	// Clickig various places to show login
	$('#msg-in, .labels .uname, .btn-login, .btn-join, .btn-downvote, .btn-upvote, .btn-grab').on('click', function(){
		if (!MP.isLoggedIn()) MP.api.showLogin();
	});

	$('.lib-sng-search .nav').on('click', function(e){
		if ($(this).find('div').html() == 'search') {
			$('#lib-search').trigger({
				type: 'keydown',
				which: 13
			});
		}
	});

	// Used for closing the login view
	$('#creds-back').on('click', function(e){
		if ( !$(e.target).closest('#creds').length )
			MP.api.hideLogin();
	})

	// Login form
	$('#login')
		.on('submit', function(e){
			e.preventDefault();

			var fields = {
				email: $('#l-email'),
				pw: $('#l-password')
			};

			for (var i in fields){
				if (fields[i].val() == ''){
					alert('No fields can be left blank');
					return;
				}
			}
			console.log(fields.email.val());
			if (!/.*@.*\..*/.test(fields.email.val())){ alert("Use email to login, not username"); return; }

			MP.login(fields.email.val(), fields.pw.val(), function(err, data){
				if (err){ return; }
				for (var i in fields){
					fields[i].val('');
				}

				MP.api.hideLogin();
			});
		})
		.on('keydown', function(e){
			if (e.which == 13){
				e.preventDefault();
				$('#login').trigger('submit');
			}
		});
	$('#login .btn-login').on('click', function(e){
		$('#login').trigger('submit');
	});

	// Register form
	$('#register')
		.on('submit', function(e){
			e.preventDefault();

			var fields = {
				email: $('#r-email').val(),
				un: $('#r-username').val(),
				pw: $('#r-password').val(),
                con: $('#r-confirm').val(),
				captcha: (MP.session.isCaptcha ? grecaptcha.getResponse() : null),
			};

			for (var i in fields){
				if (fields[i] == ''){
					alert('No fields can be left blank');
					return;
				}
			}

            if(fields.pw !== fields.con) {
                alert('Passwords don\'t match');
                return;
            }

			MP.signup(fields.email, fields.un, fields.pw, fields.captcha, function(err, data){
				if (err) return;
				MP.api.hideLogin();
			});
		})
		.on('keydown', function(e){
			if (e.which == 13){
				e.preventDefault();
				$('#register').trigger('submit');
			}
		});
	// Submitting form on button click
	$('#register div.ctrl').on('click', function(e){
		$('#register').trigger('submit');
	});

	//Forgot password form
	$('.btn-fgt-pw').on('click', function(){
		MP.api.hideLogin();
		MP.makeCustomModal({
			content: '<h3>You are about to request a password reset.</h3>\
					 <div type="text">Please specify the email you registered with.</div>\
			         <form id="frm-fgt-pw">\
				         <input id="inp-fgt-pw" name="email" type="text" autofocus="" placeholder="E-mail">\
				         <input id="inp-rc" name="code" type="text" autofocus="" placeholder="Recovery Code">\
				         <input id="inp-new-pw" name="newpass" type="password" autofocus="" placeholder="New Password">\
				         <div class="fill">Fill in email only if you did not receive recovery email yet.</div>\
			         </form>',
			dismissable: false,
			buttons: [
				{
					icon: 'mdi-close',
					classes: 'modal-no',
					handler: function(){
						$('.modal-bg').remove();
					},
				},
				{
					icon: 'mdi-check',
					classes: 'modal-yes',
					handler: function(){
						//Get all fields
						var fields = $('#frm-fgt-pw').serializeObject();

						//Remove empty fields
						for(var k in fields){
							if(k == '') fields[k] = null;
						}

						//Hash new password
						if(fields.newpass) fields.newpass = CryptoJS.SHA256(fields.newpass).toString();

						//Build and send socket request
						var obj = {
							type: 'recovery',
							data: fields,
						};
						obj.id = MP.addCallback(obj.type, function(err, data){
							if(err) {
								var errs = ['UserDoesNotExist', 'AwaitingRecovery', 'EmailAuthIssue', 'WrongRecoveryCode', 'RecoveryDisabled'];
								var errmsgs = ['User with specified email does not exist', 'There is a recovery email already pending', 'There was an error with sending recovery email, please contact the pad owner', 'The recovery code you sent was invalid, please make sure you copied the code exactly as it is from your email', 'Password recovery is disabled'];
								MP.makeAlertModal({
									content: errmsgs[errs.indexOf(err)],
								});
							} else {
								MP.makeAlertModal({
									content: fields.code ? 'Recovery successful, you can now log in with your new password' : 'A recovery email was sent to specified email address, please follow the instructions to reset your email',
								});
							}
						});
						socket.sendJSON(obj);
					},
				},
			],
		});
	});

	//Sidebar
	$('.btn-logo').on('click', function(){
		MP.historyList.filter = "";
		MP.applyModels();

		$('.logo-menu').toggleClass('logo-menu-expanded');
	});

	$('.logo-btn-history').on('click', function() {
		MP.historyList.filter = "";
		MP.applyModels();
	});

	//Staff list
	$('.btn-staff').on('click', function(){
		if (!MP.session.roomStaff.length) {
			MP.getRoomStaff();
		}
	});

	//Banned users list
	$('.btn-banned').on('click', function(){
		if (!MP.session.bannedUsers.length) {
			MP.getBannedUsers();
		}
	});

	//Playlist shuffle
	$('.btn-shuffle-playlist').on('click', function(){
		if (!MP.session.viewedPl) return;

		if (!MP.user.playlists[ MP.session.viewedPl ]) return;

		MP.makeConfirmModal({
			content: 'Are you sure want to shuffle playlist ' + $('<b></b>').text(MP.user.playlists[ MP.session.viewedPl ].name).prop('outerHTML'),
			callback: function(res){
				if (res) MP.api.playlist.shuffle();
			}
		});

	});

	//Playlist export
	$('.btn-export-playlist').on('click', function(){
		if (!MP.session.viewedPl) return;
		if (!MP.user.playlists[ MP.session.viewedPl ]) return;
		API.playlist.export();
	});

	//Switch between video and chat
	$('.btn-video').on('click', function(){
		$('#app-left').css('z-index','10');
		$('#app-right').css('z-index','9');
	});

	/* Video frame elements */
	//Fullscreen
	$('.btn-fullscreen').on('click', function(){
		API.fullscreen();

		var settings = JSON.parse(localStorage.getItem("settings"));
		settings.player.fullscreen = !settings.player.fullscreen;
		localStorage.setItem("settings", JSON.stringify(settings));
	});

	//Volume control
	$('.rng-volume').on('mousemove', function(){
		var vol = Math.max(0, Math.min($('.volume').val(), 100));
		if (vol == API.player.getPlayer().getVolume()){
			return;
		}

		API.player.setVolume(vol);
	});

	$('.volume').bind('mousewheel DOMMouseScroll', function(event){
		var that = $('.volume');
	    if (event.originalEvent.wheelDelta > 0 || event.originalEvent.detail < 0) {
	    	that.val(Math.min(100, Number(that.val()) + 2));
	        API.player.setVolume(API.player.getPlayer().getVolume() + 2);
	    }
	    else {
	    	that.val(Math.max(0, Number(that.val()) - 2));
	        API.player.setVolume(API.player.getPlayer().getVolume() - 2);
	    }
	});

	$('.btn-volume div').on('click', function(){
		var settings = JSON.parse(localStorage.getItem("settings"));

		API.player.setMute(!settings.player.mute);
	});

	//Open video in new tab / window
	$('.btn-youtube').click(function(){
		if (MP.api.room.getMedia())
			window.open('https://youtu.be/' + MP.api.room.getMedia().cid, '_blank');
	});

	//Refresh video
	$('.btn-refresh').click(function(){
		var curTime = Date.now();
		MP.getCurrentVideoTime(function(err, data){
			API.seekTo = ((Date.now() - curTime) / 1000) + data.time;
			API.player.refresh();
		});
	});

	/* Right side bar tabs */
	$('.btn-chat, .btn-people, .btn-waitlist').on('click', function(){
		$('#app-right').css('z-index','10');
		$('#app-left').css('z-index','9');
	});

	/* Utility buttons */
	//Logout
	$('.logo-btn-logout').on('click', function(){
		MP.makeConfirmModal({
			content: 'Are you sure you want to log out?',
			dismissable: true,
			callback: function(res){
				if (res) {
					MP.logout(function(){
						if ($('div.logo-menu').is(':visible'))
						$('div.ico-logo').click();
						$('.btn-grab.active, .btn-upvote.active, .btn-downvote.active').removeClass('active');
					});
				}
			}
		});
	});

	//Tour
	$('.logo-btn-tour').on('click', function(){
		API.tour.start();
	});

	$('.settings-timestamp').on('click', function(e) {
		$('.settings-timestamp').removeClass('active');
		$(this).addClass('active');
	});

	/* Window focus */
	$(window).on('focus', function(){
		MP.session.hasfocus = true;
		if (MP.session.oldPageTitle)
			document.title = MP.session.oldPageTitle;
	});

	$(window).on('blur', function(){
		MP.session.hasfocus = false;
	});

	/* Window resizing */
	$(window).one('load', function(){
		MP.session.oldPageTitle = document.title;
    var win = $(this);
    var settings = JSON.parse(localStorage.getItem("settings"));

		if (settings.player.stream && win.width() < 800) {
			API.chat.log('<br>Your screen is too small to display the video, use /stream to disable it','Tips');
		}
	  if (win.width() < 1366) {
	  	($('.playback').hasClass('fullscreen')) ? null : API.fullscreen();
	  }
		else {
	  	(settings.player.fullscreen && !$('.playback').hasClass('fullscreen')) ? API.fullscreen() : null;
	  }
		$('.loader, .loading').fadeOut(1000);
		$('.load').css('transform', 'translateY(-100%)');
	});
	
	$(window).on('resize', function(){
		$('.user-menu').hide();
	    var win = $(this);
	    var settings = JSON.parse(localStorage.getItem("settings"));

	    if (win.width() < 1366) {
	    	($('.playback').hasClass('fullscreen')) ? null : API.fullscreen();
	   	}
	   	if (win.width() >= 1366) {
			var fs = settings.player.fullscreen;
			var pbfs = $('.playback').hasClass('fullscreen');

	    	( fs && !pbfs || !fs && pbfs) ? API.fullscreen() : null;
	   	}
	   	if (win.width() >= 1051) {
	    	$('#app-right').css('z-index','10');
	    	$('#app-left').css('z-index','10');
	   	}
	});

	if (window.angular){

		var ajsApp = angular.module('musiqpad', ['minicolors']);

		ajsApp.filter('orderByPlaylist', function() {
			return function(items, field, reverse) {
			    var filtered = [];
			    for (var i in items){
			    	items[i].id = i;
			    	filtered.push(items[i]);
			    }
			    filtered.sort(function (a, b) {
			    	return (a[field].localeCompare(b[field]));
			    });
			    if(reverse) filtered.reverse();
			    return filtered;
			};
		});

		ajsApp.filter('orderByRole', function() {
			return function(items, field, reverse) {
			    var filtered = [];
			    for (var j in MP.session.roleOrder){
			    	var temp = [];

				    for (var i in items){
				    	items[i].id = i;

				    	if (items[i].role == MP.session.roleOrder[j])
				    		temp.push(items[i]);
				    }
				    temp.sort(function (a, b) {
				    	return (a[field].localeCompare(b[field]));
				    });

				    filtered = filtered.concat(temp);
			    }

			    if(reverse) filtered.reverse();
			    return filtered;
			};
		});

		ajsApp.filter('to_trusted', ['$sce', function($sce){
	        return function(text) {
	            return $sce.trustAsHtml(text);
	        };
	    }]);

		ajsApp.controller('MainController', function($scope) {
			$scope.prop = {
				t: 1,			// Logo menu
				c: 1, 			// Right view (Chat, Waitlist, Userlist)
				p: 1,			// People tabs inside of Userlist
				ci: 1,          // Chat list internal
				chatScroll: 0,	// Chat scroll memory
				leaveAfterPlay: false,
			};


			$scope.activepm = null;

			$scope.getPMUnread = function() {
				var total = 0;
				for (var i in MP.pms) {
					total += MP.pms[i].unread;
				}
				return total;
			};

			$scope.pmFuncs = {
				setPM: function(pmGroup) {
					$scope.activepm = pmGroup;
					if (pmGroup && !pmGroup.__init) {
						MP.api.chat.getPrivateConversation(pmGroup.user.uid, function(data) {
							if (data) {
								MP.pms[pmGroup.user.un].messages = data.messages;
								MP.pms[pmGroup.user.un].__init = true;
								if (MP.pms[pmGroup.user.un].unread > 0) {
									MP.markConversationRead(pmGroup.user.uid, Date.now());
									MP.pms[pmGroup.user.un].unread = 0;
								}
								MP.applyModels();
								var $chat = $('#pm-chat');
								$chat.scrollTop( $chat[0].scrollHeight );
							}
						});
					}
					else if (pmGroup) {
						if (pmGroup.unread > 0) {
							MP.markConversationRead(pmGroup.user.uid, Date.now());
							MP.pms[pmGroup.user.un].unread = 0;
							MP.applyModels();
						}
					}
				},
				getPMGroupInfo: function(pmGroup) {
					if (!pmGroup) return { lastPM: { time: null } };
					var returnObj = {
						lastPM: null,
						unreadCount: pmGroup.unread ? pmGroup.unread : 0
					};
					if (pmGroup.messages.length > 0) {
						returnObj.lastPM = pmGroup.messages[pmGroup.messages.length - 1];
					}

					return returnObj;
				},
				changeToPMTab: function() {
					$scope.prop.ci = 2;
					if ($scope.activepm != null && $scope.activepm.unread > 0) {
						MP.markConversationRead($scope.activepm.user.uid);
						MP.pms[$scope.activepm.user.un].unread = 0;
						MP.applyModels();
					}
				},
				makeMessageTime: function(time) {
					if (time) {
						if (Number(time) || typeof(time) === "string") {
							time = new Date(time);
						}
						return MP.makeTime(time);
					}
					return "";
				},
				getOrderedPMs: function() {
					var out = [];
					for (var i in MP.pms) {
						if ($scope.pmFuncs.getPMGroupInfo(MP.pms[i]).lastPM.time != null) {
							out.push(MP.pms[i]);
						}
					}
					out.sort(function(a,b){
						return (new Date($scope.pmFuncs.getPMGroupInfo(b).lastPM.time).getTime()) - (new Date($scope.pmFuncs.getPMGroupInfo(a).lastPM.time).getTime());
					});
					return out;
				}
			};

			$scope.filterChat = function(type) {
				type = (type ? type : '').toLowerCase();
				MP.api.chat.filter = type;
				for (var i in MP.api.chat.filterTypes) {
					MP.api.chat.filterTypes[i]().show();
				}
				if (MP.api.chat.filterTypes[type]) {
					MP.api.chat.filterTypes[type]().hide();
				}
				MP.api.chat.scrollBottom();
			};

			$scope.activeFilter = 0;
			$scope.setFilter = function(index) {
				if ($scope.filters[index]) {
					$scope.activeFilter = index;
					$scope.filterChat($scope.filters[index].filterType);
					$scope.prop.ci = 3;
				}
			}
			$scope.filters = [
				{
					name: 'Mentions',
					filterType: 'mentions',
					onclick: '',
					text: '@',
					show: function() { return true; },
					index: 0
				},
				{
					name: 'Staff Chat',
					filterType: 'staff',
					onclick: '',
					classes: 'mdi mdi-account-key',
					show: function() { return $scope.checkPerm('chat.staff'); },
					index: 1
				},
				{
					name: 'Media',
					filterType: 'media',
					onclick: '',
					classes: 'mdi mdi-image',
					show: function() { return true },
					index: 2
				}
			]

			$scope.customSettings = {
    			theme: 'bootstrap',
  				position: 'bottom left',
  				defaultValue: '',
  				animationSpeed: 50,
  				animationEasing: 'swing',
  				change: null,
  				changeDelay: 0,
  				control: 'hue',
  				hide: null,
  				hideSpeed: 100,
  				inline: false,
  				letterCase: 'lowercase',
  				opacity: false,
  				show: null,
  				showSpeed: 100
  			};

			$scope.userSettings = {
				newUserName: '',
				newBadgeTop: '',
				newBadgeBottom: ''
			};

			$scope.roomSettings = {
                enableEmojis: true,
				emojis: {
					basic: true,
					twitch: true,
					tastycat: true,
					betterttv: true,
				},
				playerStyle: '',
				chatTimestampFormat: API.DATA.CHAT.TSFORMAT.HR24,
				showImages: false,
				leaveConfirmation: false,
				chatlimit: 512,
				library: {
					thumbnails: false,
				},
                shortcuts: true,
                notifications: {
                	chat: {
                		advance_last: false,
                		advance_next: false,
                		join: false,
                		leave: false,
                		like: false,
                		grab: false,
                        chat: false,
						pm: false,
                	},
                	desktop: {
                		advance_last: false,
                		advance_next: false,
                		join: false,
                		leave: false,
                		mention: false,
                		broadcast: false,
                		global: false,
                		like: false,
                		grab: false,
                        chat: false,
						pm: false,
						showfocused: true,
                	},
                	sound: {
                		advance_last: false,
                		advance_next: false,
                		join: false,
                		leave: false,
                		mention: true,
                		broadcast: true,
                		global: true,
                		like: false,
                		grab: false,
                        chat: false,
						pm: true,
                	},
                },
                separateUserCount: true,
                altControls: false,
			};

			$scope.changeTab = function(inProp, val){
				if (typeof $scope.prop[inProp] === 'undefined') return;
				var curVal = $scope.prop[inProp];

				// Leaving chat tab
				if (inProp == 'c' && curVal == 1 && val != 1){
					$scope.prop.chatScroll = MP.api.chat.getPos();
				}


				$scope.prop[inProp] = val;

				if (inProp == 'c'){

					// Entering chat tab
					if (val == 1){

						// If they were at the bottom of the chat tab before, they'll be at the bottom when they come back
						if ($scope.prop.chatScroll >= 0){
							$scope.prop.chatScroll = 0;

							// Using setTimeout to give Angular the time to update.  CAN'T scroll while tab is not visible.
							setTimeout(function(){MP.api.chat.scrollBottom()}, 3);
						}
					}
				}
			};

			$scope.makeUsernameStyle = function(uid){
				var user = MP.findUser(uid);
				if (!user) return MP.makeUsernameStyle('default');

				return MP.makeUsernameStyle(user.role);
			};

			$scope.makeUsernameStyleByRole = function(role){
				if (!role) return MP.makeUsernameStyle('default');

				return MP.makeUsernameStyle(role);
			};

			$scope.checkPerm = MP.checkPerm;

			$scope.checkDeskNotifPerm = function(){
                if (typeof Notification === 'undefined') {
                    return false;
                }
                Notification.requestPermission(function(perm){
                	if(perm != "granted"){
                		var perms = $scope.roomSettings.notifications.desktop;
                		for(var key in perms)
                			perms[key] = false;
                		$scope.$apply();
                	}
                });
			};

			$scope.makeTime = function(inTime, dur){
				var h = Math.floor(inTime / 3600);
				var m = Math.floor(inTime / 60) % 60;
				var s = inTime % 60;

				return (h + m + s || dur) ? (h > 0 ? h + ':' : '') + ( '0' + m ).slice(-2) + ':' + ( '0' + s ).slice(-2) : 'LIVE';
			};
			$scope.makeTimeElapsed = function(inTime){
				var diff = MP.timeConvert(new Date().getTime(), inTime + MP.session.serverDateDiff);

				if (diff.years > 0)	return diff.years + ' years ago';
				if (diff.months > 0)	return diff.months + ' months ago';
				if (diff.days > 0)	return diff.days + ' days ago';
				if (diff.hours > 0)	return diff.hours + ' hours ago';
				if (diff.minutes > 0)	return diff.minutes + ' minutes ago';
				return diff.seconds + ' seconds ago';
			};
			$scope.findPosInWaitlist = function(uid){
				return MP.findPosInWaitlist(uid);
			};

			$scope.inHistory = function(cid){
				if(!MP.historyList.historyInitialized) return false;
				for(var k in MP.historyList.history)
					if(MP.historyList.history[k].song.cid == cid) return true;
				return false;
			};

			$scope.filteredHistory = function(h, filterBy) {
				try{
					return !(filterBy = filterBy.toLowerCase()) || h.song.title.toLowerCase().indexOf(filterBy) > -1 || h.song.cid.toLowerCase().indexOf(filterBy) > -1 || h.user.un.toLowerCase().indexOf(filterBy) > -1;
				} catch(e){
					return true;
				}
			};

			$scope.makeBadgeStyle = function(opts){
				return MP.makeBadgeStyle(opts);
			};

			$scope.makeUsernameStyle = function(uid){
				var user = MP.findUser(uid);
				if (!user) return MP.makeUsernameStyle('default');

				return MP.makeUsernameStyle(user.role);
			};

			$scope.emojiReplace = function(text) {
                if (text) {
                    return MP.emojiReplace(text);
                }
                return "";
            };

			$scope.getRole = function(role){
				if (MP.getRole(role))
					return MP.getRole(role);

				return {};
			};

			$scope.isBlocked = function(uid) {
				return MP.api.user.isBlocked(uid);
			};

			$scope.$watch('roomSettings', function (newVal, oldVal) { $scope.saveUISettings() }, true);
			//$scope.$watch('userSettings', function (newVal, oldVal) { $scope.saveSettings() }, true);

			$scope.saveUISettings = function() {
				$(window).unbind('beforeunload', MP.leaveConfirmation);
				if ($scope.roomSettings.leaveConfirmation && MP.findPosInWaitlist() != -1){
					$(window).bind('beforeunload', MP.leaveConfirmation);
				}

				var settings = JSON.parse(localStorage.getItem("settings"));
				settings.roomSettings = $scope.roomSettings;
				localStorage.setItem("settings", JSON.stringify(settings));
			};

			$scope.saveSettings = function() {
				$scope.user.badge.top = $('#badge-top-color-input').val() || $scope.user.badge.top;
				$scope.user.badge.bottom = $('#badge-bottom-color-input').val() || $scope.user.badge.bottom;
				MP.updateBadge($scope.user.badge);
				$('#badge-top-color-input').val('');
				$('#badge-bottom-color-input').val('');
				if ($scope.userSettings.newUserName != '' && $scope.userSettings.newUserName.toString().toLowerCase() != $scope.user.un.toString().toLowerCase()) {
					// send name change request
					// on success callback reset newUserName
					$scope.userSettings.newUserName = '';
				}
			};

			var settings = JSON.parse(localStorage.getItem("settings"));
			if (settings) {
				if (settings.roomSettings == undefined || settings.roomSettings == null) {
					settings.roomSettings = $scope.roomSettings;
					localStorage.setItem("settings", JSON.stringify(settings));
				} else {
					$.extend(true, $scope.roomSettings, settings.roomSettings);

					if (settings.roomSettings.leaveConfirmation){
						$(window).bind('beforeunload', MP.leaveConfirmation);
					}
					if ($scope.roomSettings.playerStyle != "") {
						$('.playback').attr('style', $scope.roomSettings.playerStyle);
					}
				}
			}
		});
	}

/*

})();

//Loading
(function() {
*/	var startLoad = 0;

	var loadingText = [
		"Turning up the music...",
		"Looking for a spot...",
		"Spinning vinyl discs...",
		"Breaking the matrix...",
		"Warming up...",
		"Nice meme...",
		"Hiding the hamsters..."
	];

	//Loading animation start
	var interval = setInterval(function(){
		$(".loading").fadeOut(function() {
		  $('.loading').text(loadingText[Math.floor(Math.random() * loadingText.length)]);
		}).fadeIn();
	}, 2000);

	//LocalStorage check
	if(!localStorage.getItem("settings")){
		localStorage.setItem("settings", JSON.stringify({
			player: {
				volume: 50,
				mute: false,
				quality: API.DATA.PLAYER.QUALITY.HD720,
				fullscreen: false,
				stream: true
			},
			chat: {
				//timestamp:
			},
		}));
	}

	//Lightbox options
	/*lightbox.option({
		fadeDuration: 150,
		albumLabel: '',
		showImageNumberLabel: false,
	});*/

	MP.getTokenName = function() {
		if (config.selfHosted && location.host.indexOf('musiqpad.com') != -1) {
			if (MP.session.roomInfo.slug) {
				return MP.session.roomInfo.slug + '-token';
			}
			else {
				var urlParams = (location.pathname + '').split('/');
  				var i = urlParams.indexOf('p');
  				if (urlParams.length >= (i + 2)) {
    				var roomSlug = decodeURIComponent(urlParams[i + 1]);
    				return roomSlug + '-token';
  				}
			}
			return null;
		}
		else {
			return 'token';
		}
	};

	//Successful connection to the socket
	MP.onConnect = function(){
		var tok = MP.cookie.getCookie(MP.getTokenName());

		var onLoad = function(){
			MP.joinRoom(function(err, data){
				if (err){
					return;
				}

				if(!MP.historyList.historyInitialized) {
					MP.getHistory();
				}

				if (MP.session.roomInfo.bg) { $('#room-bg').css('background-image', 'url('+ MP.session.roomInfo.bg +')'); }
				$('title').text(data.room.name);
				$('.modal-bg').remove();

				var $chat = $('#chat');
				MP.loadEmoji(false, function(){
					//Remove all current DJ badges and show real badges
					var elem = $('#messages .cm.message');
					elem.find('.bdg-icon-dj').remove();
					elem.find('.bdg:hidden').attr('class', 'bdg');

					//Render last chat
					for(var i in data.lastChat){
						if (data.lastChat[i].user.un && !MP.seenUsers[data.lastChat[i].user.uid]) MP.seenUsers[data.lastChat[i].user.uid] = data.lastChat[i].user;

						MP.addMessage({
							message: data.lastChat[i].message,
							uid: data.lastChat[i].user.uid,
							cid: data.lastChat[i].cid,
							time: data.lastChat[i].time
						});
					}

					//Render welcome message
					$('#messages').append(
						'<div class="cm room-greet">' +
						'<div class="mdi mdi-send msg" style="color:#A77DC2"></div>' +
						'<div class="text">' +
						'<span class="greet-uname">' + MP.emojiReplace(MP.session.roomInfo.name) + '</span>' +
						'<br><span class="greet-umsg">' + MP.emojiReplace(MP.session.roomInfo.greet) + '</span></div></div></div>'
					);

					// Waits for the append to DOM to go through, then scrolls to bottom
					setTimeout(function(){
						MP.api.chat.scrollBottom();
					}, 3);
				});
				$chat.scrollTop($chat[0].scrollHeight);

				var playerSettings = JSON.parse(localStorage.settings).player;

				if (typeof API.player.getPlayer === 'function'){
					if (data.queue.currentsong && playerSettings.stream){
						API.player.getPlayer().loadVideoById(data.queue.currentsong.cid);
						if(data.queue.time) API.player.getPlayer().seekTo(data.queue.time);
						API.player.getPlayer().setVolume(playerSettings.mute ? 0 : playerSettings.volume);
					}else{
						API.player.getPlayer().loadVideoById(null);
					}
					console.log('returned');
					return;
				}

				//Bind escape button
				$(document).on('keydown', function(e){
					if (e.which == 27){
						$('div.ico-logo').click();
					}
				});

				//Get player ready
				YT.ready(function(){
					var isFirstVideo = 1;
					var player = new YT.Player('player', {
						height: '390',
						width: '640',
						videoId: (playerSettings.stream && data.queue.currentsong) ? data.queue.currentsong.cid : null,
						playerVars: {
							controls: 0,       //Disable controls
							iv_load_policy: 3, //Disable annotations
							showinfo: 0,       //Disable video info
							autoplay: 1,	   //Enable autoplay
							fs: 0,             //Disable fullscreen
							rel: 0,            //Disable showing related videos
							disablekb: 1,      //Disable keyboard
						},
						events: {
							'onReady': function(){
								if (playerSettings.stream && player.getPlayerState() == -1)
									MP.videoNotAvailable();
								setTimeout(function () {
									$(window).load();
								}, 1000);
								clearInterval(interval);
								API.player.getPlayer = function(){
									return player;
								};

								var vol = playerSettings.volume;

								if (playerSettings.hd){
									API.player.getPlayer().setPlaybackQuality('hd720');
									$('.btn-hd div').addClass('active');
								}

								if(data.queue.time) API.player.getPlayer().seekTo(data.queue.time);

								var voldiv = $('.volume');

								if (!playerSettings.mute){
									API.player.setVolume(vol);

									if(vol == 0){
										voldiv.text("volume_off");
									} else if (vol <= 25) {
										voldiv.text("volume_mute");
									} else if (vol >= 75) {
										voldiv.text("volume_up");
									} else {
										voldiv.text("volume_down");
									}

									voldiv.val(vol);
								}else{
									API.player.setMute(true);
								}
							},
							'onStateChange': function(e){
								if (e.data == YT.PlayerState.PAUSED) API.player.getPlayer().playVideo();
								if (e.data == YT.PlayerState.ENDED || e.data == YT.PlayerState.UNSTARTED) $('#player').hide();
								if ((e.data == YT.PlayerState.CUED || e.data == YT.PlayerState.PLAYING ) && !MP.session.snooze) $('#player').show();

								// Duration of video loaded: duration * API.player.getPlayer().getVideoLoadedFraction()
								if (e.data == YT.PlayerState.BUFFERING && startLoad != -1){
									startLoad = Date.now();
								}else{
									startLoad = 0;
								}

								if (e.data == YT.PlayerState.PLAYING && startLoad > 0) {
									var loaded = API.player.getPlayer().getDuration() * API.player.getPlayer().getVideoLoadedFraction();
									var curTime = API.player.getPlayer().getCurrentTime();
									var adjustment = ((Date.now() - startLoad)/1000);

									if ( (curTime + adjustment) > loaded ){
										//startLoad = -1;
										API.player.getPlayer().seekTo( loaded );
									}else{
										API.player.getPlayer().seekTo( curTime + adjustment );
									}

									startLoad = 0;
								}

							},
							'onError': function (e) {
								if(e.data == 150 && MP.models.songDuration != 5) {
									MP.videoNotAvailable()
								}
							}
						}
					});
				});
			});
		};

		if (tok != ''){
			console.log('Logging in with token');
			MP.loginWithTok(tok, function(err, data){
				onLoad();
				if (err){ console.log('Token is invalid.'); return;}
			});
		}else{

			onLoad();
		}
	};
})();

document.head = document.head || document.getElementsByTagName('head')[0];
$('.settings .set-check').children().each(function(){ $(this).after($('<label for="' + $(this).attr('id') + '"></label>')); })

$.fn.incVal = function(val) {
    var n = typeof val !== 'undefined' ? val : 1;
    var old = parseInt(this.val());
    this.val(old + n);
};

$.fn.fadeIncVal = function(val) {
    var $this = this;
    if($this.val() < val) {
    	this.incVal();
    	setTimeout(function(){ $this.fadeIncVal(val); }, 10);
    }
};

(function(d, s, id){
	var js, fjs = d.getElementsByTagName(s)[0];
	if (d.getElementById(id)) {return;}
	js = d.createElement(s); js.id = id;
	js.src = "//connect.facebook.net/en_US/sdk.js";
	fjs.parentNode.insertBefore(js, fjs);
}(document, 'script', 'facebook-jssdk'));

window.fbAsyncInit = function() {
	FB.init({
		appId      : '472932736241651',
		cookie     : true,
		xfbml      : true,
		version    : 'v2.5'
	});
};

function testAPI() {
	FB.api('/me', function(response) {
		console.log(response);
	});
}

/*$('.playback').draggable({
	containment: "parent",
	handle: ".draggable",
	drag: function( event, ui ) {
	    ui.position.left = Math.max( 427, ui.position.left );
	    ui.position.top = Math.max( 260, ui.position.top );
  	},
  	stop: function( event, ui ) {
  		var scope = angular.element($('body')).scope();
  		scope.roomSettings.playerStyle = $('.playback').attr('style');
  		scope.saveUISettings();
  	}
});*/

$.fn.serializeObject = function()
{
    var o = {};
    var a = this.serializeArray();
    $.each(a, function() {
        if (o[this.name] !== undefined) {
            if (!o[this.name].push) {
                o[this.name] = [o[this.name]];
            }
            o[this.name].push(this.value || '');
        } else {
            o[this.name] = this.value || '';
        }
    });
    return o;
};
