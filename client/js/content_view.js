/*jslint devel:true*/
(function () {
	"use strict";
	/**
	 * コンテンツを追加できるメインビュー
	 */
	
	var ContentView;

	ContentView = function () {
		EventEmitter.call(this);
	};
	ContentView.prototype = Object.create(EventEmitter.prototype);

	/**
	 * コンテンツタイプから適切なタグ名を取得する.
	 * @parma {String} contentType コンテンツタイプ
	 */
	function getTagName(contentType) {
		var tagName;
		if (contentType === 'text') {
			tagName = 'pre';
		} else if (contentType === 'video') {
			tagName = 'img'; // videoでvideoを保持してない場合用
		} else if (contentType === 'pdf') {
			tagName = 'canvas';
		} else {
			tagName = 'img';
		}
		return tagName;
	}

	/**
	 * コンテンツをメインビューにインポートする。
	 * doneGetContent時にコールされる。
	 * @method importContentToView
	 * @param {JSON} metaData メタデータ
	 * @param {BLOB} contentData コンテンツデータ
	 */
	ContentView.prototype.import_content = function (gui, metaDataDict, metaData, contentData, groupDict, videoElem) {
		var previewArea = gui.get_content_preview_area(),
			id,
			contentElem,
			elem,
			tagName,
			blob,
			mime = "image/jpeg";
		
		if (Validator.isLayoutType(metaData)) {
			return;
		}

		//console.log("importContentToView:" + JSON.stringify(metaData));
		tagName = getTagName(metaData.type);
		
		// メタデータはGetMetaDataで取得済のものを使う.
		// GetContent送信した後にさらにGetMetaDataしてる場合があるため.
		if (metaDataDict.hasOwnProperty(metaData.id)) {
			metaData = metaDataDict[metaData.id];
		}
		
		if (document.getElementById(metaData.id)) {
			contentElem = document.getElementById(metaData.id);
		}
		
		if (!contentElem && !videoElem) {
			contentElem = document.createElement(tagName);
			contentElem.id = metaData.id;
			contentElem.style.position = "absolute";

			this.emit(ContentView.EVENT_SETUP_CONTENT, null, contentElem, metaData.id);
			this.emit(ContentView.EVENT_INSERT_CONTENT, null, previewArea, contentElem);
		}
		if (videoElem) {
			videoElem.id = metaData.id;
			videoElem.style.position = "absolute";
			videoElem.setAttribute('autoplay', '')
			videoElem.setAttribute("controls", "");
			videoElem.setAttribute("controlslist", "nodownload")
			videoElem.style.color = "white";
			this.emit(ContentView.EVENT_SETUP_CONTENT, null, videoElem, metaData.id);
			this.emit(ContentView.EVENT_INSERT_CONTENT, null, previewArea, videoElem);
		}

		console.log("id=" + metaData.id);
		if (contentData) {
			if (metaData.type === 'text') {
				// contentData is text
				contentElem.innerHTML = contentData;
				contentElem.style.color = "white";
				contentElem.style.overflow = "visible"; // Show all text
				vscreen_util.assignMetaData(contentElem, metaData, true, groupDict);
			} else if (metaData.type === 'video') {
				//contentElem.src = contentData;
				if (videoElem) {
					vscreen_util.assignMetaData(videoElem, metaData, true, groupDict);
				} else {
					contentElem.src = contentData;
					contentElem.onload = function () {
						if (metaData.width < 10) {
							console.log("naturalWidth:" + contentElem.naturalWidth);
							metaData.width = contentElem.naturalWidth;
						}
						if (metaData.height < 10) {
							console.log("naturalHeight:" + contentElem.naturalHeight);
							metaData.height = contentElem.naturalHeight;
						}
						vscreen_util.assignMetaData(contentElem, metaData, true,groupDict);
					};
				}
			} else if (metaData.type === 'pdf') {
				vscreen_util.assignMetaData(contentElem, metaData, true, groupDict);
				var context = contentElem.getContext('2d');

				var pdfjsLib = window['pdfjs-dist/build/pdf'];

				pdfjsLib.getDocument(contentData).then(function (pdf) {
					var loadPage = function (pn) {
						pdf.getPage(pn).then(function (page) {
							var width = 640;
							var viewport = page.getViewport(width / page.getViewport(1).width);
	
							contentElem.width = viewport.width;
							contentElem.height = viewport.height;
	
							page.render({
								canvasContext: context,
								viewport: viewport
							}).then(function () {
							});
						}.bind(this));
					}.bind(this);

					var pn = 1;
					loadPage(pn);

					contentElem.addEventListener('click', function (event) {
						// マウスクリック位置の把握
						var rect = contentElem.getBoundingClientRect();
						var x = event.clientX - rect.x;

						if (x < rect.width / 2.0) { // もしクリック位置が半分より左なら
							pn = Math.max(pn - 1, 1); // ページを1つ前に戻す
						} else { // もしクリック位置が半分より右なら
							pn = Math.min(pn + 1, pdf.numPages); // ページを1つ次に進める
						}
						loadPage(pn);
					});
				}.bind(this));
			} else {
				// contentData is blob
				if (metaData.hasOwnProperty('mime')) {
					mime = metaData.mime;
					console.log("mime:" + mime);
				}
				blob = new Blob([contentData], {type: mime});
				if (contentElem && blob) {
					URL.revokeObjectURL(contentElem.src);
					contentElem.src = URL.createObjectURL(blob);

					contentElem.onload = function () {
						if (metaData.width < 10) {
							console.log("naturalWidth:" + contentElem.naturalWidth);
							metaData.width = contentElem.naturalWidth;
						}
						if (metaData.height < 10) {
							console.log("naturalHeight:" + contentElem.naturalHeight);
							metaData.height = contentElem.naturalHeight;
						}
						vscreen_util.assignMetaData(contentElem, metaData, true,groupDict);
					};
				}
			}
			this.emit(ContentView.EVENT_TOGGLE_MARK, null, contentElem, metaData);
		}
		
		// 同じコンテンツを参照しているメタデータがあれば更新
		if (!contentData && contentElem) {
			this.emit(ContentView.EVENT_COPY_CONTENT, null, null, contentElem, metaData, false);
		} else {
			this.emit(ContentView.EVENT_COPY_CONTENT, null, contentElem, null, metaData, false);
		}
	}

	ContentView.EVENT_SETUP_CONTENT = "setup_content";
	ContentView.EVENT_COPY_CONTENT = "copy_content";
	ContentView.EVENT_INSERT_CONTENT = "insert_content";
	ContentView.EVENT_TOGGLE_MARK = "toggle_mark";
	
	// singleton
	window.content_view = new ContentView();
}());