/*jslint devel:true*/
/*global module, require, socket */

(function () {
	"use strict";
	
	/**
	 * Operator生成
	 * @method Operator
	 */
	var Operator = function () {},
		redis = require("redis"),
		image_size = require('image-size'),
		client = redis.createClient(6379, '127.0.0.1', {'return_buffers': true}),
		textClient = redis.createClient(6379, '127.0.0.1', {'return_buffers': false}),
		contentIDStr = "content_id",
		windowIDStr = "window_id",
		virtualDisplayIDStr = "virtual_display",
		metadataPrefix = "metadata:",
		metadataBackupPrefix = "metadata_backup:",
		contentPrefix = "content:",
		contentBackupPrefix = "content_backup:",
		contentRefPrefix = "contentref:",
		windowContentRefPrefix = "window_contentref:",
		windowMetaDataPrefix = "window_metadata:",
		windowContentPrefix = "window_content:",
		groupListPrefix = "grouplist",
		settingPrefix = "global_setting",
		io_connector = require('./io_connector.js'),
		ws_connector = require('./ws_connector.js'),
		util = require('./util.js'),
		Command = require('./command.js'),
		path = require('path'),
		fs = require('fs'),
		phantomjs = require('phantomjs'),
		frontPrefix = "tiled_server:t:",
		uuidPrefix = "invalid:",
		socketidToHash = {},
		methods,
        connectionId = {},
        connectionCount = 0;
	
	client.on('error', function (err) {
		console.log('Error ' + err);
	});

	function renderURLInternal(command, endCallback) {
		var command;
		var output = "out.png";
		if (command.length > 4) {
			output = "out" + command[5] + ".png";
			command[2] = output;
		}
		util.launchApp(command, null, function () {
			if (fs.existsSync(output)) {
				image_size(output, function (err, dimensions) {
					if (endCallback) {
						if (dimensions.height > 4000) {
							command.push(dimensions.width);
							command.push(4000);
							renderURLInternal(command, endCallback);
						} else {
							endCallback(fs.readFileSync(output), dimensions);
						}
					}
				});
			} else if (endCallback) {
				endCallback(null);
			}
		});
	}
	
	/**
	 * 指定されたURLをレンダリングする
	 * @method renderURL
	 * @param {String} url URL文字列
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function renderURL(url, endCallback) {
		var output = "out.png",
			command = [ phantomjs.path,
				path.normalize("./capture.js"),
				output,
				url ];
		console.dir("Phantomjs:" + JSON.stringify(phantomjs));
		console.log("Phantomjs path:" + phantomjs.path);
		renderURLInternal(command, endCallback);
	}
	
	function generateID(prefix, endCallback) {
		var id = util.generateUUID8();
		console.log("newid: " + id);
		textClient.exists(prefix + id, function (err, doesExist) {
			if (err) {
				console.log(err);
				return;
			}
			if (doesExist === 1) {
				generateID(prefix, endCallback);
			} else if (endCallback) {
				endCallback(id);
			}
		});
	}
	
	/**
	 * ContentID生成。generateUUID8を用いる。
	 * @method generateContentID
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function generateContentID(endCallback) {
		generateID(contentPrefix, endCallback);
	}
	
	/**
	 * MetaDataID生成
	 * @method generateMetaDataID
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function generateMetaDataID(endCallback) {
		generateID(metadataPrefix, endCallback);
	}
	
	/**
	 * WindowID生成。generateUUID8を用いる。
	 * @method generateWindowMetaDataID
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function generateWindowMetaDataID(endCallback) {
		generateID(windowMetaDataPrefix, endCallback);
	}
	
	/**
	 * WindowID生成。generateUUID8を用いる。
	 * @method generateWindowContentID
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function generateWindowContentID(endCallback) {
		generateID(windowContentPrefix, endCallback);
	}

	/**
	 * グループリストの取得. ない場合は空がendcallbackにわたる.
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function getGroupList(endCallback) {
		textClient.get(groupListPrefix, function (err, reply) {
			var data = reply;
			if (!reply) {
				data = { grouplist : [] };
			} else {
				try {
					data = JSON.parse(data);
				} catch (e) {
					return false;
				}
			}
			endCallback(err, data);
		});
	}

	function getGroupIndex(groupList, id) {
		var i;
		for (i = 0; i < groupList.length; i = i + 1) {
			if (groupList[i].id === id) {
				return i;
			}
		}
		return -1;
	}

	function getGroupIndexByName(groupList, name) {
		var i;
		for (i = 0; i < groupList.length; i = i + 1) {
			if (groupList[i].name === name) {
				return i;
			}
		}
		return -1;
	}

	/**
	 * グループリストにgroupを追加
	 * @param {String} id グループid. nullの場合自動割り当て.
	 * @param {String} groupName グループ名.
	 * @param {String} color グループ色.
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function addGroup(groupID, groupName, color, endCallback) {
		getGroupList(function (err, data) {
			var index = getGroupIndexByName(data.grouplist, groupName);
			if (index >= 0) {
				if (endCallback) {
					endCallback("Detect same group name");
				}
				return;
			}
			if (groupID) {
				data.grouplist.push({ name : groupName, color : color, id : groupID });
			} else {
				data.grouplist.push({ name : groupName, color : color, id : util.generateUUID8() });
			}
			textClient.set(groupListPrefix, JSON.stringify(data), endCallback);
			if (endCallback) {
				endCallback(null, null);
			}
		});
	}

	/**
	 * グループリストからgroupの削除
	 * @param {String} id グループid.
	 * @param {String} groupName グループ名.
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function deleteGroup(id, groupName, endCallback) {
		getGroupList(function (err, data) {
			var index = getGroupIndex(data.grouplist, id);
			if (index >= 0) { 
				data.grouplist.splice(index, 1);
				textClient.set(groupListPrefix, JSON.stringify(data), endCallback);
				return true;
			} else {
				endCallback("not found");
				return false;
			}
		});
	}

	/**
	 * グループ更新
	 * @param {String} groupName グループ名.
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function updateGroup(id, json, endCallback) {
		getGroupList(function (err, data) {
			var index = getGroupIndex(data.grouplist, id);
			if (index >= 0) {
				data.grouplist[index] = json;
				textClient.set(groupListPrefix, JSON.stringify(data), function () {
					endCallback(null, json);
				});
				return true;
			} else {
				if (endCallback) {
					endCallback("Not Found Group:" + id + ":" + groupName);
					return false;
				}
			}
		});
	}

	/**
	 * グループリストのgroupのインデックスを変更する
	 * @param {String} id グループid.
	 * @param {Integer} insertIndex 新規に割り当てるインデックス.
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function changeGroupIndex(id, insertIndex, endCallback) {
		getGroupList(function (err, data) {
			var index = getGroupIndex(data.grouplist, id),
				item;
			if (index >= 0) {
				item = data.grouplist[index];
				data.grouplist.splice(index, 1);
				if (insertIndex > 0 && insertIndex >= index) {
					insertIndex -= 1;
				}
				data.grouplist.splice(insertIndex, 0, item);
				textClient.set(groupListPrefix, JSON.stringify(data), endCallback);
				return true;
			} else {
				endCallback("not found");
				return false;
			}
		});
	}

	function changeUUIDPrefix(dbname, endCallback) {
		textClient.hget(frontPrefix + 'dblist', dbname, function (err, reply) {
			if (!err) {
				var id = reply;
				console.log("DB ID:", reply);
				uuidPrefix = id + ":";
				contentPrefix = frontPrefix + uuidPrefix + "content:";
				contentRefPrefix = frontPrefix + uuidPrefix + "contentref:";
				contentBackupPrefix = frontPrefix + uuidPrefix + "content_backup:";
				metadataPrefix = frontPrefix + uuidPrefix + "metadata:";
				metadataBackupPrefix = frontPrefix + uuidPrefix + "metadata_backup:";
				windowMetaDataPrefix = frontPrefix + uuidPrefix + "window_metadata:";
				windowContentPrefix = frontPrefix + uuidPrefix + "window_contentref:";
				windowContentRefPrefix = frontPrefix + uuidPrefix + "window_content:";
				virtualDisplayIDStr = frontPrefix + uuidPrefix + "virtual_display";
				groupListPrefix = frontPrefix + uuidPrefix + "grouplist";
				endCallback(null);
			} else {
				endCallback("failed to get dblist");
			}
		});
	}

	/**
	 * 新規保存領域の作成
	 * @param name 保存領域の名前
	 * @param endCallback 終了コールバック
	 */
	function newDB(name, endCallback) {
		if (name.length > 0) {
			textClient.hexists(frontPrefix + 'dblist', name, function (err, doesExists) {
				if (!err && doesExists !== 1) {
					// 存在しない場合のみ作って切り替え
					var id = util.generateUUID8();
					textClient.hset(frontPrefix + 'dblist', name, id, function (err, reply) {
						if (!err) {
							changeUUIDPrefix(name, function (err, reply) {
								addGroup("group_defalut", "default", function (err, reply) {} );
								endCallback(err);
							});
						} else {
							endCallback("failed to create new db");
						}
					});
				} else {
					endCallback("already exists");
				}
			});
		} else {
			endCallback("invalid db name");
		}
	}

	/**
	 * DBの参照先の変更
	 * @param name 保存領域の名前
	 * @param endCallback 終了コールバック
	 */
	function changeDB(name, endCallback) {
		if (name.length > 0) {
			textClient.hget(frontPrefix + 'dblist', name, function (err, reply) {
				if (!err) {
					var id = reply;
					textClient.exists(frontPrefix + id + ":grouplist", function (err, doesExists) {
						if (doesExists !== 1) {
							// 存在しないdbnameが指定された
							endCallback("Failed to change db: not exists db name");
							return;
						}
						changeUUIDPrefix(name, endCallback);
					});
				} else {
					// 存在しないdbnameが指定された
					endCallback("Failed to change db: not exists db name");
				}
			});
		}
	}

	/**
	 * DBの指定したデータ保存領域を削除
	 * @param name 保存領域の名前
	 * @param endCallback 終了コールバック
	 */
	function deleteDB(name, endCallback) {
		if (name.length > 0) {
			if (name === "default") {
				endCallback("Unauthorized name for deleting")
			} else {
				textClient.hget(frontPrefix + 'dblist', name, function (err, reply) {
					if (!err) {
						var id = reply;
						textClient.hdel(frontPrefix + 'dblist', name);
						textClient.exists(frontPrefix + id + ":grouplist", function (err, doesExists) {
							if (!err && doesExists == 1) {
								textClient.keys(frontPrefix + name + "*", function (err, replies) {
									var i;
									console.log("deletedb : ", name);
									if (!err) {
										for (i = 0; i < replies.length; i = i + 1) {
											console.log("delete : ", replies[i]);
											textClient.del(replies[i]);
										}

										if (uuidPrefix === (name + ":")) {
											// 現在使用中のDBが消去された.
											// defaultに戻す.
											changeDB("default", endCallback);
										} else {
											endCallback(null);
										}
									} else {
										endCallback("Failed deleteDB:" + err)
									}
								});
							} else {
								endCallback("Failed deleteDB: not exists db name")
							}
						});
					} else {
						endCallback("Failed deleteDB: not exists db name")
					}
				});
			}
		}
	}
	
	function changeSetting(json, endCallback) {
		textClient.hmset(settingPrefix, json, function (err) {
			if (err) {
				console.error(err);
			} else if (endCallback) {
				endCallback(json);
			}
		});
	}

	/**
	 * 指定されたタイプ、idのメタデータ設定
	 * @method setMetaData
	 * @param {String} type メタデータタイプ
	 * @param {String} id ContentsID
	 * @param {JSON} data メタデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function setMetaData(type, id, data, endCallback) {
		var metaData = data;
		
		//console.log("setMetaData:" + JSON.stringify(data));
		if (!metaData) {
			metaData = {
				"id" : id,
				"type" : type,
				"posx" : "0",
				"posy" : "0",
				"width" : "0",
				"height" : "0"
			};
		}
		if (metaData.type === "window") {
			console.error("invalid matadata.");
			return;
		}
		if (metaData.hasOwnProperty('command')) {
			delete metaData.command;
		}
	
		textClient.hmset(metadataPrefix + id, metaData, function (err) {
			if (err) {
				console.error(err);
			} else if (endCallback) {
				endCallback(metaData);
			}
		});
	}
	
	/**
	 * 指定されたタイプ、idのメタデータ取得
	 * @method getMetaData
	 * @param {String} type メタデータタイプ
	 * @param {String} id ContentsID
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function getMetaData(type, id, endCallback) {
		if (type === 'all') {
			textClient.keys(metadataPrefix + '*', function (err, replies) {
				var results = [],
					all_done = replies.length;
				replies.forEach(function (id, index) {
					textClient.hgetall(id, function (err, data) {
						if (endCallback) {
							data.last = ((replies.length - 1) === index);
							endCallback(data);
						}
					});
				});
			});
			/*
			textClient.keys(metadataPrefix + '*', function (err, replies) {
				var multi = textClient.multi();
				replies.forEach(function (reply, index) {
					multi.hgetall(reply);
				});
				multi.exec(function (err, data) {
					endCallback(data);
				});
			});
			*/
		} else {
			textClient.hgetall(metadataPrefix + id, function (err, data) {
				if (data) {
					if (endCallback) {
						endCallback(data);
					}
				}
			});
		}
	}
	
	function isInvalidImageSize(metaData) {
		if (!metaData.hasOwnProperty('width') || isNaN(metaData.width)) {
			return true;
		}
		if (!metaData.hasOwnProperty('height') || isNaN(metaData.height)) {
			return true;
		}
		if (metaData.width <= 0 || metaData.height <= 0) {
			return true;
		}
		return false;
	}
	
	/**
	 * 指定されたデータタイプ、idのコンテンツ取得
	 * @method getContent
	 * @param {String} type データタイプ
	 * @param {String} id ContentsID
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function getContent(type, id, endCallback) {
		if (type === 'all') {
			client.keys(contentPrefix + '*', function (err, replies) {
				replies.forEach(function (id, index) {
					client.get(id, function (err, reply) {
						if (!err) {
							if (endCallback) {
								endCallback(reply);
							}
						} else {
							console.error(err);
						}
					});
				});
			});
		} else {
			client.get(contentPrefix + id, function (err, reply) {
				if (!err) {
					if (endCallback) {
						endCallback(reply);
					}
				} else {
					console.error(err);
				}
			});
		}
	}
	
	/**
	 * メタデータをコンテンツバイナリから初期設定する.
	 * @method initialMetaDataSetting
	 * @param {JSON} metaData contentメタデータ
	 * @param {BLOB} contentData バイナリデータ
	 */
	function initialMetaDataSetting(metaData, contentData) {
		var dimensions;
		if (metaData.hasOwnProperty('orgWidth')) {
			metaData.width = metaData.orgWidth;
		} else if (metaData.hasOwnProperty('width')) {
			metaData.orgWidth = metaData.width;
		}
		if (metaData.hasOwnProperty('orgHeight')) {
			metaData.height = metaData.orgHeight;
		} else if (metaData.hasOwnProperty('height')) {
			metaData.orgHeight = metaData.height;
		}
		if (metaData.type === 'text') {
			metaData.mime = "text/plain";
		} else if (metaData.type === 'image') {
			metaData.mime = util.detectImageType(contentData);
		} else if (metaData.type === 'url') {
			metaData.mime = util.detectImageType(contentData);
		} else {
			console.error("Error undefined type:" + metaData.type);
		}
		if (metaData.type === 'image') {
			if (isInvalidImageSize(metaData)) {
				dimensions = image_size(contentData);
				if (!metaData.hasOwnProperty('orgWidth')) {
					metaData.width = dimensions.width;
					metaData.orgWidth = metaData.width;
				}
				if (!metaData.hasOwnProperty('orgHeight')) {
					metaData.height = dimensions.height;
					metaData.orgHeight = metaData.height;
				}
			}
		}
	}
	
	/**
	 * メタデータ追加
	 * @method addMetaData
	 * @param {JSON} metaData contentメタデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function addMetaData(metaData, endCallback) {
		generateMetaDataID(function (id) {
			if (metaData.hasOwnProperty('id') && metaData.id !== "") {
				id = metaData.id;
			}
			metaData.id = id;
			if (metaData.hasOwnProperty('content_id') && metaData.content_id !== "") {
				textClient.exists(contentPrefix + metaData.content_id, function (err, doesExists) {
					if (!err && doesExists === 1) {
						getContent('', metaData.content_id, function (contentData) {
							// 参照カウント.
							textClient.setnx(contentRefPrefix + metaData.content_id, 0);
							textClient.incr(contentRefPrefix + metaData.content_id);
							
							// メタデータを初回設定.
							initialMetaDataSetting(metaData, contentData);
							setMetaData(metaData.type, id, metaData, function (metaData) {
								if (endCallback) {
									endCallback(metaData);
								}
							});
						});
					} else {
						setMetaData(metaData.type, id, metaData, function (metaData) {
							if (endCallback) {
								endCallback(metaData);
							}
						});
					}
				});
			} else {
				setMetaData(metaData.type, id, metaData, function (metaData) {
					if (endCallback) {
						endCallback(metaData);
					}
				});
			}
		});
	}
						   
	/**
	 * コンテンツ追加
	 * @method addContent
	 * @param {JSON} metaData contentメタデータ
	 * @param {BLOB} data バイナリデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function addContent(metaData, data, endCallback) {
		var contentData = data;
		if (metaData.type === 'text') {
			metaData.mime = "text/plain";
		} else if (metaData.type === 'image') {
			metaData.mime = util.detectImageType(contentData);
		} else if (metaData.type === 'url') {
			metaData.mime = util.detectImageType(contentData);
		} else {
			console.error("Error undefined type:" + metaData.type);
		}
		
		console.log("mime:" + metaData.mime);
		
		addMetaData(metaData, function (metaData) {
			generateContentID(function (content_id) {
				if (metaData.hasOwnProperty('content_id') && metaData.content_id !== "") {
					content_id = metaData.content_id;
				}
				metaData.content_id = content_id;
				metaData.date = new Date().toISOString();
				
				textClient.set(contentPrefix + content_id, contentData, function (err, reply) {
					if (err) {
						console.error("Error on addContent:" + err);
					} else {
						// 参照カウント.
						textClient.setnx(contentRefPrefix + content_id, 0);
						textClient.incr(contentRefPrefix + content_id);
						
						// メタデータを初回設定.
						initialMetaDataSetting(metaData, contentData);
						setMetaData(metaData.type, metaData.id, metaData, function (metaData) {
							if (endCallback) {
								endCallback(metaData, contentData);
							}
						});
					}
				});
			});
		});
	}
	
	function deleteMetaData(metaData, endCallback) {
		textClient.exists(metadataPrefix + metaData.id, function (err, doesExist) {
			if (!err &&  doesExist === 1) {
				textClient.del(metadataPrefix + metaData.id, function (err) {
					console.log("deleteMetadata", metaData.id);
					if (endCallback) {
						endCallback(err, metaData);
					}
				});
			} else {
				console.error(err);
			}
		});
	}
	
	/**
	 * 指定されたidのコンテンツ削除
	 * @method deleteContent
	 * @param {JSON} metaData contentメタデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function deleteContent(metaData, endCallback) {
		deleteMetaData(metaData, function (err, metaData) {
			if (!err) {
				console.log("deleteContent", metaData);
				if (metaData.hasOwnProperty('content_id') && metaData.content_id !== '') {
					textClient.exists(contentPrefix + metaData.content_id, function (err, doesExist) {
						if (!err && doesExist === 1) {
							// 参照カウントを減らす.
							textClient.decr(contentRefPrefix + metaData.content_id, function (err, value) {
								if (value <= 0) {
									console.log("reference count zero. delete content");
									textClient.del(contentPrefix + metaData.content_id, function (err) {
										if (!err) {
											textClient.del(contentRefPrefix + metaData.content_id);
											if (endCallback) {
												endCallback(metaData);
											}
										} else {
											console.error(err);
										}
									});
								} else {
									if (endCallback) {
										endCallback(metaData);
									}
								}
							});
						}
					});
				}
			} else {
				console.error(err);
			}
		});
	}

	/**
	 * コンテンツとメタデータのバックアップ(元データは移動される)
	 */
	function backupContent(metaData, endCallback) {
		getMetaData(metaData.type, metaData.id, function (meta) {
			var backupMetaData = {};
			backupMetaData[metaData.date] = JSON.stringify(metaData);
			client.hmset(metadataBackupPrefix + metaData.id, backupMetaData, function (err) {
				getContent(metaData.type, metaData.content_id, function (reply) {
					if (reply) {
						var backupContentData = {};
						backupContentData[metaData.date] = reply;
						client.hmset(contentBackupPrefix + metaData.content_id, backupContentData, function (err, reply) {
							if (endCallback) {
								endCallback(err, reply);
							}
						});
					}
				});
			});
		});
	}
	
	/**
	 * コンテンツ更新
	 * @method updateContent
	 * @param {JSON} metaData メタデータ
	 * @param {BLOB} data     バイナリデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function updateContent(metaData, data, endCallback) {
		var contentData = null;
		console.log("updateContent:" + metaData.id + ":" + metaData.content_id);
		if (metaData.type === 'text') {
			contentData = data;
			metaData.mime = "text/plain";
		} else if (metaData.type === 'image') {
			contentData = data;
			metaData.mime = util.detectImageType(data);
		} else if (metaData.type === 'url') {
			contentData = data;
			metaData.mime = util.detectImageType(data);
		} else {
			console.error("Error undefined type:" + metaData.type);
		}
		
		textClient.exists(contentPrefix + metaData.content_id, function (err, doesExist) {
			if (!err && doesExist === 1) {
				backupContent(metaData, function (err, reply) {
					metaData.date = new Date().toISOString();
					setMetaData(metaData.type, metaData.id, metaData, function (meta) {
						textClient.set(contentPrefix + meta.content_id, contentData, function (err, reply) {
							if (err) {
								console.error("Error on updateContent:" + err);
							} else {
								if (endCallback) {
									endCallback(meta);
								}
							}
						});
					});
				});
			}
		});
	}
	
	function addWindowMetaData(socketid, windowData, endCallback) {
		generateWindowMetaDataID(function (id) {
			if (windowData.hasOwnProperty('id') && windowData.id !== "") {
				id = windowData.id;
			}
			windowData.id = id;
			socketidToHash[socketid] = id;
			console.log("registerWindow: " + id);
			textClient.hexists(windowMetaDataPrefix + id, function (err, reply) {
				if (reply === 1) {
					windowData.type = "window";
					textClient.hmset(windowMetaDataPrefix + id, windowData, (function (textClient, id) {
						return function (err, reply) {
							textClient.hgetall(windowMetaDataPrefix + id, function (err, reply) {
								if (endCallback) {
									endCallback(reply);
								}
							});
						};
					}(textClient, id)));
				} else {
					if (!windowData.hasOwnProperty('orgWidth')) {
						windowData.orgWidth = windowData.width;
					}
					if (!windowData.hasOwnProperty('orgHeight')) {
						windowData.orgHeight = windowData.height;
					}
					
					windowData.type = "window";
					textClient.hmset(windowMetaDataPrefix + id, windowData, (function (textClient, id) {
						return function (err, reply) {
							textClient.hgetall(windowMetaDataPrefix + id, function (err, reply) {
								if (endCallback) {
									endCallback(reply);
								}
							});
						};
					}(textClient, id)));
				}
			});
		});
	}
	
	/**
	 * Window追加
	 * @method addWindow
	 * @param {BLOB} socket socket id
	 * @param {JSON} windowData windowメタデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function addWindow(socketid, windowData, endCallback) {
		console.log("add window");
		addWindowMetaData(socketid, windowData, function (metaData) {
			generateWindowContentID(function (content_id) {
				if (metaData.hasOwnProperty('content_id') && metaData.content_id !== "") {
					content_id = metaData.content_id;
				}
				metaData.content_id = content_id;
				console.log("add window content id:", content_id);
				
				textClient.hmset(windowContentPrefix + content_id, metaData, function (err, reply) {
					if (err) {
						console.error("Error on addWindow:" + err);
					} else {
						
						// 参照カウント.
						textClient.setnx(windowContentRefPrefix + content_id, 0);
						textClient.incr(windowContentRefPrefix + content_id, function (err, value) {
							metaData.reference_count = value;
							textClient.hmset(windowMetaDataPrefix + metaData.id, metaData, function (err, reply) {
								if (endCallback) {
									endCallback(metaData);
								}
							});
						});
					}
				});
			});
		});
	}
	
	/**
	 * VirtualDisplay設定
	 * @method setVirtualDisplay
	 * @param {JSON} windowData VirtualDisplayのWindowデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function setVirtualDisplay(windowData, endCallback) {
		if (windowData) {
			textClient.hmset(virtualDisplayIDStr, windowData, function (err, reply) {
				if (endCallback) {
					endCallback(windowData);
				}
			});
		}
	}
	
	/**
	 * VirtualDisplay取得
	 * @method getVirtualDisplay
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function getVirtualDisplay(endCallback) {
		textClient.hgetall(virtualDisplayIDStr, function (err, data) {
			if (endCallback) {
				if (data) {
					endCallback(data);
				} else {
					endCallback({});
				}
			}
		});
	}
	
	/**
	 * Window取得
	 * @method getWindow
	 * @param {JSON} windowData windowメタデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function getWindowMetaData(windowData, endCallback) {
		if (windowData.hasOwnProperty('type') && windowData.type === 'all') {
			//console.log("getWindowAll");
			textClient.keys(windowMetaDataPrefix + '*', function (err, replies) {
				replies.forEach(function (id, index) {
					//console.log("getWindowAllID:" + id);
					textClient.hgetall(id, function (err, reply) {
						if (err) {
							console.error(err);
						} else {
							if (endCallback && reply) {
								endCallback(reply);
							}
						}
					});
				});
			});
		} else {
			textClient.exists(windowMetaDataPrefix + windowData.id, function (err, doesExist) {
				if (!err && doesExist === 1) {
					textClient.hgetall(windowMetaDataPrefix + windowData.id, function (err, data) {
						if (err) {
							console.error(err);
						} else {
							if (endCallback) {
								endCallback(data);
							}
						}
					});
				} else {
					if (endCallback) {
						endCallback(null);
					}
				}
			});
		}
	}
	
	/**
	 * Window削除
	 * @method deleteWindowMetaData
	 * @param {JSON} metaData windowメタデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function deleteWindowMetaData(metaData, endCallback) {
		textClient.del(windowMetaDataPrefix + metaData.id, function (err) {
			if (!err) {
				console.log("unregister window id:" + metaData.id);
			}
			if (endCallback) {
				endCallback(err, metaData);
			}
		});
	}
	
	/**
	 * Window削除
	 * @method deleteWindow
	 * @param {JSON} windowData windowメタデータJSON
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function deleteWindow(metaData, endCallback) {
		deleteWindowMetaData(metaData, function (err, meta) {
			if (meta.hasOwnProperty('content_id') && meta.content_id !== '') {
				textClient.exists(windowContentPrefix + meta.content_id, function (err, doesExist) {
					if (!err && doesExist === 1) {
						
						textClient.del(windowContentPrefix + meta.content_id, function (err) {
							if (!err) {
								textClient.del(windowContentRefPrefix + meta.content_id);
								if (meta.hasOwnProperty('reference_count')) {
									delete meta.reference_count;
								}
								if (endCallback) {
									endCallback(meta);
								}
							} else {
								console.error(err);
							}
						});
					}
				});
			} else {
				console.error(err);
			}
		});
	}
	
	/**
	 * SocketIDで指定されたWindowの参照カウントをsocketidをもとに減らす
	 * @method decrWindowReferenceCount
	 * @param {string} socketid socket id
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function decrWindowReferenceCount(socketid, endCallback) {
		var id;
		if (socketidToHash.hasOwnProperty(socketid)) {
			id = socketidToHash[socketid];
			
			textClient.exists(windowMetaDataPrefix + id, function (err, doesExist) {
				if (!err && doesExist === 1) {
					textClient.hgetall(windowMetaDataPrefix + id, function (err, data) {
						if (!err && data) {
							// 参照カウントのみを減らす
							textClient.decr(windowContentRefPrefix + data.content_id, function (err, value) {
								data.reference_count = value;
								textClient.hmset(windowMetaDataPrefix + id, data, function (err, result) {
									if (endCallback) {
										endCallback(null, data);
									}
								});
							});
						}
					});
				}
			});
		}
	}
	
	/**
	 * Window更新
	 * @method updateWindowMetaData
	 * @param {BLOB} socketid socket id
	 * @param {JSON} windowData windowメタデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function updateWindowMetaData(socketid, windowData, endCallback) {
		if (!windowData.hasOwnProperty("id")) { return; }
		textClient.hmset(windowMetaDataPrefix + windowData.id, windowData, function (err, reply) {
			if (endCallback) {
				endCallback(windowData);
			}
		});
	}
	
	/**
	 * cursor更新
	 * @method updateMouseCursor
	 * @param {BLOB} socketid socket id
	 * @param {JSON} mouseData mouseメタデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function updateMouseCursor(socketid, mouseData, endCallback) {
		var obj = {data: mouseData, id: socketid};
		if (endCallback) {
			endCallback(obj);
		}
	}
	
	/**
	 * セッションリスト取得。registerWSEventにてコールされる。
	 * @method getSessionList
	 */
	function getSessionList() {
		textClient.smembers('sessions', function (err, replies) {
			replies.forEach(function (id, index) {
				console.log(id + ":" + index);
			});
		});
	}
	
	function addContentCore(metaData, binaryData, endCallback) {
		if (metaData.type === 'url') {
			renderURL(binaryData, function (image, dimension) {
				if (image) {
					metaData.posx = 0;
					metaData.posy = 0;
					metaData.width = dimension.width;
					metaData.height = dimension.height;
					metaData.orgWidth = dimension.width;
					metaData.orgHeight = dimension.height;
					addContent(metaData, image, function (metaData, contentData) {
						if (endCallback) {
							endCallback(null, metaData);
						}
					});
				}
			});
		} else {
			addContent(metaData, binaryData, function (metaData, contentData) {
				if (endCallback) {
					endCallback(null, metaData);
				}
			});
		}
	}
	
	/**
	 * コンテンツの追加を行うコマンドを実行する.
	 * @method commandAddContent
	 * @param {Object} metaData メタデータ
	 * @param {BLOB} binaryData バイナリデータ
	 * @param {Function} endCallback コンテンツ新規追加した場合に終了時に呼ばれるコールバック
	 * @param {Function} updateEndCallback コンテンツ差し替えした場合に終了時に呼ばれるコールバック
	 */
	function commandAddContent(metaData, binaryData, endCallback, updateEndCallback) {
		console.log("commandAddContent", metaData, binaryData);
		
		if (metaData.hasOwnProperty('id') && metaData.id !== "") {
			textClient.exists(metadataPrefix + metaData.id, function (err, doesExists) {
				if (!err && doesExists === 1) {
					getMetaData('', metaData.id, function (meta) {
						var oldContentID,
							newContentID;
						if (metaData.hasOwnProperty('content_id')) {
							oldContentID = metaData.content_id;
						}
						if (meta.hasOwnProperty('content_id')) {
							newContentID = meta.content_id;
						}
						
						
						if (newContentID !== '' && oldContentID === newContentID) {
							updateContent(metaData, binaryData, function (reply) {
								if (updateEndCallback) {
									updateEndCallback(null, reply);
								}
							});
						} else {
							addContentCore(meta, binaryData, endCallback);
						}
					});
				} else {
					addContentCore(metaData, binaryData, endCallback);
				}
			});
		} else {
			addContentCore(metaData, binaryData, endCallback);
		}
	}
	
	/**
	 * コンテンツの取得を行うコマンドを実行する.
	 * @method commandGetContent
	 * @param {JSON} json contentメタデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function commandGetContent(json, endCallback) {
		console.log("commandGetContent:" + json.id);
		getMetaData(json.type, json.id, function (meta) {
			if (meta && meta.hasOwnProperty('content_id') && meta.content_id !== '') {
				//meta.command = Command.doneGetContent;
				if (json.hasOwnProperty('restore_index') && meta.hasOwnProperty('backup_list')) {
					var backupList = JSON.parse(meta.backup_list);
					var backup_date = backupList[Number(json.restore_index)];
					client.hmget(contentBackupPrefix + meta.content_id, backup_date, function (err, reply) {
						endCallback(null, meta, reply[0]);
					});
				} else {
					getContent(meta.type, meta.content_id, function (reply) {
						if (reply === null) {
							reply = "";
						}
						endCallback(null, meta, reply);
					});
				}
			}
		});
	}
	
	/**
	 * メタデータの追加を行うコマンドを実行する.
	 * @method commandAddMetaData
	 * @param {JSON} json contentメタデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function commandAddMetaData(json, endCallback) {
		console.log("commandAddMetaData:", json);
		addMetaData(json, function (metaData) {
			if (endCallback) {
				endCallback(null, metaData);
			}
		});
	}
	
	/**
	 * メタデータの取得を行うコマンドを実行する.
	 * @method commandGetMetaData
	 * @param {JSON} json contentメタデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function commandGetMetaData(json, endCallback) {
		console.log("commandGetMetaData:" + json.type + "/" + json.id);
		getMetaData(json.type, json.id, function (metaData) {
			textClient.exists(metadataBackupPrefix + metaData.id, (function (metaData) {
				return function (err, doesExists) {
					if (doesExists) {
						// バックアップがあった. バックアップのキーリストをmetadataに追加しておく.
						textClient.hkeys(metadataBackupPrefix + metaData.id, function (err, reply) {
							metaData.backup_list = JSON.stringify(reply);
							if (endCallback) {
								endCallback(null, metaData);
							}
						});
					} else {
						if (endCallback) {
							endCallback(null, metaData);
						}
					}
				}
			}(metaData)));
		});
	}
	
	/**
	 * コンテンツの削除を行うコマンドを実行する.
	 * @method commandDeleteContent
	 * @param {JSON} json メタデータリスト
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function commandDeleteContent(json, endCallback) {
		console.log("commandDeleteContent:", json.length);
		var i,
			metaData,
			results = [],
			all_done = json.length,
			syncDelete = function (results, all_done) {
				if (all_done <= 0) {
					if (endCallback) {
						endCallback(null, results);
						return;
					}
				} else {
					var metaData = json[all_done - 1];
					if (metaData.hasOwnProperty('type') && metaData.type === 'all') {
						textClient.keys(metadataPrefix + '*', function (err, replies) {
							replies.forEach(function (id, index) {
								console.log(id);
								textClient.hgetall(id, function (err, data) {
									if (!err && data) {
										deleteContent(data, function (meta) {
											if (endCallback) {
												endCallback(null, meta);
											}
										});
									}
								});
							});
						});
						all_done = 0;
						if (endCallback) {
							endCallback(null, results);
							return;
						}
					} else {
						deleteContent(metaData, function (meta) {
							results.push(meta);
							syncDelete(results, all_done - 1);
						});
					}
				}
			};

			syncDelete(results, all_done);
	}

	/**
	 * コンテンツの更新を行うコマンドを実行する.
	 * @method commandUpdateContent
	 * @param {Object} metaData contentメタデータ
	 * @param {BLOB} binaryData loadMetaBinaryから受領したバイナリデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function commandUpdateContent(metaData, binaryData, endCallback) {
		//console.log("commandUpdateContent");
		updateContent(metaData, binaryData, function (meta) {
			// socket.emit(Command.doneUpdateContent, JSON.stringify({"id" : id}));
			if (endCallback) {
				endCallback(null, meta);
			}
		});
	}
	
	/**
	 * メタデータの更新を行うコマンドを実行する.
	 * @method commandUpdateMetaData
	 * @param {JSON} json windowメタデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	/*
	function commandUpdateMetaData(json, endCallback) {
		//console.log("commandUpdateMetaData:" + json.id);
		textClient.exists(metadataPrefix + json.id, function (err, doesExists) {
			if (!err && doesExists === 1) {
				setMetaData(json.type, json.id, json, function (meta) {
					if (endCallback) {
						endCallback(null, meta);
					}
				});
			}
		});
	}
	*/
	
	/**
	 * メタデータの更新を行うコマンドを実行する.
	 * @method commandUpdateMetaData
	 * @param {JSON} json windowメタデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function commandUpdateMetaData(json, endCallback) {
		console.log("commandUpdateMetaData:", json.length);
		var i,
			metaData,
			results = [],
			all_done = json.length;

		for (i = 0; i < json.length; i = i + 1) {
			metaData = json[i];
			textClient.exists(metadataPrefix + json[i].id, (function (metaData) {
				return function (err, doesExists) {
					if (!err && doesExists === 1) {
						setMetaData(metaData.type, metaData.id, metaData, function (meta) {
							--all_done;
							results.push(meta);
							if (all_done <= 0) {
								if (endCallback) {
									endCallback(null, results);
									return;
								}
							}
						});
					}
				};
			}(metaData)));
		}
	}

	/**
	 * ウィンドウの追加を行うコマンドを実行する.
	 * @method commandAddWindowMetaData
	 * @param {String} socketid ソケットID
	 * @param {JSON} json windowメタデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function commandAddWindowMetaData(socketid, json, endCallback) {
		console.log("commandAddWindowMetaData : " + JSON.stringify(json));
		addWindow(socketid, json, function (windowData) {
			if (endCallback) {
				endCallback(null, [windowData]);
			}
		});
	}
	
	/**
	 * ウィンドウの削除行うコマンドを実行する.
	 * @method commandDeleteWindowMetaData
	 * @param {String} socketid ソケットID
	 * @param {JSON} json windowメタデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function commandDeleteWindowMetaData(socketid, json, endCallback) {
		console.log(commandDeleteWindowMetaData);
		var i,
			meta,
			results = [],
			all_done = json.length;

		for (i = 0; i < json.length; i = i + 1) {
			meta = json[i];
			getWindowMetaData(meta, function (metaData) {
				if (metaData) {
					deleteWindow(metaData, function (meta) {
						--all_done;
						results.push(meta);
						if (all_done <= 0) {
							if (endCallback) {
								endCallback(null, results);
								return;
							}
						}
					});
				} else {
					if (endCallback) {
						endCallback("not exists window metadata", null);
					}
				}
			});
		}
	}
	
	/**
	 * VirtualDisplayの更新を行うコマンドを実行する.
	 * @method commandUpdateVirtualDisplay
	 * @param {String} socketid ソケットID
	 * @param {JSON} json socket.io.on:XXXXXXXXX時JSONデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function commandUpdateVirtualDisplay(socketid, json, endCallback) {
		if (json) {
			setVirtualDisplay(json, function (data) {
				if (endCallback) {
					endCallback(null, data);
				}
			});
		}
	}
	
	/**
	 * VirtualDisplayの取得を行うコマンドを実行する.
	 * @method commandGetVirtualDisplay
	 * @param {String} socketid ソケットID
	 * @param {JSON} json socket.io.on:XXXXXXXXX時JSONデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function commandGetVirtualDisplay(socketid, json, endCallback) {
		getVirtualDisplay(function (data) {
			console.log("commandGetVirtualDisplay", data);
			if (endCallback) {
				endCallback(null, data);
			}
		});
	}

	/**
	 *  グループリストを取得する.
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function commandGetGroupList(endCallback) {
		getGroupList(endCallback);
	}
	
	/**
	 *  グループを追加する.
	 * @param {JSON} json 対象のnameを含むjson
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function commandAddGroup(json, endCallback) {
		var groupColor = "";
		if (json.hasOwnProperty("name") && json.name !== "") {
			if (json.hasOwnProperty("color")) {
				groupColor = json.color;
			}
			addGroup(null, json.name, groupColor, endCallback);
		}
	}

	/**
	 *  グループを削除する.
	 * @param {JSON} json 対象のid, nameを含むjson
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function commandDeleteGroup(json, endCallback) {
		if (json.hasOwnProperty("id") && json.hasOwnProperty("name") && json.name !== "") {
			deleteGroup(json.id, json.name, endCallback);
		}
	}

	/**
	 * グループを更新する
	 * @param {JSON} json 対象のid, nameを含むjson
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function commandUpdateGroup(json, endCallback) {
		if (json.hasOwnProperty("id")) {
			updateGroup(json.id, json, endCallback);
		}
	}

	/**
	 * グループインデックスを変更する.
	 */
	function commandChangeGroupIndex(json, endCallback) {
		if (json.hasOwnProperty("id") && json.hasOwnProperty("index")) {
			changeGroupIndex(json.id, json.index, endCallback);
		}
	}

	/**
	 * 新しい保存領域を作成
	 */
	function commandNewDB(json, endCallback) {
		if (json.hasOwnProperty("name")) {
			newDB(json.name, endCallback);
		}
	}

	/**
	 * DBの参照先保存領域の変更
	 */
	function commandChangeDB(json, endCallback) {
		if (json.hasOwnProperty("name")) {
			changeDB(json.name, endCallback);
		}
	}
	
	/**
	 * DBの保存領域の削除
	 */
	function commandDeleteDB(json, endCallback) {
		if (json.hasOwnProperty("name")) {
			deleteDB(json.name, endCallback);
		}
	}

	/**
	 * DBの保存領域のリストを取得
	 */
	function commandGetDBList(resultCallback) {
		textClient.hgetall(frontPrefix + 'dblist', resultCallback);
	}

	/**
	 * 各種設定の変更
	 */
	function commandChangeSetting(json, endCallback) {
		changeSetting(json, endCallback);
	}

	/**
	 * ウィンドウの取得を行うコマンドを実行する.
	 * @method commandGetWindowMetaData
	 * @param {String} socketid ソケットID
	 * @param {JSON} json socket.io.on:GetWindow時JSONデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function commandGetWindowMetaData(socketid, json, endCallback) {
		var isAllType = json.hasOwnProperty('type') && json.type === 'all',
			isIdentityType = json.hasOwnProperty('id') && json.id !== undefined && json.id !== "undefined" && json.id !== "";
		if (isAllType || isIdentityType) {
			getWindowMetaData(json, function (windowData) {
				console.log("doneGetWindow:", windowData);
				if (endCallback) {
					endCallback(null, windowData);
				}
			});
		}
	}
	
	/**
	 * ウィンドウの更新を行うコマンドを実行する.
	 * @method commandUpdateWindowMetaData
	 * @param {String} socketid ソケットID
	 * @param {JSON} json socket.io.on:UpdateWindowMetaData時JSONデータ,
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	/*
	function commandUpdateWindowMetaData(socketid, json, endCallback) {
		updateWindowMetaData(socketid, json, function (windowData) {
			endCallback(null, windowData);
		});
	}
	*/

	/**
	 * ウィンドウの更新を行うコマンドを実行する.
	 * @method commandUpdateWindowMetaData
	 * @param {String} socketid ソケットID
	 * @param {JSON} json socket.io.on:UpdateWindowMetaData時JSONデータ,
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function commandUpdateWindowMetaData(socketid, json, endCallback) {
		console.log("commandUpdateWindowMetaData:", json.length);
		var i,
			metaData,
			results = [],
			all_done = json.length;

		for (i = 0; i < json.length; i = i + 1) {
			metaData = json[i];
			updateWindowMetaData(socketid, metaData, function (meta) {
				--all_done;
				results.push(meta);
				if (all_done <= 0) {
					if (endCallback) {
						endCallback(null, results);
						return;
					}
				}
			});
		}
	}

    /**
     * mouseコマンドを実行する.
     * リモートマウスカーソル表示のために HSV カラーを新規接続に応じて生成する
     * @method commandUpdateMouseCursor
     * @param {String} socketid ソケットID
     * @param {JSON} json socket.io.on:UpdateMouseCursor時JSONデータ,
     * @param {Function} endCallback 終了時に呼ばれるコールバック
     */
    function commandUpdateMouseCursor(socketid, json, endCallback) {
        var c, i, j;
        if(!connectionId.hasOwnProperty(socketid)){
            connectionId[socketid] = connectionCount;
            ++connectionCount;
        }
        json.connectionCount = connectionId[socketid];
        i = connectionId[socketid] % 14;
        // hsv は約 7 分割されるような循環
        // 奇数回周目は v を半減させ視認性を上げる
        if(i < 7){
            j = 1.0;
        }else{
            j = 0.5;
        }
        c = hsv(49.21875 * connectionId[socketid], 1.0, j);
        if(c){
            c[0] = Math.floor(c[0] * 255);
            c[1] = Math.floor(c[1] * 255);
            c[2] = Math.floor(c[2] * 255);
            json.hsv = 'rgb(' + (c.join(',')) + ')';
        }
        updateMouseCursor(socketid, json, function (windowData) {
            endCallback(null, windowData);
        });
    }

	/**
	 * update処理実行後のブロードキャスト用ラッパー.
	 * @method post_update
	 */
	function post_update(ws, io, resultCallback) {
		return function (err, reply) {
			ws_connector.broadcast(ws, Command.Update);
			io_connector.broadcast(io, Command.Update);
			if (resultCallback) {
				resultCallback(err, reply);
			}
		};
	}
	
	/**
	 * updateMetaData処理実行後のブロードキャスト用ラッパー.
	 * @method post_updateMetaData
	 */
	function post_updateMetaData(ws, io, resultCallback) {
		return function (err, reply) {
			ws_connector.broadcast(ws, Command.UpdateMetaData, reply);
			io_connector.broadcast(io, Command.UpdateMetaData, reply);
			if (resultCallback) {
				resultCallback(err, reply);
			}
		};
	}
	
	function post_updateGroup(ws, io, resultCallback) {
		return function (err, reply) {
			ws_connector.broadcast(ws, Command.UpdateGroup, reply);
			io_connector.broadcast(io, Command.UpdateGroup, reply);
			if (resultCallback) {
				resultCallback(err, reply);
			}
		};
	}

	/**
	 * updateContent処理実行後のブロードキャスト用ラッパー.
	 * @method post_updateContent
	 */
	function post_updateContent(ws, io, resultCallback) {
		return function (err, reply) {
			ws_connector.broadcast(ws, Command.UpdateContent, reply);
			io_connector.broadcast(io, Command.UpdateContent, reply);
			if (resultCallback) {
				resultCallback(err, reply);
			}
		};
	}

	/**
	 * updateDB処理実行後のブロードキャスト用ラッパー.
	 * @method post_updateContent
	 */
	function post_updateDB(ws, io, resultCallback) {
		return function (err, reply) {
			ws_connector.broadcast(ws, Command.UpdateContent, reply);
			io_connector.broadcast(io, Command.UpdateContent, reply);
			if (resultCallback) {
				resultCallback(err, reply);
			}
		};
	}
	
	/**
	 * deletecontent処理実行後のブロードキャスト用ラッパー.
	 * @method post_deleteContent
	 */
	function post_deleteContent(ws, io, resultCallback) {
		return function (err, reply) {
			ws_connector.broadcast(ws, Command.DeleteContent, reply);
			io_connector.broadcast(io, Command.DeleteContent, reply);
			if (resultCallback) {
				resultCallback(err, reply);
			}
		};
	}

	/**
	 * deleteWindow処理実行後のブロードキャスト用ラッパー.
	 * @method post_deleteWindow
	 */
	function post_deleteWindow(ws, io, ws_connections, resultCallback) {
		return function (err, reply) {
			var socketid,
				id,
				i;
			ws_connector.broadcast(ws, Command.DeleteWindowMetaData, reply);
			io_connector.broadcast(io, Command.DeleteWindowMetaData, reply);
			
			for (socketid in socketidToHash) {
				if (socketidToHash.hasOwnProperty(socketid)) {
					id = socketidToHash[socketid];
					for (i = 0; i < reply.length; i = i + 1) {
						if (reply[i].id === id) {
							if (ws_connections.hasOwnProperty(socketid)) {
								ws_connector.send(ws_connections[socketid], Command.Disconnect);
							}
						}
					}
					delete socketidToHash[socketid];
				}
			}
			if (resultCallback) {
				resultCallback(err, reply);
			}
		};
	}
	
	/**
	 * updateWindowMetaData処理実行後のブロードキャスト用ラッパー.
	 * @method post_updateWindowMetaData
	 */
	function post_updateWindowMetaData(ws, io, resultCallback) {
		return function (err, reply) {
			ws_connector.broadcast(ws, Command.UpdateWindowMetaData, reply);
			io_connector.broadcast(io, Command.UpdateWindowMetaData, reply);
			if (resultCallback) {
				resultCallback(err, reply);
			}
		};
	}
	
	/**
	 * updateMouseCursor処理実行後のブロードキャスト用ラッパー.
	 * @method post_updateMouseCursor
	 */
	function post_updateMouseCursor(ws, io, resultCallback) {
		return function (err, reply) {
			ws_connector.broadcast(ws, Command.UpdateMouseCursor, reply);
			io_connector.broadcast(io, Command.UpdateMouseCursor, reply);
			if (resultCallback) {
				resultCallback(err, reply);
			}
		};
	}
	
	/**
	 * websocketイベントの登録を行う.
	 * register websockets events
	 * @method registerWSEvent
	 * @param {String} socketid ソケットID
	 * @param {BLOB} ws_connection WebSocketコネクション
	 * @param {BLOB} io socket.ioオブジェクト
	 * @param {BLOB} ws WebSocketオブジェクト
	 */
	function registerWSEvent(ws_connection, io, ws) {
		var methods = {};

		console.log("registerWSEvent");
		
		ws_connector.on(Command.AddMetaData, function (data, resultCallback) {
			commandAddMetaData(data, resultCallback);
		});
		
		ws_connector.on(Command.GetMetaData, function (data, resultCallback) {
			commandGetMetaData(data, resultCallback);
		});

		ws_connector.on(Command.GetContent, function (data, resultCallback) {
			commandGetContent(data, resultCallback);
		});
		
		ws_connector.on(Command.UpdateMetaData, function (data, resultCallback) {
			commandUpdateMetaData(data, post_updateMetaData(ws, io, resultCallback));
		});
		
		ws_connector.on(Command.AddWindowMetaData, function (data, resultCallback, socketid) {
			commandAddWindowMetaData(socketid, data, post_updateWindowMetaData(ws, io, resultCallback));
		});
		
		ws_connector.on(Command.GetWindowMetaData, function (data, resultCallback, socketid) {
			commandGetWindowMetaData(socketid, data, resultCallback);
		});
		
		ws_connector.on(Command.UpdateWindowMetaData, function (data, resultCallback, socketid) {
			commandUpdateWindowMetaData(socketid, data, post_updateWindowMetaData(ws, io, resultCallback));
		});

		ws_connector.on(Command.DeleteWindowMetaData, function (data, resultCallback, socketid) {
			commandDeleteWindowMetaData(socketid, data, post_deleteWindow(ws, io, ws_connections, resultCallback));
		});

		ws_connector.on(Command.UpdateMouseCursor, function(data, resultCallback, socketid){
			commandUpdateMouseCursor(socketid, data, post_updateMouseCursor(ws, io, resultCallback));
		});
		
		ws_connector.on(Command.UpdateVirtualDisplay, function (data, resultCallback, socketid) {
			commandUpdateVirtualDisplay(socketid, data, post_updateWindowMetaData(ws, io, resultCallback));
		});
		
		ws_connector.on(Command.GetVirtualDisplay, function (data, resultCallback, socketid) {
			commandGetVirtualDisplay(socketid, data, resultCallback);
		});

		ws_connector.on(Command.GetGroupList, function (data, resultCallback) {
			commandGetGroupList(resultCallback);
		});
		
		ws_connector.on(Command.AddGroup, function (data, resultCallback) {
			commandAddGroup(data, post_updateGroup(ws, io, resultCallback));
		});

		ws_connector.on(Command.DeleteGroup, function (data, resultCallback) {
			commandDeleteGroup(data, post_updateGroup(ws, io, resultCallback));
		});

		ws_connector.on(Command.UpdateGroup, function (data, resultCallback) {
			commandUpdateGroup(data, post_updateGroup(ws, io, resultCallback));
		});
		
		ws_connector.on(Command.ChangeGroupIndex, function (data, resultCallback) {
			commandChangeGroupIndex(data, post_updateGroup(ws, io, resultCallback));
		});

		ws_connector.on(Command.ShowWindowID, function (data, resultCallback) {
			ws_connector.broadcast(ws, Command.ShowWindowID, data);
			io_connector.broadcast(io, Command.ShowWindowID, data);
			if (resultCallback) {
				resultCallback();
			}
		});

		ws_connector.on(Command.SendMessage, function (data, resultCallback) {
			ws_connector.broadcast(ws, Command.SendMessage, data);
			io_connector.broadcast(io, Command.SendMessage, data);
			if (resultCallback) {
				resultCallback();
			}
		});
		
		ws_connector.on(Command.AddContent, function (data, resultCallback) {
			var metaData = data.metaData,
				binaryData = data.contentData;
			console.log(Command.AddContent, data);
			commandAddContent(metaData, binaryData, post_update(ws, io, resultCallback), post_updateContent(ws, io, resultCallback));
		});
		
		ws_connector.on(Command.DeleteContent, function (data, resultCallback) {
			commandDeleteContent(data, post_deleteContent(ws, io, resultCallback));
		});

		ws_connector.on(Command.UpdateContent, function (data, resultCallback) {
			var metaData = data.metaData,
				binaryData = data.contentData;
			commandUpdateContent(metaData, binaryData, post_updateContent(ws, io, resultCallback));
		});

		ws_connector.on(Command.NewDB, function (data, resultCallback) {
			commandNewDB(data, post_update(ws, io, resultCallback));
		});
		ws_connector.on(Command.ChangeDB, function (data, resultCallback) {
			commandChangeDB(data, post_update(ws, io, resultCallback));
		});
		ws_connector.on(Command.DeleteDB, function (data, resultCallback) {
			commandDeleteDB(data, post_update(ws, io, resultCallback));
		});
		ws_connector.on(Command.GetDBList, function (data, resultCallback) {
			commandGetDBList(resultCallback);
		});

		ws_connector.on(Command.ChangeSetting, function (data, resultCallback) {
			commandChangeSetting(data, post_updateSetting(ws, io, resultCallback));
		});

		getSessionList();
		ws_connector.registerEvent(ws, ws_connection);

		
		console.log("registerWSEvent End");
	}
	
	/**
	 * socketioイベントの登録を行う.
	 * @method registerEvent
	 * @param {BLOB} socket socket.ioオブジェクト
	 * @param {BLOB} io socket.ioオブジェクト
	 * @param {BLOB} ws WebSocketオブジェクト
	 */
	function registerEvent(io, socket, ws, ws_connections) {
		var methods = {};

		io_connector.on(Command.AddContent, function (data, resultCallback) {
			var metaData = data.metaData,
				binaryData = data.contentData;
			commandAddContent(metaData, binaryData, post_update(ws, io, resultCallback), post_updateContent(ws, io, resultCallback));
		});

		io_connector.on(Command.AddMetaData, function (data, resultCallback) {
			commandAddMetaData(data, resultCallback);
		});
		
		io_connector.on(Command.GetContent, function (data, resultCallback) {
			commandGetContent(data, resultCallback);
		});

		io_connector.on(Command.GetMetaData, function (data, resultCallback) {
			commandGetMetaData(data, resultCallback);
		});

		io_connector.on(Command.DeleteContent, function (data, resultCallback) {
			commandDeleteContent(data, post_deleteContent(ws, io, resultCallback));
		});

		io_connector.on(Command.UpdateContent, function (data, resultCallback) {
			var metaData = data.metaData,
				binaryData = data.contentData;
			
			commandUpdateContent(metaData, binaryData, post_updateContent(ws, io, resultCallback));
		});

		io_connector.on(Command.UpdateMetaData, function (data, resultCallback) {
			commandUpdateMetaData(data, post_updateMetaData(ws, io, resultCallback));
		});

		io_connector.on(Command.AddWindowMetaData, function (data, resultCallback, socketid) {
			commandAddWindowMetaData(socketid, data, post_updateWindowMetaData(ws, io, resultCallback));
		});

		io_connector.on(Command.GetWindowMetaData, function (data, resultCallback, socketid) {
			commandGetWindowMetaData(socketid, data, resultCallback);
		});

		io_connector.on(Command.UpdateWindowMetaData, function (data, resultCallback, socketid) {
			commandUpdateWindowMetaData(socketid, data, post_updateWindowMetaData(ws, io, resultCallback));
		});

		io_connector.on(Command.DeleteWindowMetaData, function (data, resultCallback, socketid) {
			commandDeleteWindowMetaData(socketid, data, post_deleteWindow(ws, io, ws_connections, resultCallback));
		});

		io_connector.on(Command.UpdateMouseCursor, function(data, resultCallback, socketid){
			commandUpdateMouseCursor(socketid, data, post_updateMouseCursor(ws, io, resultCallback));
		});

        io_connector.on(Command.UpdateVirtualDisplay, function (data, resultCallback, socketid) {
			commandUpdateVirtualDisplay(socketid, data, post_updateWindowMetaData(ws, io, resultCallback));
		});

		io_connector.on(Command.GetVirtualDisplay, function (data, resultCallback, socketid) {
			commandGetVirtualDisplay(socketid, data, resultCallback);
		});
		
		io_connector.on(Command.GetGroupList, function (data, resultCallback) {
			commandGetGroupList(resultCallback);
		});

		io_connector.on(Command.AddGroup, function (data, resultCallback) {
			commandAddGroup(data, post_updateGroup(ws, io, resultCallback));
		});

		io_connector.on(Command.DeleteGroup, function (data, resultCallback) {
			commandDeleteGroup(data, post_updateGroup(ws, io, resultCallback));
		});

		io_connector.on(Command.UpdateGroup, function (data, resultCallback) {
			commandUpdateGroup(data, post_updateGroup(ws, io, resultCallback));
		});

		io_connector.on(Command.ChangeGroupIndex, function (data, resultCallback) {
			commandChangeGroupIndex(data, post_updateGroup(ws, io, resultCallback));
		});

		io_connector.on(Command.ShowWindowID, function (data, resultCallback) {
			ws_connector.broadcast(ws, Command.ShowWindowID, data);
			io_connector.broadcast(io, Command.ShowWindowID, data);
		});

		io_connector.on(Command.SendMessage, function (data, resultCallback) {
			ws_connector.broadcast(ws, Command.SendMessage, data);
			io_connector.broadcast(io, Command.SendMessage, data);
			if (resultCallback) {
				resultCallback();
			}
		});

		io_connector.on(Command.NewDB, function (data, resultCallback) {
			commandNewDB(data, post_update(ws, io, resultCallback));
		});
		io_connector.on(Command.ChangeDB, function (data, resultCallback) {
			commandChangeDB(data, post_update(ws, io, resultCallback));
		});
		io_connector.on(Command.DeleteDB, function (data, resultCallback) {
			commandDeleteDB(data, post_update(ws, io, resultCallback));
		});
		io_connector.on(Command.GetDBList, function (data, resultCallback) {
			commandGetDBList(resultCallback);
		});

		io_connector.on(Command.ChangeSetting, function (data, resultCallback) {
			commandChangeSetting(data, post_updateSetting(ws, io, resultCallback));
		});

		io_connector.registerEvent(io, socket);
	}
	
	/**
	 * UUIDを登録する.
	 * @method registerUUID
	 * @param {String} id UUID
	 */
	function registerUUID(id) {
		uuidPrefix = id + ":";
		textClient.hset(frontPrefix + 'dblist', "default", id);
		contentPrefix = frontPrefix + uuidPrefix + contentPrefix;
		contentRefPrefix = frontPrefix + uuidPrefix + contentRefPrefix;
		contentBackupPrefix = frontPrefix + uuidPrefix + contentBackupPrefix;
		metadataPrefix = frontPrefix + uuidPrefix + metadataPrefix;
		metadataBackupPrefix = frontPrefix + uuidPrefix + metadataBackupPrefix;
		windowMetaDataPrefix = frontPrefix + uuidPrefix + windowMetaDataPrefix;
		windowContentPrefix = frontPrefix + uuidPrefix + windowContentPrefix;
		windowContentRefPrefix = frontPrefix + uuidPrefix + windowContentRefPrefix;
		virtualDisplayIDStr = frontPrefix + uuidPrefix + virtualDisplayIDStr;
		groupListPrefix = frontPrefix + uuidPrefix + groupListPrefix;
		settingPrefix = frontPrefix + uuidPrefix + settingPrefix;
		console.log("idstr:" + contentPrefix);
		console.log("idstr:" + contentRefPrefix);
		console.log("idstr:" + metadataPrefix);
		console.log("idstr:" + windowMetaDataPrefix);
		console.log("idstr:" + windowContentPrefix);
		console.log("idstr:" + windowContentRefPrefix);
		console.log("idstr:" + groupListPrefix);
		console.log("idstr:" + contentBackupPrefix);
		console.log("idstr:" + metadataBackupPrefix);
		addGroup("group_defalut", "default", function (err, reply) {} );
	}

	/**
	 * HSV 色空間の値から RGB を生成して返す.
	 * @method hsv
	 * @param {number} h hue
	 * @param {number} s saturation
	 * @param {number} v value
	 */
    function hsv(h, s, v){
        if(s > 1 || v > 1){return;}
        var th = h % 360;
        var i = Math.floor(th / 60);
        var f = th / 60 - i;
        var m = v * (1 - s);
        var n = v * (1 - s * f);
        var k = v * (1 - s * (1 - f));
        var color = new Array();
        if(!s > 0 && !s < 0){
            color.push(v, v, v);
        } else {
            var r = new Array(v, n, m, m, k, v);
            var g = new Array(k, v, v, n, m, m);
            var b = new Array(m, m, k, v, v, n);
            color.push(r[i], g[i], b[i]);
        }
        return color;
    }

	Operator.prototype.getContent = getContent;
	Operator.prototype.registerEvent = registerEvent;
	Operator.prototype.registerWSEvent = registerWSEvent;
	Operator.prototype.registerUUID = registerUUID;
	Operator.prototype.decrWindowReferenceCount = decrWindowReferenceCount;
	Operator.prototype.commandGetContent = commandGetContent;
	Operator.prototype.commandGetMetaData = commandGetMetaData;
	Operator.prototype.commandGetWindowMetaData = commandGetWindowMetaData;
	Operator.prototype.commandGetGroupList = commandGetGroupList;
	Operator.prototype.commandAddWindowMetaData = commandAddWindowMetaData;
	Operator.prototype.commandUpdateWindowMetaData = commandUpdateWindowMetaData;
	Operator.prototype.commandUpdateMouseCursor = commandUpdateMouseCursor;
	Operator.prototype.commandUpdateMetaData = commandUpdateMetaData;
	module.exports = new Operator();
}());
