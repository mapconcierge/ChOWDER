
(function (gui) {
	
	/**
	 * Propertyタブに入力プロパティを追加する
	 * @method addInputProperty
	 * @param {Object} input element id
	 * @param {String} leftLabel 左ラベル
	 * @param {String} rightLabel 右ラベル
	 * @param {String} value 初期入力値
	 */
	function addInputProperty(id, leftLabel, rightLabel, value) {
		/*
			<div class="input-group">
				<span class="input-group-addon">x</span>
				<input type="text" class="form-control" id="content_transform_x" value="0">
				<span class="input-group-addon">px</span>
			</div>
		*/
		var transInput = document.getElementById('transform_input'),
			group = document.createElement('div'),
			leftSpan = document.createElement('span'),
			rightSpan = document.createElement('span'),
			input = document.createElement('input');
		
		group.className = "input-group";
		leftSpan.className = "input-group-addon";
		leftSpan.innerHTML = leftLabel;
		rightSpan.className = "input-group-addon";
		rightSpan.innerHTML = rightLabel;
		input.className = "form-control";
		input.id = id;
		input.value = value;
		//input.nodeType = "text";
		
		group.appendChild(leftSpan);
		group.appendChild(input);
		if (rightLabel) {
			group.appendChild(rightSpan);
		}
		transInput.appendChild(group);
	}
	

	/**
	 * Property表示領域初期化。selectされたtypeに応じて作成されるelementが変更される。
	 * @method initPropertyArea
	 * @param {String} id ContentもしくはDisplay ID
	 * @param {String} type 設定タイプ
	 * @param {String} mime mime
	 */
	function initPropertyArea(id, type, mime) {
		var contentX,
			contentY,
			contentW,
			contentH,
			contentZ,
			wholeW,
			wholeH,
			wholeSplitX,
			wholeSplitY,
			transInput = document.getElementById('transform_input'),
			idlabel = document.getElementById('content_id_label'),
			idtext = document.getElementById('content_id'),
			downloadButton = document.getElementById('download_button'),
			extension,
			rectChangeFunc = window.content_property.on_rect_changed;
		console.log("initPropertyArea");
		if (id) {
			document.getElementById('content_id').innerHTML = id;
		} else {
			document.getElementById('content_id').innerHTML = "";
		}
		transInput.innerHTML = "";
		if (type === "display") {
			idlabel.innerHTML = "Display ID:";
			addInputProperty('content_transform_x', 'x', 'px', '0');
			addInputProperty('content_transform_y', 'y', 'px', '0');
			addInputProperty('content_transform_w', 'w', 'px', '0');
			addInputProperty('content_transform_h', 'h', 'px', '0');
			contentX = document.getElementById('content_transform_x');
			contentY = document.getElementById('content_transform_y');
			contentW = document.getElementById('content_transform_w');
			contentH = document.getElementById('content_transform_h');
			contentX.onchange = rectChangeFunc;
			contentY.onchange = rectChangeFunc;
			contentW.onchange = rectChangeFunc;
			contentH.onchange = rectChangeFunc;
			downloadButton.style.display = "none";
			
		} else if (type === "whole_window") {
			idlabel.innerHTML = "Virtual Display Setting";
			idtext.innerHTML = "";
			addInputProperty('whole_width', 'w', 'px', '1000');
			addInputProperty('whole_height', 'h', 'px', '900');
			addInputProperty('whole_split_x', 'split x', '', '1');
			addInputProperty('whole_split_y', 'split y', '', '1');
			wholeW = document.getElementById('whole_width');
			wholeH = document.getElementById('whole_height');
			wholeSplitX = document.getElementById('whole_split_x');
			wholeSplitY = document.getElementById('whole_split_y');
			wholeW.onchange = function () {
				window.content_property.on_display_value_changed();
			};
			wholeH.onchange = function () {
				window.content_property.on_display_value_changed();
			};
			wholeSplitX.onchange = function () {
				window.content_property.on_change_whole_split(this.value, wholeSplitY.value);
			};
			wholeSplitY.onchange = function () {
				window.content_property.on_change_whole_split(wholeSplitX.value, this.value);
			};
			downloadButton.style.display = "none";
		} else { // content (text, image, url... )
			idlabel.innerHTML = "Content ID:";
			addInputProperty('content_transform_x', 'x', 'px', '0');
			addInputProperty('content_transform_y', 'y', 'px', '0');
			addInputProperty('content_transform_w', 'w', 'px', '0');
			addInputProperty('content_transform_h', 'h', 'px', '0');
			addInputProperty('content_transform_z', 'z', 'index', '0');
			contentX = document.getElementById('content_transform_x');
			contentY = document.getElementById('content_transform_y');
			contentW = document.getElementById('content_transform_w');
			contentH = document.getElementById('content_transform_h');
			contentZ = document.getElementById('content_transform_z');
			contentX.onchange = rectChangeFunc;
			contentY.onchange = rectChangeFunc;
			contentW.onchange = rectChangeFunc;
			contentH.onchange = rectChangeFunc;
			contentZ.onchange = function () {
				var val = parseInt(contentZ.value, 10);
				window.content_property.on_change_zindex(val);
			};
			downloadButton.style.display = "block";
			downloadButton.href = "download?" + id;
			downloadButton.target = "_blank";
			if (type === "text") {
				downloadButton.download = id + ".txt";
			} else {
				// image or url
				if (mime) {
					extension = mime.split('/')[1];
					downloadButton.download = id + "." + extension;
				} else {
					downloadButton.download = id + ".img";
				}
			}
		}
	}

	/**
	 * Propertyエリアパラメータ消去
	 * @method clearProperty
	 */
	function clear() {
		var transx = document.getElementById('content_transform_x'),
			transy = document.getElementById('content_transform_y'),
			transw = document.getElementById('content_transform_w'),
			transh = document.getElementById('content_transform_h'),
			transz = document.getElementById('content_transform_z'),
			dlbtn  = document.getElementById('download_button'),
			content_id = document.getElementById('content_id');
		if (transx) { transx.value = 0; }
		if (transy) { transy.value = 0; }
		if (transw) { transw.value = 0; }
		if (transh) { transh.value = 0; }
		if (transz) { transz.value = 0; }
		if (content_id) { content_id.innerHTML = ""; }
		if (dlbtn) { dlbtn.style.display = 'none'; }
	}

	function init(id, type, mime) {
		initPropertyArea(id, type, mime);
	}

	/**
	 * 選択されているVirtualDisplayをPropertyエリアのパラメータに設定
	 * @method assignVirtualDisplayProperty
	 */
	function assignVirtualDisplayProperty(whole, splitCount) {
		var wholeWidth = document.getElementById('whole_width'),
			wholeHeight = document.getElementById('whole_height'),
			wholeSplitX = document.getElementById('whole_split_x'),
			wholeSplitY = document.getElementById('whole_split_y');

		if (wholeWidth) {
			wholeWidth.value = parseInt(whole.orgW, 10);
		}
		if (wholeHeight) {
			wholeHeight.value = parseInt(whole.orgH, 10);
		}
		if (wholeSplitX) {
			wholeSplitX.value = splitCount.x;
		}
		if (wholeSplitY) {
			wholeSplitY.value = splitCount.y;
		}
	}

	/**
	 * Viewスケール設定
	 * @method assignViewSetting
	 */
	function assignViewSetting(wholeScale, isFreeMode, isDisplayMode) {
		/*
		var scale_current = document.getElementById('scale_dropdown_current'),
			snap_current = document.getElementById('snap_dropdown_current');
		
		scale_current.innerHTML = wholeScale;
		if (isFreeMode) {
			snap_current.innerHTML = 'Free';
		} else if (isDisplayMode) {
			snap_current.innerHTML = 'Display';
		} else {
			// grid
			snap_current.innerHTML = 'Grid';
		}
		*/
	}
	
	/**
	 * メタデータをPropertyエリアに反映
	 * @method assignContentProperty
	 * @param {JSON} metaData メタデータ
	 */
	function assignContentProperty(metaData) {
		console.log("assignContentProperty:" + JSON.stringify(metaData));
		var transx = document.getElementById('content_transform_x'),
			transy = document.getElementById('content_transform_y'),
			transw = document.getElementById('content_transform_w'),
			transh = document.getElementById('content_transform_h'),
			transz = document.getElementById('content_transform_z');
		
		transx.value = parseInt(metaData.posx, 10);
		transy.value = parseInt(metaData.posy, 10);
		transw.value = parseInt(metaData.width, 10);
		transh.value = parseInt(metaData.height, 10);
		if (metaData.hasOwnProperty('zIndex')) {
			transz.value = parseInt(metaData.zIndex, 10);
		}
	}

	window.content_property = {}
	window.content_property.init = init;
	window.content_property.clear = clear;
	window.content_property.assign_virtual_display = assignVirtualDisplayProperty;
	window.content_property.on_change_zindex = null;
	window.content_property.on_rect_changed = null;
	window.content_property.on_display_value_changed = null;
	window.content_property.on_change_whole_split = null;
	window.content_property.assign_view_setting = assignViewSetting;
	window.content_property.assign_content_property = assignContentProperty;

	window.content_property.update_display_value = function () {
		window.content_property.on_display_value_change();
	};
	window.content_property.update_whole_split = function (x, y, flag) {
		window.content_property.on_change_whole_split(x, y, flag);
	};
	

}(window.controller_gui));