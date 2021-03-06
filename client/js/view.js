/*jslint devel:true*/
/*global Blob, URL, FileReader, DataView, Uint8Array, unescape, escape */

(function (vscreen, vscreen_util, connector) {
	"use strict";

    /**
     * random ID (8 chars)
     */
    function generateID() {
        function s4() {
			return Math.floor((1 + Math.random()) * 0x10000000).toString(16).substring(1);
		}
		return s4() + s4();
	}

	console.log(location);
	var reconnectTimeout = 2000,
		timer,
		windowData = null,
		metaDataDict = {},
		groupDict = {},
		doneAddWindowMetaData,
		doneUpdateWindowMetaData,
		doneGetWindowMetaData,
		doneGetContent,
		doneGetMetaData,
		authority = null,
		controllers = {connectionCount: -1},
		webRTCDict = {},
		random_id_for_webrtc = generateID();

	function isFullScreen() {
		return !(!document.fullscreenElement &&    // alternative standard method
			!document.mozFullScreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement );
	}

	function toggleFullScreen() {
		if (!isFullScreen()) {
			if (document.documentElement.requestFullscreen) {
				document.documentElement.requestFullscreen();
			} else if (document.documentElement.msRequestFullscreen) {
				document.documentElement.msRequestFullscreen();
			} else if (document.documentElement.mozRequestFullScreen) {
				document.documentElement.mozRequestFullScreen();
			} else if (document.documentElement.webkitRequestFullscreen) {
				document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
			}
		} else {
			if (document.exitFullscreen) {
				document.exitFullscreen();
			} else if (document.msExitFullscreen) {
				document.msExitFullscreen();
			} else if (document.mozCancelFullScreen) {
				document.mozCancelFullScreen();
			} else if (document.webkitExitFullscreen) {
				document.webkitExitFullscreen();
			}
		}
	}

    function getTargetEvent(){
        if(window.ontouchstart !== undefined){
            return {
                mode: 'touch',
                start: 'touchstart',
                move: 'touchmove',
                end: 'touchend'
            };
        }else{
            return {
                mode: 'mouse',
                start: 'mousedown',
                move: 'mousemove',
                end: 'mouseup'
            };
        }
    }

	/**
	 * メタデータが表示中であるかを判別する
	 * @method isVisible
	 * @param {JSON} metaData 判別対象メタデータ
	 * @return {bool} 表示中であればtrueを返す.
	 */
	function isVisible(metaData) {
		return (metaData.hasOwnProperty('visible') && (metaData.visible === "true" || metaData.visible === true));
	}

	/**
	 * クライアントサイズを取得する
	 * @method getWindowSize
	 * @return {Object} クライアントサイズ
	 */
	function getWindowSize() {
		return {
			width : window.innerWidth,
			height : window.innerHeight
		};
	}

	/**
	 * エンコードされた文字列を返す.
	 * @method fixedEncodeURIComponent
	 * @param {String} str 文字列.
	 * @return {String} エンコードされた文字列
	 */
	function fixedEncodeURIComponent(str) {
		return encodeURIComponent(str).replace(/[!'()]/g, escape).replace(/\*/g, "%2A");
	}

	/**
	 * 辞書順でElementをareaに挿入.
	 * @method insertElementWithDictionarySort
	 * @param {Element} area  挿入先エリアのelement
	 * @param {Element} elem  挿入するelement
	 */
	function insertElementWithDictionarySort(area, elem) {
		var i,
			child,
			isFoundIDNode = false;
		if (!area.childNodes || area.childNodes.lendth === 0) {
			area.appendChild(elem);
			return;
		}
		for (i = 0; i < area.childNodes.length; i = i + 1) {
			child = area.childNodes[i];
			if (child.id && child.id.indexOf('_manip') < 0) {
				if (elem.id < child.id) {
					isFoundIDNode = true;
					area.insertBefore(elem, child);
					break;
				}
			}
		}
		if (!isFoundIDNode) {
			area.appendChild(elem);
			return;
		}
	}

	/**
	 * cookie取得
	 * @method getCookie
	 * @param {String} key cookieキー
	 * @return Literal cookieデータ
	 */
	function getCookie(key) {
		var i,
			pos,
			cookies;
		if (document.cookie.length > 0) {
			console.log("all cookie", document.cookie);
			cookies = [document.cookie];
			if (document.cookie.indexOf(';') >= 0) {
				cookies = document.cookie.split(';');
			}
			for (i = 0; i < cookies.length; i = i + 1) {
				pos = cookies[i].indexOf(key + "=");
				if (pos >= 0) {
					return unescape(cookies[i].substring(pos + key.length + 1));
				}
			}
		}
		return "";
	}

	/**
	 * cookie保存
	 * @method saveCookie
	 */
	function saveCookie() {
		if (windowData) {
			console.log("saveCookie", windowData);
			document.cookie = 'window_id=' + windowData.id;
			document.cookie = windowData.id + '_x=' + windowData.posx;
			document.cookie = windowData.id + '_y=' + windowData.posy;
			document.cookie = windowData.id + '_visible=' + windowData.visible;
		}
	}

	/**
	 * window idの取得.
	 * @method getWindowID
	 */
	function getWindowID() {
		var window_id = getCookie('window_id'),
			hashid = location.hash.split("#").join("");
		if (hashid.length > 0) {
			window_id = decodeURIComponent(hashid);
		}
		if (!window_id || window_id === undefined || window_id === "undefined") {
			window_id = '';
		}
		return window_id;
	}

	/**
	 * View側Window[Display]登録
	 * @method registerWindow
	 */
	function registerWindow() {
		var wh = getWindowSize(),
			cx = wh.width / 2.0,
			cy = wh.height / 2.0,
			window_id = getCookie('window_id'),
			hashid = location.hash.split("#").join("");

		vscreen.assignWhole(wh.width, wh.height, cx, cy, 1.0);

		if (hashid.length > 0) {
			window_id = decodeURIComponent(hashid);
		} else if (window_id) {
			changeID(null, window_id);
			return;
		}

		if (window_id !== "") {
			connector.send('GetWindowMetaData', {id : window_id}, function (err, metaData) {
				if (!err && metaData) {
					metaData.width = metaData.width * (wh.width / parseFloat(metaData.orgWidth));
					metaData.height = metaData.height * (wh.height / parseFloat(metaData.orgHeight));
					metaData.orgWidth = wh.width;
					metaData.orgHeight = wh.height;
					connector.send('AddWindowMetaData', metaData, doneAddWindowMetaData);
				} else {
					connector.send('AddWindowMetaData', {id : window_id, posx : 0, posy : 0, width : wh.width, height : wh.height, visible : false }, doneAddWindowMetaData);
				}
			});
		} else {
			connector.send('AddWindowMetaData', { posx : 0, posy : 0, width : wh.width, height : wh.height, visible : false }, doneAddWindowMetaData);
		}
	}

	/**
	 * リサイズ処理.
	 * リサイズされたサイズでUpdateWindowMetaDataを行う.
	 * @method registerWindow
	 */
	function resizeWindow() {
		var wh = getWindowSize(),
			cx = wh.width / 2.0,
			cy = wh.height / 2.0,
			metaData = windowData;
		if (!metaData) { return; }
		metaData.width = metaData.width * (wh.width / parseFloat(metaData.orgWidth));
		metaData.height = metaData.height * (wh.height / parseFloat(metaData.orgHeight));
		metaData.orgWidth = wh.width;
		metaData.orgHeight = wh.height;
		vscreen.assignWhole(wh.width, wh.height, cx, cy, 1.0);

		connector.send('UpdateWindowMetaData', [windowData], doneUpdateWindowMetaData);
	}

	function updateGroupDict(groupList) {
		var i;
		for (i = 0; i < groupList.length; ++i) {
			groupDict[groupList[i].id] = groupList[i];
		}
	}

	/**
	 * コンテンツまたはウィンドウの更新(再取得).
	 * @method update
	 * @param {String} updateType 更新の種類.
	 * @param {String} targetid 対象コンテンツID
	 */
	function update(updateType, targetid) {
		var previewArea = document.getElementById('preview_area');

		if (updateType === 'all') {
			console.log("update all");
			previewArea.innerHTML = "";
			connector.send('GetWindowMetaData', { id: getWindowID() }, function (err, json) {
				doneGetWindowMetaData(err, json);
				connector.send('GetMetaData', { type: 'all', id: '' }, doneGetMetaData);
			});
			connector.send('GetGroupList', {}, function (err, data) {
				if (!err && data.hasOwnProperty("grouplist")) {
					updateGroupDict(data.grouplist);
				}
			});
		} else if (updateType === 'window') {
			if (windowData !== null) {
				console.log("update winodow", windowData);
				connector.send('GetWindowMetaData', { id : windowData.id}, doneGetWindowMetaData);
			}
		} else if (updateType === 'group') {
			connector.send('GetGroupList', {}, function (err, data) {
				if (!err && data.hasOwnProperty("grouplist")) {
					updateGroupDict(data.grouplist);
				}
			});
		} else {
			console.log("update transform");
			if (targetid) {
				connector.send('GetMetaData', { type: '', id: targetid}, doneGetMetaData);
			} else {
				connector.send('GetMetaData', { type: 'all', id: ''}, doneGetMetaData);
			}
		}
	}

	/**
	 * コンテンツの選択
	 * @method select
	 * @param {String} targetid 対象コンテンツID
	 */
	function select(targetid) {
		var metaData,
			elem;
		if (metaDataDict.hasOwnProperty(targetid)) {
			metaData = metaDataDict[targetid];
			elem = document.getElementById(targetid);
			elem.style.borderWidth = "1px";
			elem.style.border = "solid";
			elem.is_dragging = true;
			
			if (elem.classList.contains("mark")) {
				elem.style.borderWidth = "6px";
				if (metaData.hasOwnProperty("group") && groupDict.hasOwnProperty(metaData.group)) {
					elem.style.borderColor = groupDict[metaData.group].color; 
				}
			}
		}
	}

	/**
	 * コンテンツタイプから適切なタグ名を取得する.
	 * @method getTagName
	 * @param {String} contentType コンテンツタイプ.
	 */
	function getTagName(contentType) {
		var tagName;
		if (contentType === 'text') {
			tagName = 'pre';
		} else if (contentType === 'video') {
			tagName = 'video'
		} else {
			tagName = 'img';
		}
		return tagName;
	}

	/**
	 * 現在選択されているContentを非選択状態にする
	 * @method unselect
	 */
	function unselect() {
		var i,
			elem;
		for (i in metaDataDict) {
			if (metaDataDict.hasOwnProperty(i)) {
				elem = document.getElementById(metaDataDict[i].id);
				if (elem && elem.is_dragging) {
					elem.is_dragging = false;
					if (!elem.classList.contains("mark")) {
						elem.style.borderWidth = "0px";
					}
				}
			}
		}
	}

	/**
	 * 指定Contentを移動させる
	 * @oaram targetid コンテンツのid
	 * @param x ページのx座標
	 * @param y ページのy座標
	 */
	function translate(targetid, x, y) {
		var elem,
			metaData,
			i,
			max = 0;
		
		if (metaDataDict.hasOwnProperty(targetid)) {
			elem = document.getElementById(targetid);
			metaData = metaDataDict[targetid];
			metaData.posx = x;
			metaData.posy = y;
			
			vscreen_util.transPosInv(metaData);
			metaData.posx -= vscreen.getWhole().x;
			metaData.posy -= vscreen.getWhole().y;
			
			connector.send('UpdateMetaData', [metaData], function (err, reply) {
			});
		}
	}

	function translateZ(targetid) {
		var metaData,
			i,
			index,
			max = 0;
		
		if (metaDataDict.hasOwnProperty(targetid)) {
			metaData = metaDataDict[targetid];
			for (i in metaDataDict) {
				if (metaDataDict.hasOwnProperty(i)) {
					if (metaDataDict[i].id !== metaData.id && 
						!Validator.isWindowType(metaDataDict[i]) &&
						metaDataDict[i].hasOwnProperty("zIndex")) {
						index = parseInt(metaDataDict[i].zIndex, 10);
						if (!isNaN(index)) {
							max = Math.max(max, parseInt(metaDataDict[i].zIndex, 10));
						}
					}
				}
			}
			metaData.zIndex = max + 1;
			connector.send('UpdateMetaData', [metaData], function (err, reply) {});
		}
	}

	/**
	 * 現在選択されているContentのエレメントを返す. ない場合はnullが返る.
	 */
	function getSelectedElem() {
		var i,
			elem;
		for (i in metaDataDict) {
			if (metaDataDict.hasOwnProperty(i)) {
				elem = document.getElementById(metaDataDict[i].id);
				if (elem && elem.is_dragging) {
					return elem;
				}
			}
		}
		return null;
	}

	/**
	 * コンテンツにイベント等を設定.
	 * @param elem コンテンツのelement
	 * @param targetid コンテンツのid
	 */
    function setupContent(elem, targetid) {
        var d = getTargetEvent();
        if(d.mode === 'mouse'){
            elem.addEventListener(d.start, (function (elem) {
                return function (evt) {
                    var rect = elem.getBoundingClientRect();
                    unselect();
                    select(targetid);
                    elem.draggingOffsetLeft = evt.clientX - rect.left;
                    elem.draggingOffsetTop = evt.clientY - rect.top;
					translateZ(targetid);
                    evt.preventDefault();
                };
            }(elem)), false);
            window.onmouseup = function () {
                unselect();
            };
            window.onmousemove = function (evt) {
                var elem = getSelectedElem();
                if (elem && elem.is_dragging) {
                    translate(elem.id, evt.pageX - elem.draggingOffsetLeft, evt.pageY - elem.draggingOffsetTop);
                }
                evt.preventDefault();
            };
        }else{
            elem.addEventListener(d.start, (function (elem) {
                return function (evt) {
                    var rect = elem.getBoundingClientRect();
                    unselect();
                    select(targetid);
                    elem.draggingOffsetLeft = evt.changedTouches[0].clientX - rect.left;
                    elem.draggingOffsetTop = evt.changedTouches[0].clientY - rect.top;
					translateZ(targetid);
                    evt.preventDefault();
                };
            }(elem)), false);
            window.ontouchend = function () {
                unselect();
            };
            window.ontouchmove = function (evt) {
                var elem = getSelectedElem();
                if (elem && elem.is_dragging) {
                    translate(elem.id, evt.changedTouches[0].pageX - elem.draggingOffsetLeft, evt.changedTouches[0].pageY - elem.draggingOffsetTop);
                }
                evt.preventDefault();
            };
        }
    };

	function setupMemo(elem, metaData) {
		var previewArea = document.getElementById('preview_area'),
			memo = document.getElementById("memo:" + metaData.id),
			rect;
		if (elem && metaData.user_data_text) {
			if (memo) {
				memo.innerHTML = JSON.parse(metaData.user_data_text).text;
				rect = elem.getBoundingClientRect();
				memo.style.width = (rect.right - rect.left) + "px";
				memo.style.left = rect.left + "px";
				memo.style.top =  rect.bottom + "px";
				memo.style.zIndex = elem.style.zIndex;
			} else {
				memo = document.createElement("pre");
				memo.id = "memo:" + metaData.id;
				memo.className = "memo";
				memo.innerHTML = JSON.parse(metaData.user_data_text).text;
				rect = elem.getBoundingClientRect();
				memo.style.left = rect.left + "px";
				memo.style.top = rect.bottom + "px";
				memo.style.position = "absolute";
				memo.style.width = (rect.right - rect.left) + "px";
				memo.style.height = "auto";
				memo.style.whiteSpace = "pre-line";
				memo.style.zIndex = elem.style.zIndex;
				previewArea.appendChild(memo);
			}
			
			if (metaData.hasOwnProperty("group") && groupDict.hasOwnProperty(metaData.group)) {
				memo.style.borderColor = groupDict[metaData.group].color;
				memo.style.backgroundColor = groupDict[metaData.group].color; 
			}
		}
	}

	// このページのwebRTC用のキーを取得.
	// ディスプレイIDが同じでもページごとに異なるキーとなる.
	// (ページをリロードするたびに代わる)
	function getRTCKey(metaData) {
		return metaData.id + "_" + windowData.id + "_" + random_id_for_webrtc;
	}

	/**
	 * メタバイナリからコンテンツelementを作成してVirtualScreenに登録
	 * @method assignMetaBinary
	 * @param {JSON} metaData メタデータ
	 * @param {Object} contentData コンテンツデータ(テキストまたはバイナリデータ)
	 */
	function assignMetaBinary(metaData, contentData) {
		var previewArea = document.getElementById('preview_area'),
			tagName,
			blob,
			elem,
			memo,
			mime = "image/jpeg",
			boundElem,
			id,
			duplicatedElem;

		console.log("assignMetaBinary", "id=" + metaData.id);
		if (Validator.isWindowType(metaData) || (metaData.hasOwnProperty('visible') && String(metaData.visible) === "true")) {
			tagName = getTagName(metaData.type);

			// 既に読み込み済みのコンテンツかどうか
			if (document.getElementById(metaData.id)) {
				elem = document.getElementById(metaData.id);
				// 読み込み完了までテンポラリで枠を表示してる．枠であった場合は消す.
				if (elem.tagName.toLowerCase() !== tagName) {
					previewArea.removeChild(elem);
					elem = null;
				}
				// メタデータはGetMetaDataで取得済のものを使う.
				// GetContent送信した後にさらにGetMetaDataしてる場合があるため.
				if (metaDataDict.hasOwnProperty(metaData.id)) {
					metaData = metaDataDict[metaData.id];
				}
			}

			if (!elem) {
				elem = document.createElement(tagName);
				elem.id = metaData.id;
				elem.style.position = "absolute";
				elem.style.color = "white";
				setupContent(elem, elem.id);
				insertElementWithDictionarySort(previewArea, elem);
				//previewArea.appendChild(elem);
			}
			if (metaData.type === 'video') {
				var rtcKey = getRTCKey(metaData);
				elem.setAttribute("controls", "");
				elem.setAttribute('autoplay', '')
				elem.setAttribute('preload', "metadata")
				if (!webRTCDict.hasOwnProperty(rtcKey)) {
					connector.sendBinary('RTCRequest', metaData, JSON.stringify({ key : rtcKey }), function () {
						var webRTC = new WebRTC();
						webRTCDict[rtcKey] = webRTC;
						webRTC.on('addstream', function (evt) {
							var stream = evt.stream ? evt.stream : evt.streams[0];
							elem.srcObject = stream;

							if (!webRTC.statusHandle) {
								var t = 0;
								webRTC.statusHandle = setInterval( function (rtcKey, webRTC) {
									t += 1;
									webRTC.getStatus(function (status) {
										var bytes = 0;
										if (status.video && status.video.bytesReceived) {
											bytes += status.video.bytesReceived;
										}
										if (status.audio && status.audio.bytesReceived) {
											bytes += status.audio.bytesReceived;
										}
										console.log("webrtc key:"+ rtcKey + "  bitrate:" + Math.floor(bytes * 8 / this / 1000) + "kbps");
									}.bind(t));
								}.bind(this, rtcKey, webRTCDict[rtcKey]), 1000);
							}
						}.bind(rtcKey));

						webRTC.on('icecandidate', function (type, data) {
							if (type === "tincle") {
								connector.sendBinary('RTCIceCandidate', metaData, JSON.stringify({
									key : rtcKey,
									candidate: data
								}), function (err, reply) {});
							}
						});
						
						webRTC.on('closed', function () {
							if (webRTCDict.hasOwnProperty(this)) {
								if (webRTCDict[this].statusHandle) {
									clearInterval(webRTCDict[this].statusHandle);
									webRTCDict[this].statusHandle = null;
								}
								delete webRTCDict[this];
							}
						}.bind(rtcKey))
					});
				}
			} else if (metaData.type === 'text') {
				// contentData is text
				elem.innerHTML = contentData;
			} else {
				// contentData is blob
				if (metaData.hasOwnProperty('mime')) {
					mime = metaData.mime;
				}
				blob = new Blob([contentData], {type: mime});
				if (elem && blob) {
					URL.revokeObjectURL(elem.src);
					elem.src = URL.createObjectURL(blob);
				}
			}
			vscreen_util.assignMetaData(elem, metaData, false, groupDict);
			
			// 同じコンテンツを参照しているメタデータがあれば更新
			if (elem) {
				for (id in metaDataDict) {
					if (metaDataDict.hasOwnProperty(id) && id !== metaData.id) {
						if (metaData.content_id === metaDataDict[id].content_id) {
							duplicatedElem = document.getElementById(id);
							if (duplicatedElem) {
								if (metaData.type === 'text') {
									duplicatedElem.innerHTML = elem.innerHTML;
								} else {
									duplicatedElem.src = elem.src;
								}
								connector.send('GetMetaData', metaDataDict[id], doneGetMetaData);
							}
						}
					}
				}
			}

			setupMemo(elem, metaData);
		}
	}

	/**
	 * コンテンツロード完了まで表示する枠を作る.
	 * @method createBoundingBox
	 * @param {JSON} metaData メタデータ
	 */
	function createBoundingBox(metaData) {
		console.log("createBoundingBox", metaData);
		var previewArea = document.getElementById('preview_area'),
			tagName = 'div',
			elem = document.createElement(tagName);

		elem.id = metaData.id;
		elem.style.position = "absolute";
		elem.className = "temporary_bounds";
		setupContent(elem, elem.id);
		insertElementWithDictionarySort(previewArea, elem);
	}

	/**
	 * VirtualDisplay更新
	 * @method updateWindow
	 * @param {JSON} metaData VirtualDisplayメタデータ
	 */
	function updateWindow(metaData) {
		var cx = parseFloat(metaData.posx, 10),
			cy = parseFloat(metaData.posy, 10),
			w = parseFloat(metaData.width),
			h = parseFloat(metaData.height),
			orgW = parseFloat(vscreen.getWhole().orgW),
			scale = orgW / w;

		console.log("scale:" + scale);

		// scale
		vscreen.setWholePos(0, 0);
		vscreen.setWholeCenter(0, 0);
		vscreen.setWholeScale(scale);

		// trans
		vscreen.translateWhole(-cx, -cy);
	}

	/**
	 * リサイズに伴うDisplayの更新
	 * @method resizeViewport
	 * @param {JSON} windowData ウィンドウメタデータ
	 */
	function resizeViewport(windowData) {
		var wh = getWindowSize(),
			cx = wh.width / 2.0,
			cy = wh.height / 2.0,
			scale,
			id,
			metaTemp;

		updateWindow(windowData);

		for (id in metaDataDict) {
			if (metaDataDict.hasOwnProperty(id)) {
				if (document.getElementById(id)) {
					vscreen_util.assignMetaData(document.getElementById(id), metaDataDict[id], false, groupDict);
				}
			}
		}
	}

    if(getTargetEvent().mode === 'mouse'){
        window.document.addEventListener("mousedown", function () {
            var displayArea = document.getElementById('displayid_area');
            if (displayArea.style.display !== "none") {
                displayArea.style.display = "none";
            }
        });
    }else{
        window.document.addEventListener("touchstart", function () {
            var displayArea = document.getElementById('displayid_area');
            if (displayArea.style.display !== "none") {
                displayArea.style.display = "none";
            }
        });
    }

	/**
	 * ディスプレイIDの表示.
	 * @method showDisplayID
	 * @param {string} id ディスプレイID
	 */
	function showDisplayID(id) {
		console.log("showDisplayID:" + id);
		if (id && windowData.id === id) {
			document.getElementById('displayid_area').style.display = "block";
			setTimeout(function () {
				document.getElementById('displayid_area').style.display = "none";
			}, 8 * 1000);
		} else if (id === "") {
			document.getElementById('displayid_area').style.display = "block";
			setTimeout(function () {
				document.getElementById('displayid_area').style.display = "none";
			}, 8 * 1000);
		}
	}

	/**
	 * ディスプレイIDの変更.
	 * @method changeID
	 * @param {Event} e イベント
	 */
	function changeID(e, id, noReload) {
		var elem = document.getElementById('input_id'),
			val,
			url;
		if (e) {
			e.preventDefault();
		}
		if (elem && elem.value) {
			console.log(elem.value);
			val = elem.value.split(' ').join('');
			val = val.split('　').join('');
			location.hash = fixedEncodeURIComponent(val);
			if (!noReload) {
				location.reload(true);
			}
		} else if (id) {
			location.hash = fixedEncodeURIComponent(id);
			if (!noReload) {
				location.reload(true);
			}
		}
	}

	/**
	 * 表示非表示の更新.
	 * @method updatePreviewAreaVisible
	 * @param {JSON} json メタデータ
	 */
	function updatePreviewAreaVisible(json) {
		var previewArea = document.getElementById("preview_area"),
			elem = document.getElementById(json.id);
		console.log("updatePreviewAreaVisible", previewArea, elem);
		if (previewArea) {
			if (isVisible(json)) {
				vscreen_util.assignMetaData(previewArea, json, false, groupDict);
				previewArea.style.display = "block";
			} else {
				previewArea.style.display = "none";
			}
		}
		if (elem) {
			if (isVisible(json)) {
				vscreen_util.assignMetaData(elem, json, false, groupDict);
				elem.style.display = "block";
			} else {
				elem.style.display = "none";
			}
		}
	}

	/**
	 * コンテンツメタデータがウィンドウ内にあるか再計算する
	 * @method recalculateContentVisible
	 */
	function updateContentVisible() {
		var i;
		for (i in metaDataDict) {
			if (metaDataDict.hasOwnProperty(i)) {
				console.log(metaDataDict[i]);
				if (metaDataDict[i].type !== 'window') {
					doneGetMetaData(null, metaDataDict[i]);
				}
			}
		}
	}

	/**
	 * AddWindowMetaData終了コールバック
	 * @param {String} err エラー.なければnull
	 * @param {JSON} json メタデータ
	 */
	doneAddWindowMetaData = function (err, json) {
		console.log("doneAddWindowMetaData", json);
		var i;
		if (!err) {
			for (i = 0; i < json.length; i = i + 1) {
				metaDataDict[json[i].id] = json[i];
				windowData = json[i];
				saveCookie();
				window.parent.document.title = "Display ID:" + json[i].id;
				document.getElementById('input_id').value = json[i].id;
				document.getElementById('displayid').innerHTML = "ID:" + json[i].id;
				updatePreviewAreaVisible(windowData);
				resizeViewport(windowData);
			}
		}
		update('all');
	};

	doneUpdateWindowMetaData = function (err, json) {
		console.log("doneUpdateWindowMetaData", json);
		var i;
		if (!err) {
			for (i = 0; i < json.length; i = i + 1) {
				metaDataDict[json[i].id] = json[i];
				windowData = json[i];
				saveCookie();
				window.parent.document.title = "Display ID:" + json[i].id;
				document.getElementById('input_id').value = json[i].id;
				document.getElementById('displayid').innerHTML = "ID:" + json[i].id;
				updatePreviewAreaVisible(windowData);
				resizeViewport(windowData);
			}
		}
	};

	/**
	 * GetWindowMetaData終了コールバック
	 * @param {String} err エラー.なければnull
	 * @param {JSON} json メタデータ
	 */
	doneGetWindowMetaData = function (err, json) {
		console.log("doneGetWindowMetaData", json);
		if (!err && json) {
			metaDataDict[json.id] = json;
			windowData = json;
			saveCookie();
			updatePreviewAreaVisible(windowData);
			resizeViewport(windowData);
			updateContentVisible();
		} else if (err) {
			authority = null;
			connector.send('Logout', {}, function () {
			});
		}
		/*else if (err) {
			changeID(null, windowData.id, true);
			windowData = null;
			updatePreviewAreaVisible({ visible : false});
			registerWindow();
		}
		*/
	};

	/**
	 * GetContent終了コールバック
	 * @param {String} err エラー.なければnull
	 * @param {Object} data コンテンツデータ
	 */
	doneGetContent = function (err, data) {
		console.log("doneGetContent", err, data);
		if (!err) {
			var metaData = data.metaData,
				contentData = data.contentData;
		
			// 閲覧可能か
			if (!isViewable(metaData.group)) {
				return;
			}
			// レイアウトは無視
			if (Validator.isLayoutType(metaData)) { return; }
			// コンテンツ登録&表示
			assignMetaBinary(metaData, contentData);
		}
	};

	/**
	 * マークによるコンテンツ強調表示のトグル
	 * @param {Element} elem 対象エレメント
	 * @param {JSON} metaData メタデータ
	 */
	function toggleMark(elem, metaData) {
		var mark_memo = "mark_memo",
			mark = "mark",
			memo = null;
		if (elem && metaData.hasOwnProperty("id")) {
			if (metaData.hasOwnProperty(mark) && (metaData[mark] === 'true' || metaData[mark] === true)) {
				if (!elem.classList.contains(mark)) {
					elem.classList.add(mark);
					if (metaData.hasOwnProperty("group") && groupDict.hasOwnProperty(metaData.group)) {
						elem.style.borderColor = groupDict[metaData.group].color;
						elem.style.borderWidth = "6px";
					}
				}
			} else {
				if (elem.classList.contains(mark)) {
					elem.classList.remove(mark);
					elem.style.borderWidth = "0px";
				}
			}
			memo =  document.getElementById("memo:" + metaData.id);
			if (memo) {
				if (metaData.hasOwnProperty("group") && groupDict.hasOwnProperty(metaData.group)) {
					memo.style.borderColor = "lightgray";
					memo.style.backgroundColor = "lightgray"; 
				}
				if ( (metaData[mark_memo] === 'true' || metaData[mark_memo] === true) && 
					 (metaData["visible"] === 'true' || metaData["visible"] === true) )
				{
					memo.style.display = "block";
				} else {
					memo.style.display = "none";
				}
			}
		}
	}

	function deleteMark(elem, metaData) {
		var mark_memo = "mark_memo",
			mark = "mark",
			memo = null;

		if (elem && metaData.hasOwnProperty("id")) {
			memo =  document.getElementById("memo:" + metaData.id);
			if (memo) {
				memo.style.display = "none";
				if (memo.parentNode) {
					memo.parentNode.removeChild(memo);
				}
				delete metaData[mark_memo];
			}
		}
	}

	function isViewable(group) {
		// 権限情報があるか
		if (!authority) {
			return false;
		}
		if (group === undefined || group === "") {
			return true;
		}
		if (group === Constants.DefaultGroup) {
			return true;
		}
		if (groupDict.hasOwnProperty(group)) {
			if (authority.viewable === "all") {
				return true;
			}
			if (authority.viewable.indexOf(group) >= 0) {
				return true;
			}
		}
		return false;
	}

	/**
	 * GetMetaData終了コールバック
	 * @param {String} err エラー.なければnull
	 * @param {JSON} json メタデータ
	 */
	doneGetMetaData = function (err, json) {
		var metaData = json,
			isUpdateContent = false;
		console.log("doneGetMetaData", json);
		if (!json) { return; }
		// レイアウトは無視
		if (Validator.isLayoutType(metaData)) { return; }
		// 復元したコンテンツか
		if (!json.hasOwnProperty('id')) { return; }
		if (metaDataDict.hasOwnProperty(json.id)) {
			isUpdateContent = (metaDataDict[json.id].restore_index !== json.restore_index);
		}
		// 閲覧可能か
		if (!isViewable(json.group)) {
			return;
		}

		// 履歴からのコンテンツ復元.
		if (metaDataDict.hasOwnProperty(json.id) && json.hasOwnProperty('restore_index')) {
			if (metaDataDict[json.id].restore_index !== json.restore_index) {
				var request = { type: json.type, id: json.id, restore_index : json.restore_index };
				connector.send('GetContent', request, function (err, reply) {
					doneGetContent(err, reply);
					toggleMark(document.getElementById(json.id), metaData);
				});
			}
		}
		
		metaDataDict[json.id] = json;
		if (!err) {
			var elem = document.getElementById(json.id),
				isWindow = Validator.isWindowType(json),
				isOutside = false,
				whole,
				w,
				h;

			if (isWindow) {
				console.log(json.id, getWindowID());
				if (json.id !== getWindowID()) {
					return;
				}
			} else {
				whole = vscreen.transformOrgInv(vscreen.getWhole());
				whole.x = vscreen.getWhole().x;
				whole.y = vscreen.getWhole().y;
				isOutside = vscreen_util.isOutsideWindow(json, whole);
				//console.log(isOutside, json, vscreen.getWhole());
			}
			console.log("isOutside:", isOutside);

			if (isOutside) {
				if (elem) {
					// コンテンツが画面外にいった
					elem.style.display = "none";
					// webrtcコンテンツが画面外にいったら切断して削除しておく.
					var rtcKey = getRTCKey(json);
					if (webRTCDict.hasOwnProperty(rtcKey)) {
						webRTCDict[rtcKey].close(true);
						if (elem.parentNode) {
							elem.parentNode.removeChild(elem);
						}
						connector.sendBinary('RTCClose', metaData, JSON.stringify({
							key : rtcKey
						}), function (err, reply) {});
					}
				}
			} else {
				if (elem && elem.tagName.toLowerCase() === getTagName(json.type)) {
					if (isVisible(json)) {
						vscreen_util.assignMetaData(elem, json, false, groupDict);
						elem.style.display = "block";
					} else {
						elem.style.display = "none";
					}
				} else if (isUpdateContent || (!isWindow && isVisible(json))) {
					// コンテンツがロードされるまで枠を表示しておく.
					if (!elem) {
						createBoundingBox(json);
						// 新規コンテンツロード.
						connector.send('GetContent', { type: json.type, id: json.id, restore_index : json.restore_index  }, function (err, reply) {
							doneGetContent(err, reply);
							toggleMark(document.getElementById(json.id), metaData);
						});
					}
					elem = document.getElementById(json.id);
					vscreen_util.assignMetaData(elem, json, false, groupDict);
				}
				if (isWindow) {
					resizeViewport(windowData);
				} else {
					setupMemo(elem, metaData);
					toggleMark(elem, metaData);
				}
			}
		}
	};

	/**
	 * 読み込み済コンテンツの全削除
	 */
	function deleteAllElements() {
		var id,
			elem,
			previewArea = document.getElementById('preview_area');
		for (id in metaDataDict) {
			elem = document.getElementById(id);
			if (elem) {
				previewArea.removeChild(elem);
				delete metaDataDict[id];
			}
		}
	}

	/**
	 * 再接続.
	 * @method reconnect
	 */
	function reconnect() {
		var isDisconnect = false,
			client = connector.connect(function () {
				var disconnected_text = document.getElementById("disconnected_text");
				if (disconnected_text) {
					disconnected_text.style.display = "none";
				}
				if (!windowData) {
					console.log("registerWindow");
					var request = { id : "Display", password : "" };
					connector.send('Login', request, function (err, reply) {
						authority = reply.authority;
						registerWindow();
					});
				}
			}, (function () {
				return function (ev) {
					console.log('close', ev);
					var disconnected_text = document.getElementById("disconnected_text");
					if (disconnected_text) {
						disconnected_text.style.display = "block";
					}
					if (!isDisconnect) {
						setTimeout(function () {
							reconnect();
						}, reconnectTimeout);
					}
				};
			}()));

		connector.on("Update", function (data) {
			if (data === undefined) {
				update('window');
				update('group');
				update('content');
			}
		});

		connector.on("UpdateContent", function (data) {
			console.log("onUpdateContent", data);

			connector.send('GetMetaData', data, function (err, json) {
				// 閲覧可能か
				if (!isViewable(json.group)) {
					return;
				}
				if (json.type === "video") {
					var rtcKey = getRTCKey(json);
					if (webRTCDict.hasOwnProperty(rtcKey)) {
						webRTCDict[rtcKey].close(true);
						connector.sendBinary('RTCClose', json, JSON.stringify({
							key : rtcKey
						}), function (err, reply) {});
					}
				}
				if (!err) {
					doneGetMetaData(err, json);
					connector.send('GetContent', json, function (err, reply) {
						if (metaDataDict.hasOwnProperty(json.id)) {
							doneGetContent(err, reply);
						}
					} );
				}
			});
		});

		connector.on("UpdateGroup", function (err, data) {
			update("group", "");
		});

		// 権限変更時に送られてくる
		connector.on("ChangeAuthority",function () {
			var request = { id : "Display", password : "" };
			connector.send('Login', request, function (err, reply) {
				authority = reply.authority;
				update('window');
				update('group');
				update('content');
			});
		});


		// DB切り替え時にブロードキャストされてくる
		connector.on("ChangeDB", function () {
			var request = { id : "Display", password : "" };
			connector.send('Login', request, function (err, reply) {
				authority = reply.authority;
				deleteAllElements();
				update('window');
				update('group');
				update('content');
			});
		});

		connector.on("DeleteContent", function (data) {
			console.log("onDeleteContent", data);
			var i,
				elem,
				previewArea = document.getElementById('preview_area');

			for (i = 0; i < data.length; ++i) {
				elem = document.getElementById(data[i].id);
				if (elem) {
					deleteMark(elem, metaDataDict[data[i].id]);
					previewArea.removeChild(elem);
					delete metaDataDict[data[i].id];
				}
			}
		});

		connector.on("DeleteWindowMetaData", function (data) {
			console.log("onDeleteWindowMetaData", data);
			update('window');
		});

		connector.on("UpdateWindowMetaData", function (data) {
			console.log("onUpdateWindowMetaData", data);
			var i;
			for (i = 0; i < data.length; ++i) {
				if (data[0].hasOwnProperty('id') && data[0].id === getWindowID()) {
					update('window');
					updatePreviewAreaVisible( data[0]);
					resizeViewport( data[0])
					return;
				}
			}
		});

        connector.on("UpdateMouseCursor", function (res) {
            var i, a, e, f, x, y, p, ctrlid = res.id;
            if (res.hasOwnProperty('data') && res.data.hasOwnProperty('x') && res.data.hasOwnProperty('y')) {
                if(!controllers.hasOwnProperty(ctrlid)){
                    ++controllers.connectionCount;
                    controllers[ctrlid] = {
                        index: controllers.connectionCount,
                        lastActive: 0
                    };
                }
                p = vscreen.transform(vscreen.makeRect(res.data.x, res.data.y, 0, 0));
                e = document.getElementById('hiddenCursor' + ctrlid);
                if(!e){
                    e = document.createElement('div');
                    e.id = 'hiddenCursor' + ctrlid;
                    e.className = 'hiddenCursor';
                    e.style.backgroundColor = 'transparent';
                    f = document.createElement('div');
                    f.className = 'before';
                    f.style.backgroundColor = res.data.hsv;
                    e.appendChild(f);
                    f = document.createElement('div');
                    f.className = 'after';
                    f.style.backgroundColor = res.data.hsv;
                    e.appendChild(f);
                    document.body.appendChild(e);
                    console.log('new controller cursor! => id: ' + res.data.connectionCount + ', color: ' + res.data.hsv);
                }
                e.style.left = Math.round(p.x) + 'px';
                e.style.top  = Math.round(p.y) + 'px';
                controllers[ctrlid].lastActive = Date.now();
            } else {
                if (controllers.hasOwnProperty(ctrlid)) {
                    e = document.getElementById('hiddenCursor' + ctrlid);
                    if(e){
                        e.style.left = '-9999px';
                        e.style.top  = '-9999px';
                    }
                    f = e.parentNode;
                    if(f){e.removeChild(e);}
                }
            }
        });

		connector.on("ShowWindowID", function (data) {
			console.log("onShowWindowID", data);
			var i;
			for (i = 0; i < data.length; i = i + 1) {
				showDisplayID(data[i].id);
			}
		});

		connector.on("UpdateMetaData", function (data) {
			var i;
			var previewArea = document.getElementById("preview_area");
			
			for (i = 0; i < data.length; ++i) {
				if (!isViewable(data[i].group)) {
					var elem = document.getElementById(data[i].id);
					if (elem) {
						previewArea.removeChild(elem);
					}
					var memo =  document.getElementById("memo:" + data[i].id);
					if (memo) {
						previewArea.removeChild(memo);
					}
				}
				update('', data[i].id);
			}
		});

		connector.on("RTCOffer", function (data) {
			//console.error("RTCOffer")
			if (!windowData) return;
			var metaData = data.metaData;
			var contentData = data.contentData;
			var parsed = null;
			var sdp = null;
			var rtcKey = null;
			try {
				var dataStr = StringUtil.arrayBufferToString(contentData.data);
				parsed = JSON.parse(dataStr);
				rtcKey = parsed.key;
				sdp = parsed.sdp;
			} catch (e) {
				console.error(e);
				return;
			}

			if (sdp) {
				if (webRTCDict.hasOwnProperty(rtcKey)) {
					var webRTC = webRTCDict[rtcKey];
					webRTC.answer(sdp, function (answer) {
						//console.error("WebRTC: send answer")
						connector.sendBinary('RTCAnswer', metaData, JSON.stringify({
							key : rtcKey,
							sdp : answer
						}), function () {});
					});
				}
			}
		});
		
		connector.on("RTCClose", function (data) {
			var metaData = data.metaData;
			var contentData = data.contentData;
			var parsed = null;
			var rtcKey = null;
			try {
				var dataStr = StringUtil.arrayBufferToString(contentData.data);
				parsed = JSON.parse(dataStr);
				rtcKey = parsed.key;
			} catch (e) {
				console.error(e);
				return;
			}
			if (webRTCDict.hasOwnProperty(rtcKey)) {
				webRTCDict[rtcKey].close(true);
			}
		});

		connector.on("RTCIceCandidate", function (data) {
			//console.error("on RTCIceCandidate")
			var metaData = data.metaData;
			var contentData = data.contentData;
			var parsed = null;
			var candidate = null;
			var rtcKey = null;
			try {
				var dataStr = StringUtil.arrayBufferToString(contentData.data);
				parsed = JSON.parse(dataStr);
				rtcKey = parsed.key;
				candidate = parsed.candidate;
			} catch (e) {
				console.error(e);
				return;
			}
			if (webRTCDict.hasOwnProperty(rtcKey)) {
				if (candidate) {
					webRTCDict[rtcKey].addIceCandidate(candidate);
				}
			}
		});

		connector.on("Disconnect", (function (client) {
			return function () {
				var previewArea = document.getElementById("preview_area"),
					disconnected_text = document.getElementById("disconnected_text");
				isDisconnect = true;
				client.close();

				if (previewArea) {
					previewArea.style.display = "none";
				}
				if (disconnected_text) {
					disconnected_text.innerHTML = "Display Deleted";
				}
			};
		}(client)));
	}

	/**
	 * 初期化
	 * @method init
	 */
	function init() {
		var input_id = document.getElementById('input_id'),
			registered = false,
			onfocus = false,
			hideMenuFunc = function () {
				console.log("onfocus:", onfocus);
				if (!onfocus) {
					console.log("hideMenuFunc");
					document.getElementById('head_menu').classList.add('hide');
				}
				registered = false;
			};

		reconnect();

		// resize event
		window.onresize = function () {
			if (timer) {
				clearTimeout(timer);
			}
			timer = setTimeout(function () {
				resizeWindow();
			}, 200);
		};

		window.addEventListener('mousemove', function (evt) {
			document.getElementById('head_menu').classList.remove('hide');
			if (!registered) {
				registered = true;
				setTimeout(hideMenuFunc, 3000);
			}
		});

		input_id.onfocus = function (ev) {
			console.log("onfocus");
			onfocus = true;
			document.getElementById('head_menu').classList.remove('hide');
			clearTimeout(hideMenuFunc);
		};
		input_id.onblur = function (ev) {
			console.log("onblur");
			onfocus = false;
			changeID();
		};
		input_id.onkeypress = function (ev) {
			console.log(ev.keyCode);
			if (ev.keyCode === 13) { // enter
				changeID();
			}
		};

		// スクロールを抑止する関数
		function preventScroll(event) {
			// preventDefaultでブラウザ標準動作を抑止する。
			event.preventDefault();
		}

		// 上部メニューの初期化.
		var menu = new Menu(document.getElementById('head_menu'),
			{
				menu : [{
					Display : [{
							Controller : {
								url : "controller.html"
							}
						}],
					url : "view.html"
				},{
					Setting : [{
						Fullscreen : {
							func : function(evt, menu) { 
								if (!isFullScreen()) {
									menu.changeName("Fullscreen", "CancelFullscreen")
								} else {
									menu.changeName("CancelFullscreen", "Fullscreen")
								}
								toggleFullScreen();
							}
						}
					}]
				}]
			});
			
	}

	window.onload = init;
	window.onunload = function () {
		var i;
		for (i in webRTCDict) {
			webRTCDict[i].close();
		}
	}
}(window.vscreen, window.vscreen_util, window.ws_connector));
