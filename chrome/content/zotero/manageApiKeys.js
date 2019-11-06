/*
    ***** BEGIN LICENSE BLOCK *****

    Copyright © 2009 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org

    This file is part of Zotero.

    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.

    ***** END LICENSE BLOCK *****
*/

Components.utils.import("resource://gre/modules/osfile.jsm");

let ZoteroManageApiKeys = new function () {
	this.onLoad = onLoad;
	this.onUnload = onUnload;
	this.saveApiKey = saveApiKey;
	this.deleteApiKey = deleteApiKey;

	this.getSpringerKey = getSpringerKey;
	this.getElsevierKey = getElsevierKey;

	this.springerKey = "";
	this.elsevierKey = "";

	this.springerInputChanged = springerInputChanged;
	this.elsevierInputChanged = elsevierInputChanged;

	async function onLoad() {
		// Set font size from pref
		var apiKeysContainer = document.getElementById('zotero-manage-api-keys-container');
		Zotero.setFontSize(apiKeysContainer);

		let apiKeys = await _loadApiKeysFile();
		if (apiKeys) {
			apiKeys = JSON.parse(apiKeys);
		}
		else {
			return;
		}

		let springerKey = document.getElementById('springer-api-key');
		if (apiKeys.springer) {
			springerKey.value = "";
			this.springerKey = "";
		}

		let elsevierKey = document.getElementById('elsevier-api-key');
		if (apiKeys.elsevier) {
			elsevierKey.value = "";
			this.elsevierKey = "";
		}
	}

	function onUnload() {
		// Unregister search from Notifier
	}


	/**
	 *
	 * @param event
	 * @returns {Promise<void>}
	 */
	async function springerInputChanged(event) {
		let springerKey = document.getElementById('springer-api-key');

		this.springerKey = springerKey.value;
	}

	/**
	 *
	 * @param event
	 */
	function elsevierInputChanged(event) {
		let elsevierKey = document.getElementById('elsevier-api-key');

		this.elsevierKey = elsevierKey.value;
	}

	/**
	 * Store api key to api keys file
	 * @param type {string}
	 */
	async function saveApiKey(provider) {
		let content = await _loadApiKeysFile();

		if (content) {
			content = JSON.parse(content);
		}

		if (provider == "springer" && content) {
			content.springer = this.springerKey;
		}
		else if (provider == "springer" && !content) {
			let apiKeys = {
				springer: this.springerKey
			};

			await _writeToApiKeysFile(apiKeys);
			return;
		}

		if (provider == "elsevier" && content) {
			content.elsevier = this.elsevierKey;
		}
		else if (provider == "elsevier" && !content) {
			let apiKeys = {
				elsevier: this.elsevierKey
			};

			await _writeToApiKeysFile(apiKeys);
			return;
		}

		await _writeToApiKeysFile(content);
	}

	/**
	 * Delete api key from api keys file
	 * @param provider
	 */
	async function deleteApiKey(provider) {
		let content = await _loadApiKeysFile();

		if (content) {
			content = JSON.parse(content);
		}
		else {
			return;
		}

		if (provider === "springer" && content) {
			let springerKey = document.getElementById('springer-api-key');

			content.springer = "";
			springerKey.value = content.springer;
		}

		if (provider === "elsevier" && content) {
			let elsevierKey = document.getElementById('elsevier-api-key');

			content.elsevier = "";
			elsevierKey.value = content.elsevier;
		}

		await _writeToApiKeysFile(content);
	}

	/**
	 *
	 * @private
	 */
	async function _loadApiKeysFile() {
		let profileDir = OS.Constants.Path.profileDir;
		let apiKeysPath = OS.Path.join(profileDir, "apiKeys.json");

		if (!await OS.File.exists(apiKeysPath)) {
			return false;
		}

		let content = await Zotero.File.getContentsAsync(apiKeysPath);
		return content;
	}

	async function _writeToApiKeysFile(data) {
		let profileDir = OS.Constants.Path.profileDir;
		let apiKeysFile = OS.Path.join(profileDir, "apiKeys.json");

		try {
			await Zotero.File.putContentsAsync(apiKeysFile, JSON.stringify(data));
		}
		catch (error) {
			Zotero.debug("Error writing to file : " + error);
		}
	}

	async function getSpringerKey() {
		let content = await _loadApiKeysFile();

		if(content) {
			content = JSON.parse(content);
		}

		return content.springer;
	}

	async function getElsevierKey() {
		let content = await _loadApiKeysFile();

		if(content) {
			content = JSON.parse(content);
		}

		return content.springer;
	}
};
