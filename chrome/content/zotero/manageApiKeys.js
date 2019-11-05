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

	async function onLoad() {
		// Set font size from pref
		var apiKeysContainer = document.getElementById('zotero-manage-api-keys-box-container');
		Zotero.setFontSize(apiKeysContainer);

		let apiKeys = await _loadZoteroApiKeysFile();

		let springerKey = document.getElementById('springer-api-link-key');
		if(apiKeys.springerKey) {
			springerKey.setAttribute('value', apiKeys.springerKey);
		}

		let elsevierKey = document.getElementById('elsevier-api-link-key');
		if(apiKeys.elsevierKey) {
			elsevierKey.setAttribute('value', apiKeys.elsevierKey);
		}
	}

	function onUnload() {
		// Unregister search from Notifier
	}


	/**
	 * Store api key to api keys file
	 * @param type {string}
	 */
	function saveApiKey(provider) {
		Zotero.debug('saving api key for: ' + provider);
	}

	/**
	 * Delete api key from api keys file
	 * @param provider
	 */
	function deleteApiKey(provider) {
		Zotero.debug('deleting api key for: ' + provider);
	}

	/**
	 *
	 * @private
	 */
	async function _loadZoteroApiKeysFile() {
		let profileDir = OS.Constants.Path.profileDir;
		let fileContent;

		// Read in prefs
		let apiKeysFile = OS.Path.join(profileDir, "apiKeys.json");

		if (OS.File.exists(apiKeysFile)) {
			fileContent = await OS.File.read(apiKeysFile);
			Zotero.debug('api keys file exists: ' + fileContent);
		} else {
			fileContent = OS.File.open(apiKeysFile);
			Zotero.debug('api keys file does not exist: ' + fileContent);
		}

		return fileContent;
	}
};
